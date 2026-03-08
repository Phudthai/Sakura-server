/**
 * @file auction-scraper.service.ts
 * @description Yahoo Auctions Japan scraper service
 * @module @sakura/api/services
 *
 * @author Sakura Team
 * @created 2026-03-07
 */

import axios from 'axios'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
}

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
const axiosInstance = proxyUrl
  ? axios.create({
      httpsAgent: new HttpsProxyAgent(proxyUrl),
      httpAgent: new HttpProxyAgent(proxyUrl),
      headers: BROWSER_HEADERS,
    })
  : axios.create({ headers: BROWSER_HEADERS })

export interface ScrapeResult {
  itemId: string
  title: string
  currentPrice: number
  endTime: string | null
  imageUrl: string | null
  bidCount: number
  partial?: boolean
}

function extractNextData(html: string): Record<string, unknown> | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function extractMetaFallback(html: string): { title: string | null; imageUrl: string | null } {
  const get = (property: string) => {
    const m = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]+)"`))
    return m?.[1] ?? null
  }
  return { title: get('og:title'), imageUrl: get('og:image') }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAuctionFields(data: Record<string, unknown>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (data as any)?.props?.pageProps
  if (!props) return null

  // Primary path (confirmed via debug)
  const primary = props.initialState?.item?.detail?.item
  if (primary?.price !== undefined) return primary

  // Legacy / alternate paths
  return (
    props.auction ??
    props.item ??
    props.initialData?.auction ??
    props.initialData?.item ??
    null
  )
}

export async function scrapeYahooAuction(url: string): Promise<ScrapeResult> {
  const parsed = new URL(url)
  const pathParts = parsed.pathname.split('/').filter(Boolean)
  const itemId = pathParts[pathParts.length - 1]

  const res = await axiosInstance.get<string>(url, {
    responseType: 'text',
    validateStatus: () => true,
  })
  if (res.status !== 200) {
    throw new Error(`Yahoo ตอบกลับด้วย status ${res.status} — อาจถูก block หรือสินค้าหมดแล้ว`)
  }
  const html = res.data

  const nextData = extractNextData(html)
  const auction = nextData ? extractAuctionFields(nextData) : null

  if (auction) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgArr: any[] = Array.isArray(auction.img)
      ? auction.img
      : Array.isArray(auction.images)
        ? auction.images
        : Array.isArray(auction.imageUrls)
          ? auction.imageUrls
          : []

    const firstImage = imgArr[0]
    const imageUrl: string | null =
      typeof firstImage === 'string'
        ? firstImage
        : typeof firstImage === 'object' && firstImage !== null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? ((firstImage as any).image ?? (firstImage as any).url ?? null)
          : null

    return {
      itemId,
      title: auction.title ?? auction.name ?? 'ไม่ทราบชื่อสินค้า',
      currentPrice: Number(auction.price ?? auction.currentPrice ?? auction.initPrice ?? 0),
      endTime: auction.endTime ?? auction.closeDate ?? null,
      imageUrl,
      bidCount: Number(auction.bids ?? auction.biddersNum ?? auction.bidCount ?? 0),
    }
  }

  // Fallback: og: meta tags
  const meta = extractMetaFallback(html)
  if (meta.title) {
    return {
      itemId,
      title: meta.title,
      currentPrice: 0,
      endTime: null,
      imageUrl: meta.imageUrl,
      bidCount: 0,
      partial: true,
    }
  }

  throw new Error('ไม่พบข้อมูลสินค้าในหน้านี้ — Yahoo อาจเปลี่ยน format หน้าเว็บแล้ว')
}
