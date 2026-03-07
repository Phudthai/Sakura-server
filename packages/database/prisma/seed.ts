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

  const adminPassword = await hash('Admin123!', 12)
  const userPassword = await hash('password123', 12)

  const admin = await prisma.user.create({
    data: {
      email: 'admin@sakura.local',
      password: adminPassword,
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
      email: 'staff@sakura.local',
      password: userPassword,
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
      email: 'customer@example.com',
      password: userPassword,
      name: 'John Doe',
      phone: '08-3333-3333',
      role: UserRole.CUSTOMER,
      isEmailVerified: true,
      isActive: true,
    },
  })
  console.log('✅ Customer: customer@example.com')

  console.log('👥 Creating staffs...')
  await prisma.staff.createMany({
    data: [
      { name: 'สมชาย ใจดี' },
      { name: 'สมหญิง รักงาน' },
    ],
  })
  console.log('✅ Staffs created')

  console.log('\n✅ Seeding completed!')
  console.log('\n🔐 Test Credentials:')
  console.log('Admin: admin@sakura.local / Admin123!')
  console.log('Staff: staff@sakura.local / password123')
  console.log('Customer: customer@example.com / password123')
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
