/**
 * @file auction-cron.job.ts
 * @description Cron job for polling Yahoo Auction prices
 * @module @sakura/api/jobs
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

import cron from 'node-cron'
import { prisma } from '../../packages/database/src'
import { jpyToBaht } from '../../packages/shared/src'
import { scrapeYahooAuction } from '../services/auction-scraper.service'

export function startAuctionCron(): void {
  const intervalSeconds = parseInt(process.env.AUCTION_POLL_INTERVAL_SECONDS ?? '30')
  const schedule = `*/${intervalSeconds} * * * * *` // node-cron 6-field: second minute hour day month weekday

  console.log(`[AuctionCron] Starting — polling every ${intervalSeconds} second(s) (pending + tracking)`)

  cron.schedule(schedule, async () => {
    console.log('[AuctionCron] Running price check...')

    // Fetch all pending requests that haven't ended yet
    const actives = await prisma.auctionRequest.findMany({
      where: { status: 'pending', endTime: { gt: new Date() } },
    })

    const testMode = process.env.AUCTION_CRON_TEST_MODE === 'true'

    for (const ar of actives) {
      try {
        let newPrice: number

        if (testMode) {
          // โหมดทดสอบ: ไม่ scrape จริง แค่ +1 เพื่อตรวจว่า update ทำงาน
          newPrice = (ar.currentPrice ?? 0) + 1
          console.log(`[AuctionCron] TEST MODE: simulating price update for #${ar.id}`)
        } else {
          const data = await scrapeYahooAuction(ar.url)
          newPrice = data.currentPrice
        }

        if (ar.currentPrice !== newPrice) {
          await prisma.auctionRequest.update({
            where: { id: ar.id },
            data: { currentPrice: newPrice, currentPriceBaht: jpyToBaht(newPrice) },
          })
          console.log(`[AuctionCron] Price updated for #${ar.id}: ${ar.currentPrice ?? '?'} → ${newPrice}`)
        }
      } catch (err) {
        if (testMode) {
          // โหมดทดสอบ: แม้ scrape fail ก็ให้ +1 เพื่อทดสอบ
          const newPrice = (ar.currentPrice ?? 0) + 1
          await prisma.auctionRequest.update({
            where: { id: ar.id },
            data: { currentPrice: newPrice, currentPriceBaht: jpyToBaht(newPrice) },
          })
          console.log(`[AuctionCron] TEST MODE: scrape failed, simulated update for #${ar.id}: ${ar.currentPrice ?? '?'} → ${newPrice}`)
        } else {
          console.error(`[AuctionCron] Failed to scrape #${ar.id}:`, err instanceof Error ? err.message : err)
        }
      }
    }

    // Complete expired requests + set bidResult
    const expired = await prisma.auctionRequest.findMany({
      where: { status: 'pending', endTime: { lte: new Date() } },
    })

    for (const ar of expired) {
      const lastApprovedBid = await prisma.auctionPriceLog.findFirst({
        where: { auctionRequestId: ar.id, status: 'approved' },
        orderBy: { recordedAt: 'desc' },
      })

      const bidResult = lastApprovedBid && lastApprovedBid.price >= (ar.currentPrice ?? 0) ? 'won' : 'lost'

      await prisma.auctionRequest.update({
        where: { id: ar.id },
        data: { status: 'completed', bidResult },
      })

      console.log(`[AuctionCron] Completed #${ar.id} — bidResult: ${bidResult}`)
    }

    if (expired.length > 0) {
      console.log(`[AuctionCron] Completed ${expired.length} expired auction(s)`)
    }

    console.log(`[AuctionCron] Done — checked ${actives.length} active auction(s)`)
  })
}
