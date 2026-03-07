# Sakura API — คู่มือ Deploy

## 1. สิ่งที่ต้องเตรียมก่อน Deploy

### 1.1 PostgreSQL Database
- ต้องมี PostgreSQL (รุ่น 14 ขึ้นไป)
- สร้าง database ใหม่ เช่น `sakura_prod`
- เก็บ **connection string** ไว้ใช้ใน `DATABASE_URL`

รูปแบบ connection string:
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

ตัวอย่าง (Railway, Supabase, Neon, etc.):
```
postgresql://postgres:xxxxx@xxx.railway.app:5432/railway
```

---

### 1.2 Environment Variables ที่ต้องตั้งค่า

| ตัวแปร | บังคับ | ค่าเริ่มต้น | หมายเหตุ |
|--------|--------|-------------|----------|
| `NODE_ENV` | ใช่ | `production` | ตั้งเป็น `production` ตอน deploy |
| `DATABASE_URL` | ใช่ | — | Connection string ของ PostgreSQL |
| `JWT_SECRET` | ใช่ | — | **ต้องเปลี่ยน** — สร้างค่าลับยาวๆ (อย่างน้อย 32 ตัวอักษร) |
| `API_PORT` หรือ `PORT` | ไม่ | `4000` | พอร์ตที่ server จะรัน (Railway/Render ใช้ `PORT`) |
| `AUCTION_POLL_INTERVAL_SECONDS` | ไม่ | `30` | Cron ตรวจราคาทุกกี่วินาที (production แนะนำ 180 = 3 นาที) |
| `AUCTION_CRON_TEST_MODE` | ไม่ | `false` | **ต้องเป็น false** ตอน production |

---

## 2. ค่าที่ต้องเปลี่ยนก่อน Deploy จริง

### JWT_SECRET
สร้างค่าลับใหม่ (ห้ามใช้ค่าจาก development):

```bash
# สร้าง random string 64 ตัวอักษร (Linux/Mac)
openssl rand -base64 48
```

หรือใช้เครื่องมือออนไลน์สร้าง random string ยาวๆ แล้วใส่ใน `JWT_SECRET`

**สำคัญ:** ค่า `JWT_SECRET` ต้องตรงกันระหว่าง Backend กับ Frontend ถ้า Frontend ใช้ JWT ด้วย

---

## 3. ขั้นตอน Deploy

### 3.1 รัน Migration ก่อน (ครั้งแรก)

```bash
# ตั้ง DATABASE_URL ใน .env ก่อน
npx prisma migrate deploy
```

หรือถ้าใช้ `db push` (ไม่แนะนำ production):
```bash
npx prisma db push
```

### 3.2 Seed ข้อมูลเริ่มต้น (ถ้าต้องการ)

```bash
npm run db:seed
```

จะสร้าง admin user: `admin@sakura.local` / `Admin123!`

### 3.3 Build และ Start

```bash
npm install --omit=dev
npm run db:generate
npm start
```

---

## 4. Deploy บน Platform ต่างๆ

### Railway

1. สร้าง project ใหม่ → Add PostgreSQL
2. Add Service → Deploy from GitHub (หรือ Dockerfile)
3. ตั้ง Environment Variables:
   - `DATABASE_URL` — Railway จะสร้างให้อัตโนมัติถ้าเพิ่ม PostgreSQL
   - `JWT_SECRET` — สร้างค่าลับใหม่
   - `NODE_ENV` = `production`
4. ตั้ง Root Directory เป็น root ของ repo
5. Build Command: `npm install && npx prisma generate`
6. Start Command: `npx prisma migrate deploy && npm start`

### Render

1. New → Web Service
2. Connect repo
3. Environment: `Node`
4. Build: `npm install && npx prisma generate`
5. Start: `npx prisma migrate deploy && npm start`
6. ตั้ง `DATABASE_URL`, `JWT_SECRET` ใน Environment

### VPS (Ubuntu) + PM2

```bash
# บน server
git clone <repo>
cd Sakura-server
npm install --omit=dev
npx prisma generate
npx prisma migrate deploy

# ตั้ง .env
cp .env.example .env
nano .env  # แก้ DATABASE_URL, JWT_SECRET

# รันด้วย PM2
npm install -g pm2
pm2 start npm --name "sakura-api" -- start
pm2 save
pm2 startup
```

---

## 5. ตรวจสอบหลัง Deploy

1. **Health check:** เปิด `https://your-domain.com/health` ควรได้ `{"status":"ok",...}`
2. **Test DB:** เปิด `https://your-domain.com/api/test-db` ควรได้ `{"success":true,...}`
3. **Login:** ทดสอบ `POST /api/auth/login` ด้วย admin credentials

---

## 6. CORS (ถ้า Frontend อยู่คนละ domain)

ถ้า Frontend อยู่ domain อื่น ต้องตั้ง CORS ใน `src/index.ts`:

```typescript
app.use(cors({
  origin: ['https://your-frontend.vercel.app', 'https://your-domain.com'],
  credentials: true
}))
```

---

## 7. Checklist สรุป

- [ ] สร้าง PostgreSQL database
- [ ] ตั้ง `DATABASE_URL` ให้ถูกต้อง
- [ ] สร้าง `JWT_SECRET` ใหม่ (ห้ามใช้ dev)
- [ ] ตั้ง `NODE_ENV=production`
- [ ] ตั้ง `AUCTION_CRON_TEST_MODE=false`
- [ ] รัน `prisma migrate deploy`
- [ ] (Optional) รัน `npm run db:seed` สำหรับ admin
- [ ] ทดสอบ `/health` และ `/api/test-db`
