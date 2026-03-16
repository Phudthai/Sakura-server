/**
 * @file lot-cron.job.ts
 * @description Cron job for auto-creating new lots when previous lot ends
 * @module @sakura/api/jobs
 *
 * Schedule: LOT_CRON_SCHEDULE env (default 00:05 daily). For testing: * * * * * (every 1 min).
 * After testing, set LOT_CRON_SCHEDULE=5 0 * * * or remove from .env.
 */

import cron from 'node-cron'
import { ensureNextLotExists } from '../services/lot.service'

export function startLotCron(): void {
  const schedule = process.env.LOT_CRON_SCHEDULE ?? '5 0 * * *' // default: 00:05 daily

  console.log(`[LotCron] Starting — schedule: ${schedule}`)

  cron.schedule(schedule, async () => {
    console.log('[LotCron] Running lot auto-create...')

    for (const intlShippingType of ['air', 'sea'] as const) {
      try {
        const result = await ensureNextLotExists(intlShippingType)
        if (result.created && result.lotCode) {
          console.log(`[LotCron] ${intlShippingType}: Created ${result.lotCode}`)
        } else {
          console.log(`[LotCron] ${intlShippingType}: No new lot needed, skip`)
        }
      } catch (err) {
        console.error(`[LotCron] ${intlShippingType} failed:`, err instanceof Error ? err.message : err)
      }
    }

    console.log('[LotCron] Done')
  })
}
