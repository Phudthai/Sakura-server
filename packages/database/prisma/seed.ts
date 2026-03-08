/**
 * @file seed.ts
 * @description Database seeding — Users + Staff only
 *
 * @usage
 * ```bash
 * npm run db:seed
 * ```
 */

import { PrismaClient, UserRole } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  await prisma.paymentTransaction.deleteMany()
  await prisma.paymentObligation.deleteMany()
  await prisma.deliveryStage.deleteMany()
  await prisma.auctionPriceLog.deleteMany()
  await prisma.auctionRequest.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.user.deleteMany()
  console.log('🗑️  Cleared existing data')

  console.log('👤 Creating users...')

  const password = await hash('password123', 12)

  const admin = await prisma.user.create({
    data: {
      email: 'admin@sakura.com',
      password,
      name: 'Admin User',
      phone: '08-1111-1111',
      role: UserRole.ADMIN,
      isEmailVerified: true,
      isActive: true,
      userCode: 'ADMIN001',
      externalId: 'admin-001',
    },
  })
  console.log(`✅ Admin: ${admin.email}`)

  const staffUser = await prisma.user.create({
    data: {
      email: 'staff@sakura.com',
      password,
      name: 'Staff User',
      phone: '08-2222-2222',
      role: UserRole.STAFF,
      isEmailVerified: true,
      isActive: true,
    },
  })
  console.log(`✅ Staff user: ${staffUser.email}`)

  await prisma.user.create({
    data: {
      email: 'customer@sakura.com',
      password,
      name: 'John Doe',
      phone: '08-3333-3333',
      role: UserRole.CUSTOMER,
      isEmailVerified: true,
      isActive: true,
    },
  })
  console.log('✅ Customer: customer@sakura.com')

  console.log('👥 Creating staffs...')
  await prisma.staff.createMany({
    data: [
      { name: 'สมชาย ใจดี' },
      { name: 'สมหญิง รักงาน' },
    ],
  })
  console.log('✅ Staffs created')

  console.log('💰 Creating payment obligation types...')
  const obligationTypes = [
    { code: 'PRODUCT_FULL', nameTh: 'ค่าสินค้า', nameEn: 'Product' },
    { code: 'INTL_SHIPPING', nameTh: 'ค่าจัดส่งข้ามประเทศ', nameEn: 'International shipping' },
    { code: 'DOMESTIC_SHIPPING', nameTh: 'ค่าจัดส่งในไทย', nameEn: 'Domestic shipping' },
    { code: 'WALLET_TOPUP', nameTh: 'เติมเงินเข้ากระเป๋า Wallet บัญชี', nameEn: 'Wallet top-up' },
    { code: 'OVERPAYMENT_TO_WALLET', nameTh: 'โอนเงินเกินจำนวนสินค้า (ส่วนเกินเติมเข้ากระเป๋า Wallet)', nameEn: 'Overpayment to wallet' },
  ]
  for (const t of obligationTypes) {
    await prisma.paymentObligationType.upsert({
      where: { code: t.code },
      create: t,
      update: { nameTh: t.nameTh, nameEn: t.nameEn },
    })
  }
  console.log('✅ Payment obligation types created')

  console.log('📦 Creating delivery stage types...')
  const deliveryStageTypes = [
    { code: 'STAGE_1_JP_WAREHOUSE', nameTh: 'ส่งไปบ้านญี่ปุ่น', nameEn: 'To Japan warehouse', sortOrder: 1 },
    { code: 'STAGE_2_INTL_THAILAND', nameTh: 'ส่งข้ามประเทศมาที่ไทย', nameEn: 'International to Thailand', sortOrder: 2 },
    { code: 'STAGE_3_DOMESTIC_CUSTOMER', nameTh: 'ส่งไปที่บ้านลูกค้า', nameEn: 'Domestic to customer', sortOrder: 3 },
  ]
  for (const t of deliveryStageTypes) {
    await prisma.deliveryStageType.upsert({
      where: { code: t.code },
      create: t,
      update: { nameTh: t.nameTh, nameEn: t.nameEn, sortOrder: t.sortOrder },
    })
  }
  console.log('✅ Delivery stage types created')

  console.log('\n✅ Seeding completed!')
  console.log('\n🔐 Test Credentials (password: password123):')
  console.log('Admin: admin@sakura.com')
  console.log('Staff: staff@sakura.com')
  console.log('Customer: customer@sakura.com')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
