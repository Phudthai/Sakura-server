# Backend Tasks — Auction Tracking Feature

## ภาพรวม

ตอนนี้ Frontend ทำ scraping + tracking ไว้ใน memory (หายเมื่อ refresh)
เป้าหมายของ Backend คือทำให้ข้อมูลทนทาน (persist) ข้ามเซสชัน และให้ Backoffice เห็นคำขอทั้งหมดของลูกค้าได้

---

## 1. Database — Tables ที่ต้องเพิ่ม

### auction_requests
เก็บคำขอที่ลูกค้ากรอก URL มา

```sql
CREATE TABLE auction_requests (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact_name  VARCHAR(255),           -- ชื่อ / Line ID ที่ลูกค้าระบุ
  url           TEXT NOT NULL,           -- URL ที่ลูกค้าส่งมา
  yahoo_item_id VARCHAR(100),            -- เช่น "x1222069290"
  title         TEXT,                    -- ชื่อสินค้าจาก Yahoo
  image_url     TEXT,                    -- รูปสินค้า
  end_time      TIMESTAMPTZ,             -- เวลาประมูลสิ้นสุด
  status        VARCHAR(50) DEFAULT 'pending',
                                         -- pending / tracking / closed / cancelled
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### auction_price_logs
เก็บประวัติราคาทุกครั้งที่ cron ตรวจพบการเปลี่ยนแปลง

```sql
CREATE TABLE auction_price_logs (
  id                  SERIAL PRIMARY KEY,
  auction_request_id  INTEGER REFERENCES auction_requests(id) ON DELETE CASCADE,
  price               INTEGER NOT NULL,   -- ราคาในสกุล JPY
  bid_count           INTEGER DEFAULT 0,
  recorded_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. API Endpoints ที่ต้องสร้าง

### POST /api/auction-requests
รับ URL จาก Frontend → ดึงข้อมูลสินค้า → บันทึก DB → return ข้อมูลกลับ

```
Body:   { url: string, contactName?: string }
Auth:   Bearer token (ถ้า user login อยู่) หรือ optional
Return: { id, title, currentPrice, endTime, imageUrl, bidCount }
```

ขั้นตอน:
1. Validate URL (auctions.yahoo.co.jp เท่านั้น)
2. Fetch HTML จาก Yahoo + extract `__NEXT_DATA__`
3. บันทึก `auction_requests` row
4. บันทึก `auction_price_logs` record แรก
5. Return ข้อมูลสินค้าพร้อม `id`

---

### GET /api/auction-requests
ดึงรายการทั้งหมด (สำหรับ Backoffice + ลูกค้าดูของตัวเอง)

```
Query:  ?status=pending&page=1&limit=20
Auth:   Admin ดูได้ทั้งหมด, User ดูได้เฉพาะของตัวเอง
Return: { data: AuctionRequest[], total, page }
```

---

### GET /api/auction-requests/:id/price-logs
ดึงประวัติราคาของสินค้าชิ้นนั้น

```
Return: { logs: [{ price, bidCount, recordedAt }] }
```

---

### PATCH /api/auction-requests/:id
Backoffice อัปเดต status ของคำขอ

```
Body:   { status: "tracking" | "closed" | "cancelled" }
Auth:   Admin only
```

---

## 3. Cron Job — ติดตามราคาอัตโนมัติ

รัน cron ทุก **3-5 นาที** เพื่อ fetch ราคาล่าสุดจาก Yahoo สำหรับทุก auction_request ที่ `status = 'tracking'`

```
Logic:
  1. SELECT * FROM auction_requests WHERE status = 'tracking' AND end_time > NOW()
  2. สำหรับแต่ละ row: fetch Yahoo page → extract currentPrice
  3. SELECT price FROM auction_price_logs WHERE auction_request_id = ? ORDER BY recorded_at DESC LIMIT 1
  4. ถ้า price เปลี่ยน → INSERT auction_price_logs
  5. ถ้า end_time ผ่านไปแล้ว → UPDATE status = 'closed'
```

ใช้ library เช่น `node-cron` หรือ BullMQ สำหรับ queue

---

## 4. Scraper (ย้ายมาจาก Frontend)

ตอนนี้ Frontend ทำ scraping เองผ่าน Next.js API route
เมื่อ Backend พร้อม → Frontend จะเรียก Backend endpoint แทน Next.js route

Scraping logic อยู่ที่:
`src/app/api/auction/fetch/route.ts` ใน Sakura-frontend

→ Copy logic นี้ไปใส่ Backend service ใน Express

```typescript
// สิ่งที่ต้องทำใน Backend scraper
1. fetch(yahooUrl, { headers: { 'User-Agent': '...' } })
2. extract <script id="__NEXT_DATA__"> จาก HTML
3. parse JSON หา: title, currentPrice, endTime, imageUrl, bidCount
4. fallback: og:title / og:image จาก meta tags
```

---

## 5. การเชื่อมต่อกับ Frontend

เมื่อ Backend เสร็จ Frontend จะเปลี่ยน:

| ก่อน (ตอนนี้) | หลัง (เมื่อ Backend พร้อม) |
|---|---|
| `POST /api/auction/fetch` (Next.js route) | `POST /api/auction-requests` (Backend) |
| In-memory state (หายเมื่อ refresh) | Persistent DB |
| Polling ทุก 3 นาทีจาก Browser | Cron job Server-side |
| ข้อมูลหายเมื่อปิดหน้า | ลูกค้า reload มาก็เห็นข้อมูลเดิม |

---

## 6. Environment Variables ที่ Backend ต้องการ

```env
# Yahoo scraping (ไม่ต้อง key เพราะใช้ HTML parsing)
# ไม่มี config พิเศษ

# Cron interval (optional, default 3 min)
AUCTION_POLL_INTERVAL_MINUTES=3

# ถ้าใช้ proxy เพื่อหลีกเลี่ยง Yahoo block
HTTP_PROXY=http://...
```

---

## สรุป Priority

| Priority | งาน |
|---|---|
| P0 | สร้าง `auction_requests` + `auction_price_logs` tables |
| P0 | `POST /api/auction-requests` endpoint |
| P1 | Cron job scraping ทุก 3 นาที |
| P1 | `GET /api/auction-requests` (Backoffice list) |
| P2 | `GET /api/auction-requests/:id/price-logs` |
| P2 | `PATCH /api/auction-requests/:id` (status update) |
