/**
 * @file excel-import.service.ts
 * @description Import auction data from Excel on user registration
 * @module @sakura/api/services
 *
 * Reads B เมอคาริ กดเว็บ.xlsx sheets Bแอร์369, Cเรือ369
 * Maps rows by userId (column A = external_id)
 */

import * as XLSX from 'xlsx'
import * as path from 'path'
import { prisma } from '../../packages/database/src'
import { jpyToBaht } from '../../packages/shared/src'

const EXCEL_PATH = path.join(process.cwd(), 'public', 'B เมอคาริ กดเว็บ.xlsx')
const SHEET_AIR = 'Bแอร์369'
const SHEET_SEA = 'Cเรือ369'

const THAI_MONTH_MAP: Record<string, number> = {
  'ม.ค.': 1,
  'ก.พ.': 2,
  'มีนา': 3,
  'มี.ค.': 3,
  'เม.ย.': 4,
  'พ.ค.': 5,
  'มิ.ย.': 6,
  'ก.ค.': 7,
  'ส.ค.': 8,
  'ก.ย.': 9,
  'ต.ค.': 10,
  'พ.ย.': 11,
  'ธ.ค.': 12,
}

function getCell(row: unknown[], colIndex: number): string | number | null | undefined {
  const val = row[colIndex]
  if (val === null || val === undefined || val === '') return null
  return val as string | number
}

function parseExcelDate(val: unknown): Date | null {
  if (val === null || val === undefined) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    const excelEpoch = new Date(1899, 11, 30)
    return new Date(excelEpoch.getTime() + val * 86400000)
  }
  if (typeof val === 'string') {
    const parsed = new Date(val)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function parseLotToDeliveredAt(lotVal: unknown): Date | null {
  if (lotVal === null || lotVal === undefined) return null
  const str = String(lotVal).trim()
  const match = str.match(/ถึงไทยประมาณ(\d+)(มีนา|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/)
  if (!match) return null
  const day = parseInt(match[1], 10)
  const monthKey = match[2]
  const month = THAI_MONTH_MAP[monthKey]
  if (!month) return null
  const year = new Date().getFullYear()
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function toInt(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : Math.round(val)
  const n = parseInt(String(val).replace(/[^\d-]/g, ''), 10)
  return isNaN(n) ? null : n
}

function toString(val: unknown): string | null {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  return s === '' ? null : s
}

/** Strip query params (everything from ? onwards) */
function stripQueryParams(str: string): string {
  const idx = str.indexOf('?')
  return idx >= 0 ? str.slice(0, idx) : str
}

/** Extract item_id from Mercari URL, e.g. https://jp.mercari.com/item/m39992452601 -> m39992452601. Strips query params. */
function extractItemIdFromUrl(url: string): string | null {
  const cleaned = stripQueryParams(url.trim())
  if (!cleaned) return null
  const parts = cleaned.split('/').filter(Boolean)
  const last = parts.length > 0 ? parts[parts.length - 1] : null
  return last ? stripQueryParams(last) : null
}

/** Build Mercari image URL from item_id: https://static.mercdn.net/item/detail/orig/photos/{id}_1.jpg */
function buildMercariImageUrl(itemId: string): string {
  return `https://static.mercdn.net/item/detail/orig/photos/${itemId}_1.jpg`
}

interface ExcelRow {
  id: string | null
  userCode: string | null
  web: string | null
  title: string | null
  url: string | null
  imageUrl: string | null
  currentPrice: number | null
  productPriceBaht: number | null
  weightGram: number | null
  shippingAmount: number | null
  toJapanAt: Date | null
  lotDeliveredAt: Date | null
  buyDate: Date | null
  lotRaw: string | null
}

function parseRow(row: unknown[], shippingColIndex: number): ExcelRow {
  return {
    id: toString(getCell(row, 0)),
    userCode: toString(getCell(row, 1)),
    web: toString(getCell(row, 2)),
    title: toString(getCell(row, 4)),
    url: toString(getCell(row, 6)),
    imageUrl: toString(getCell(row, 7)),
    currentPrice: toInt(getCell(row, 8)),
    productPriceBaht: toInt(getCell(row, 9)),
    weightGram: toInt(getCell(row, 10)),
    shippingAmount: toInt(getCell(row, shippingColIndex)),
    toJapanAt: parseExcelDate(getCell(row, 14)),
    lotDeliveredAt: parseLotToDeliveredAt(getCell(row, 15)),
    buyDate: parseExcelDate(getCell(row, 18)),
    lotRaw: toString(getCell(row, 15)),
  }
}

export async function importFromExcel(userId: string, dbUserId: number): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = []
  let imported = 0

  try {
    const workbook = XLSX.readFile(EXCEL_PATH)
    const sheetNames = workbook.SheetNames

    const sheetsToProcess: { name: string; obligationCode: string; intlShippingType: string; shippingCol: number }[] = []
    if (sheetNames.includes(SHEET_AIR)) {
      sheetsToProcess.push({ name: SHEET_AIR, obligationCode: 'INTL_SHIPPING', intlShippingType: 'air', shippingCol: 11 })
    }
    if (sheetNames.includes(SHEET_SEA)) {
      sheetsToProcess.push({ name: SHEET_SEA, obligationCode: 'INTL_SHIPPING', intlShippingType: 'sea', shippingCol: 11 })
    }

    if (sheetsToProcess.length === 0) {
      errors.push(`Excel sheets "${SHEET_AIR}" or "${SHEET_SEA}" not found`)
      return { imported, errors }
    }

    const obligationTypes = await prisma.paymentObligationType.findMany({
      where: { code: { in: ['PRODUCT_FULL', 'INTL_SHIPPING'] } },
    })
    const obligationTypeMap = Object.fromEntries(obligationTypes.map((t) => [t.code, t.id]))

    const stageTypes = await prisma.deliveryStageType.findMany({ orderBy: { sortOrder: 'asc' } })
    const stage1 = stageTypes.find((s) => s.code === 'STAGE_1_JP_WAREHOUSE')
    const stage2 = stageTypes.find((s) => s.code === 'STAGE_2_INTL_THAILAND')
    if (!stage1 || !stage2) {
      errors.push('Delivery stage types not found')
      return { imported, errors }
    }

    for (const { name, obligationCode, intlShippingType, shippingCol } of sheetsToProcess) {
      const sheet = workbook.Sheets[name]
      if (!sheet) continue

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
      const headerRow = rows[0]
      const dataRows = rows.slice(1)

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i] as unknown[]
        const parsed = parseRow(row, shippingCol)

        if (parsed.id !== userId) continue

        if (!parsed.url) {
          errors.push(`Row ${i + 2} (${name}): url required`)
          continue
        }

        try {
          const obligationTypeId = obligationTypeMap[obligationCode]
          if (!obligationTypeId && parsed.shippingAmount != null && parsed.shippingAmount > 0) {
            errors.push(`Row ${i + 2}: obligation type ${obligationCode} not found`)
          }

          const urlClean = stripQueryParams(parsed.url)
          const itemId = extractItemIdFromUrl(urlClean)
          const imageUrl = itemId ? buildMercariImageUrl(itemId) : null

          const auctionRequest = await prisma.auctionRequest.create({
            data: {
              userId: dbUserId,
              url: urlClean,
              web: parsed.web ?? 'unknown',
              itemId,
              title: parsed.title,
              imageUrl,
              intlShippingType,
              currentPrice: parsed.currentPrice,
              currentPriceBaht: jpyToBaht(parsed.currentPrice),
              weightGram: parsed.weightGram,
              boughtAt: parsed.buyDate,
              lot: parsed.lotRaw,
              bidResult: 'won',
              status: 'completed',
            },
          })

          if (obligationTypeMap['PRODUCT_FULL'] != null && parsed.productPriceBaht != null && parsed.productPriceBaht > 0) {
            await prisma.paymentObligation.create({
              data: {
                auctionRequestId: auctionRequest.id,
                obligationTypeId: obligationTypeMap['PRODUCT_FULL'],
                amount: parsed.productPriceBaht,
                currency: 'THB',
                dueDate: parsed.buyDate,
                status: 'PENDING',
              },
            })
          }

          if (obligationTypeId != null && parsed.shippingAmount != null && parsed.shippingAmount > 0) {
            const shippingBaht = jpyToBaht(parsed.shippingAmount)
            await prisma.paymentObligation.create({
              data: {
                auctionRequestId: auctionRequest.id,
                obligationTypeId,
                amount: shippingBaht,
                currency: 'THB',
                dueDate: parsed.buyDate,
                status: 'PENDING',
              },
            })
          }

          await prisma.deliveryStage.createMany({
            data: stageTypes.map((st) => ({
              auctionRequestId: auctionRequest.id,
              stageTypeId: st.id,
              status: 'PENDING',
            })),
          })

          const createdIds = await prisma.deliveryStage.findMany({
            where: { auctionRequestId: auctionRequest.id },
            orderBy: { id: 'asc' },
          })

          if (parsed.toJapanAt && createdIds[0]) {
            await prisma.deliveryStage.update({
              where: { id: createdIds[0].id },
              data: { status: 'DELIVERED', deliveredAt: parsed.toJapanAt },
            })
          }
          if (parsed.lotDeliveredAt && createdIds[1]) {
            await prisma.deliveryStage.update({
              where: { id: createdIds[1].id },
              data: { status: 'DELIVERED', deliveredAt: parsed.lotDeliveredAt },
            })
          }

          imported++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`Row ${i + 2} (${name}): ${msg}`)
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`Excel read failed: ${msg}`)
  }

  return { imported, errors }
}
