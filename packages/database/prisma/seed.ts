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
