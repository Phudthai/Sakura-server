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
  await prisma.paymentReceipt.deleteMany()
  await prisma.paymentObligation.deleteMany()
  await prisma.walletTransaction.deleteMany()
  await prisma.userWallet.deleteMany()
  await prisma.deliveryStage.deleteMany()
  await prisma.auctionPriceLog.deleteMany()
  await prisma.purchaseRequest.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.user.deleteMany()
  await prisma.lot.deleteMany()
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
      is_email_verified: true,
      is_active: true,
      user_code: 'm000001',
      username: 'ADMIN001',
      external_id: 'admin-001',
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
      is_email_verified: true,
      is_active: true,
      user_code: 'm000002',
      username: 'STAFF001',
    },
  })
  console.log(`✅ Staff user: ${staffUser.email}`)

  const customer = await prisma.user.create({
    data: {
      email: 'customer@sakura.com',
      password,
      name: 'John Doe',
      phone: '08-3333-3333',
      role: UserRole.CUSTOMER,
      is_email_verified: true,
      is_active: true,
      user_code: 'm000003',
    },
  })
  console.log('✅ Customer: customer@sakura.com')

  console.log('💰 Creating user wallets...')
  for (const u of [admin, staffUser, customer]) {
    await prisma.userWallet.upsert({
      where: { user_id: u.id },
      create: { user_id: u.id, balance: 0, currency: 'THB' },
      update: {},
    })
  }
  console.log('✅ User wallets created')

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
    { code: 'PRODUCT_FULL', name_th: 'ค่าสินค้า', name_en: 'Product' },
    { code: 'INTL_SHIPPING', name_th: 'ค่าจัดส่งข้ามประเทศ', name_en: 'International shipping' },
    { code: 'DOMESTIC_SHIPPING', name_th: 'ค่าจัดส่งในไทย', name_en: 'Domestic shipping' },
    { code: 'WALLET_TOPUP', name_th: 'เติมเงินเข้ากระเป๋า Wallet บัญชี', name_en: 'Wallet top-up' },
    { code: 'OVERPAYMENT_TO_WALLET', name_th: 'โอนเงินเกินจำนวนสินค้า (ส่วนเกินเติมเข้ากระเป๋า Wallet)', name_en: 'Overpayment to wallet' },
  ]
  for (const t of obligationTypes) {
    await prisma.paymentObligationType.upsert({
      where: { code: t.code },
      create: t,
      update: { name_th: t.name_th, name_en: t.name_en },
    })
  }
  console.log('✅ Payment obligation types created')

  console.log('📦 Creating delivery stage types...')
  const deliveryStageTypes = [
    { code: 'STAGE_1_JP_WAREHOUSE', name_th: 'ส่งไปบ้านญี่ปุ่น', name_en: 'To Japan warehouse', sort_order: 1 },
    { code: 'STAGE_2_INTL_THAILAND', name_th: 'ส่งข้ามประเทศมาที่ไทย', name_en: 'International to Thailand', sort_order: 2 },
    { code: 'STAGE_3_DOMESTIC_CUSTOMER', name_th: 'ส่งไปที่บ้านลูกค้า', name_en: 'Domestic to customer', sort_order: 3 },
  ]
  for (const t of deliveryStageTypes) {
    await prisma.deliveryStageType.upsert({
      where: { code: t.code },
      create: t,
      update: { name_th: t.name_th, name_en: t.name_en, sort_order: t.sort_order },
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
