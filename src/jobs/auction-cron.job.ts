/**
 * @file auction-cron.job.ts
 * @description Cron job for polling Yahoo Auction prices
 * @module @sakura/api/jobs
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

import cron from "node-cron";
import { prisma } from "../../packages/database/src";
import { bahtRoundUp } from "../../packages/shared/src";
import { jpyToBaht } from "../services/exchange-rate.service";
import { scrapeYahooAuction } from "../services/auction-scraper.service";
import * as walletService from "../services/wallet.service";

export function startAuctionCron(): void {
  const intervalSeconds = parseInt(
    process.env.AUCTION_POLL_INTERVAL_SECONDS ?? "30",
  );
  const schedule = `*/${intervalSeconds} * * * * *`; // node-cron 6-field: second minute hour day month weekday

  console.log(
    `[AuctionCron] Starting — polling every ${intervalSeconds} second(s) (pending + tracking)`,
  );

  cron.schedule(schedule, async () => {
    console.log("[AuctionCron] Running price check...");

    // Fetch all pending requests that haven't ended yet
    const actives = await prisma.auctionRequest.findMany({
      where: { status: "pending", end_time: { gt: new Date() } },
    });

    const testMode = process.env.AUCTION_CRON_TEST_MODE === "true";

    for (const ar of actives) {
      try {
        let newPrice: number;

        if (testMode) {
          // โหมดทดสอบ: ไม่ scrape จริง แค่ +1 เพื่อตรวจว่า update ทำงาน
          newPrice = (ar.current_price ?? 0) + 1;
          console.log(
            `[AuctionCron] TEST MODE: simulating price update for #${ar.id}`,
          );
        } else {
          const data = await scrapeYahooAuction(ar.url);
          newPrice = data.currentPrice;
        }

        if (ar.current_price !== newPrice) {
          await prisma.auctionRequest.update({
            where: { id: ar.id },
            data: {
              current_price: newPrice,
              current_price_baht: jpyToBaht(newPrice),
            },
          });
          console.log(
            `[AuctionCron] Price updated for #${ar.id}: ${ar.current_price ?? "?"} → ${newPrice}`,
          );
        }
      } catch (err) {
        if (testMode) {
          // โหมดทดสอบ: แม้ scrape fail ก็ให้ +1 เพื่อทดสอบ
          const newPrice = (ar.current_price ?? 0) + 1;
          await prisma.auctionRequest.update({
            where: { id: ar.id },
            data: {
              current_price: newPrice,
              current_price_baht: jpyToBaht(newPrice),
            },
          });
          console.log(
            `[AuctionCron] TEST MODE: scrape failed, simulated update for #${ar.id}: ${ar.current_price ?? "?"} → ${newPrice}`,
          );
        } else {
          console.error(
            `[AuctionCron] Failed to scrape #${ar.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    // Complete expired requests + set bid_result
    const expired = await prisma.auctionRequest.findMany({
      where: { status: "pending", end_time: { lte: new Date() } },
    });

    const productFullType = await prisma.paymentObligationType.findUnique({
      where: { code: "PRODUCT_FULL" },
    });

    for (const ar of expired) {
      const lastApprovedBid = await prisma.auctionPriceLog.findFirst({
        where: { auction_request_id: ar.id, status: "approved" },
        orderBy: { recorded_at: "desc" },
      });

      const bidResult =
        lastApprovedBid && lastApprovedBid.price >= (ar.current_price ?? 0)
          ? "won"
          : "lost";

      const boughtAt = ar.end_time ?? new Date();

      await prisma.$transaction(async (tx) => {
        await tx.auctionRequest.update({
          where: { id: ar.id },
          data: {
            status: "completed",
            bid_result: bidResult,
            bought_at: boughtAt,
          },
        });

        if (
          bidResult === "won" &&
          productFullType &&
          (ar.current_price_baht ?? 0) > 0
        ) {
          const existingProductObligation = await tx.paymentObligation.findFirst(
            {
              where: {
                auction_request_id: ar.id,
                obligation_type_id: productFullType.id,
              },
            },
          );
          if (!existingProductObligation) {
            await tx.paymentObligation.create({
              data: {
                auction_request_id: ar.id,
                user_id: ar.user_id ?? undefined,
                obligation_type_id: productFullType.id,
                amount: bahtRoundUp(ar.current_price_baht!),
                currency: "THB",
                due_date: boughtAt,
                status: "PENDING",
              },
            });
            console.log(
              `[AuctionCron] Created PRODUCT_FULL obligation for #${ar.id}`,
            );
          }
        }
      });

      // Auto-sweep wallet: ตัดเงินใน wallet ไปปิดยอด obligations ตาม priority (เหมือน approve slip)
      if (bidResult === "won" && ar.user_id) {
        try {
          const sweep = await walletService.sweepWalletToObligations({
            userId: ar.user_id,
            sweepKey: `auction-end-ar-${ar.id}`,
          });
          if (sweep.totalPaid > 0) {
            console.log(
              `[AuctionCron] Wallet sweep for user #${ar.user_id}: paid ${sweep.totalPaid} THB, ` +
              `fully closed ${sweep.obligationsPaid.length} obligation(s)`,
            );
          }
        } catch (err) {
          console.error(
            `[AuctionCron] Wallet sweep error for auction #${ar.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      console.log(
        `[AuctionCron] Completed #${ar.id} — bidResult: ${bidResult}`,
      );
    }

    if (expired.length > 0) {
      console.log(
        `[AuctionCron] Completed ${expired.length} expired auction(s)`,
      );
    }

    console.log(
      `[AuctionCron] Done — checked ${actives.length} active auction(s)`,
    );
  });
}
