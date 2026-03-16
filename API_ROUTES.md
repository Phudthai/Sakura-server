# Sakura API Routes

Base URL: `http://localhost:4000` (หรือตาม `API_PORT`)

Base path: `/api` (หรือตาม `API_BASE_PATH` ใน `.env`)

---

## Enduser API

**Prefix:** `{API_BASE_PATH}/enduser` (default: `/api/enduser`)

ใช้สำหรับลูกค้า (CUSTOMER) และผู้ใช้ทั่วไป

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/enduser/auth/login` | - | ล็อกอิน — รับทุก role |
| POST | `/api/enduser/auth/register` | - | สมัครสมาชิก (สร้าง CUSTOMER) |
| GET | `/api/enduser/auth/me` | Bearer | ดูข้อมูล user ปัจจุบัน |

### Auction Requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/enduser/auction-requests` | Optional | สร้างคำขอประมูล (body: url, firstBidPrice optional, intl_shipping_type required: air/sea) |
| GET | `/api/enduser/auction-requests` | Bearer | รายการคำขอ (User เห็นเฉพาะของตัวเอง, Admin/Staff เห็นทั้งหมด) |
| GET | `/api/enduser/auction-requests/:id/price-logs` | Bearer | ประวัติราคา |
| POST | `/api/enduser/auction-requests/:id/bids` | Bearer | ส่ง bid |
| POST | `/api/enduser/auction-requests/:id/mock` | Bearer | Mock (dev) — outbid / end-time |

---

## Backoffice API

**Prefix:** `{API_BASE_PATH}/backoffice` (default: `/api/backoffice`)

ใช้สำหรับ Admin/Staff เท่านั้น — ทุก endpoint ต้อง Bearer token (ADMIN หรือ STAFF)

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/backoffice/auth/login` | - | ล็อกอิน Backoffice — **reject CUSTOMER** (403) |
| GET | `/api/backoffice/auth/me` | Bearer (ADMIN/STAFF) | ดูข้อมูล user ปัจจุบัน |

### Auction Requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/backoffice/auction-requests` | Bearer (ADMIN/STAFF) | รายการทั้งหมด + query `user_code`, `status`, `delivery_stage` (0=type1 PENDING, 1+=type_id DELIVERED), `shipping_type` (air/sea) |
| POST | `/api/backoffice/auction-requests` | Bearer (ADMIN/STAFF) | สร้างคำขอ (body: url, firstBidPrice optional, intl_shipping_type required: air/sea) |
| PATCH | `/api/backoffice/auction-requests/:id/note` | Bearer (ADMIN/STAFF) | อัปเดต note |
| PATCH | `/api/backoffice/auction-requests/:id/lot` | Bearer (ADMIN/STAFF) | กำหนด lot ให้ auction request (body: `lot_id` หรือ `null` เพื่อลบ) |
| PATCH | `/api/backoffice/auction-requests/:id/weight-gram` | Bearer (ADMIN/STAFF) | อัปเดต weight_gram, ตั้ง delivery type 1 เป็น DELIVERED, assign current lot ตาม intl_shipping_type |
| PATCH | `/api/backoffice/auction-requests/:id` | Bearer (ADMIN/STAFF) | อัปเดต status |

### Lots (จัดส่ง)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/backoffice/lots` | Bearer (ADMIN/STAFF) | รายการ lots (query: page, limit, intl_shipping_type) |
| POST | `/api/backoffice/lots` | Bearer (ADMIN/STAFF) | สร้าง lot (body: lot_code, intl_shipping_type air/sea, start_lot_at/end_lot_at/arrive_at optional) |
| PATCH | `/api/backoffice/lots/:id` | Bearer (ADMIN/STAFF) | อัปเดต lot |

### Bids

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/backoffice/pending-bids` | Bearer (ADMIN/STAFF) | รายการ bid รอ approve |
| PATCH | `/api/backoffice/bids/:id/approve` | Bearer (ADMIN/STAFF) | อนุมัติ bid |
| PATCH | `/api/backoffice/bids/:id/reject` | Bearer (ADMIN/STAFF) | ปฏิเสธ bid |

### Staff

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/backoffice/staffs` | Bearer (ADMIN/STAFF) | รายชื่อ staff |
| POST | `/api/backoffice/staffs` | Bearer (ADMIN) | สร้าง staff |
| PATCH | `/api/backoffice/staffs/:id` | Bearer (ADMIN) | แก้ไข staff |

### Payment Obligations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/backoffice/payment-obligations/:id/slip` | Bearer (ADMIN/STAFF) | อัปโหลดสลิป (form-data: slip, slipReference) |

---

## อื่นๆ

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | - | Health check |
| GET | `/api/test-db` | - | ทดสอบ DB |
| GET | `/uploads/slips/*` | - | ไฟล์สลิป |

---

## สรุปการแยก Flow

| Flow | Base Path | ใช้สำหรับ |
|------|-----------|------------|
| **Enduser** | `/api/enduser` | ลูกค้า, แอปผู้ใช้ |
| **Backoffice** | `/api/backoffice` | แอดมิน, Staff, แอป Backoffice |

**หมายเหตุ:** ถ้าเปลี่ยน `API_BASE_PATH` ใน `.env` (เช่น `/v1`) ทุก path จะเป็น `/v1/enduser/...` และ `/v1/backoffice/...`

---

## user_code และ username

| Field | คำอธิบาย |
|-------|----------|
| **user_code** | Auto-generated (m000001, m000002...) — required, unique. ใช้ใน Backoffice |
| **username** | Optional display name (เดิมจาก user_code เช่น ADMIN001, CUST001) — unique ถ้ามี |

- **Register:** ส่ง `username` (optional) ได้ — จะเก็บใน field `username`. `user_code` ถูก generate อัตโนมัติ
- **Backoffice:** query/body `user_code` รองรับทั้ง userCode (m000001) และ username (CUST001) เพื่อความ backward compatible

---

## การเปลี่ยนแปลงจาก path เดิม (Migration)

| เดิม | ใหม่ |
|------|------|
| `/api/auth/*` | `/api/enduser/auth/*` |
| `/api/auction-requests/*` | `/api/enduser/auction-requests/*` |
| `/api/backoffice/*` | `/api/backoffice/*` (เหมือนเดิม) |
| `/api/payment-obligations/*` | `/api/backoffice/payment-obligations/*` |

**Frontend ที่ต้องแก้:**
- **Enduser app:** เปลี่ยน base path เป็น `/api/enduser`
- **Backoffice app:** เปลี่ยน base path เป็น `/api/backoffice` และใช้ `/api/backoffice/auth/login` แทน `/api/enduser/auth/login` สำหรับ admin/staff
