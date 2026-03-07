/**
 * @file seed.ts
 * @description Database seeding script
 *
 * @description
 * Populates database with initial data for development and testing.
 * Creates: Users (customer, admin, staff), Orders, Addresses, Payments
 *
 * @usage
 * ```bash
 * pnpm db:seed
 * ```
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

import { PrismaClient, UserRole, OrderStatus, PaymentStatus } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

/**
 * Main seed function
 *
 * @description
 * Seeds database with test data in the following order:
 * 1. Users (admin, staff, customers)
 * 2. Addresses
 * 3. Orders with items
 * 4. Payments
 * 5. Tracking information
 * 6. Notifications
 */
async function main() {
  console.log('🌱 Starting database seed...')

  // Clear existing data before re-seeding (order matters — children first)
  await prisma.trackingEvent.deleteMany()
  await prisma.tracking.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.address.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.session.deleteMany()
  await prisma.auctionPriceLog.deleteMany()
  await prisma.auctionRequest.deleteMany()
  await prisma.user.deleteMany()
  console.log('🗑️  Cleared existing seed data')

  // ==============================================
  // Create Users
  // ==============================================
  console.log('👤 Creating users...')

  const hashedPassword = await hash('password123', 12)

  // Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@sakura.com' },
    update: {},
    create: {
      email: 'admin@sakura.com',
      password: hashedPassword,
      name: 'Admin User',
      phone: '08-1111-1111',
      role: UserRole.ADMIN,
      isEmailVerified: true,
      isActive: true,
    },
  })
  console.log(`✅ Created admin: ${admin.email}`)

  // Staff user
  const staff = await prisma.user.upsert({
    where: { email: 'staff@sakura.com' },
    update: {},
    create: {
      email: 'staff@sakura.com',
      password: hashedPassword,
      name: 'Staff User',
      phone: '08-2222-2222',
      role: UserRole.STAFF,
      isEmailVerified: true,
      isActive: true,
    },
  })
  console.log(`✅ Created staff: ${staff.email}`)

  // Customer users
  const customer1 = await prisma.user.upsert({
    where: { email: 'customer1@example.com' },
    update: {},
    create: {
      email: 'customer1@example.com',
      password: hashedPassword,
      name: 'John Doe',
      phone: '08-3333-3333',
      role: UserRole.CUSTOMER,
      isEmailVerified: true,
      isActive: true,
    },
  })
  console.log(`✅ Created customer: ${customer1.email}`)

  const customer2 = await prisma.user.upsert({
    where: { email: 'customer2@example.com' },
    update: {},
    create: {
      email: 'customer2@example.com',
      password: hashedPassword,
      name: 'Jane Smith',
      phone: '08-4444-4444',
      role: UserRole.CUSTOMER,
      isEmailVerified: true,
      isActive: true,
    },
  })
  console.log(`✅ Created customer: ${customer2.email}`)

  // ==============================================
  // Create Addresses
  // ==============================================
  console.log('🏠 Creating addresses...')

  const address1 = await prisma.address.create({
    data: {
      userId: customer1.id,
      label: 'Home',
      fullAddress: '123 Sukhumvit Road, Khlong Toei Nuea',
      province: 'Bangkok',
      district: 'Watthana',
      postalCode: '10110',
      phone: '08-3333-3333',
      isDefault: true,
    },
  })
  console.log(`✅ Created address for ${customer1.name}`)

  const address2 = await prisma.address.create({
    data: {
      userId: customer2.id,
      label: 'Home',
      fullAddress: '456 Rama IV Road, Khlong Toei',
      province: 'Bangkok',
      district: 'Khlong Toei',
      postalCode: '10110',
      phone: '08-4444-4444',
      isDefault: true,
    },
  })
  console.log(`✅ Created address for ${customer2.name}`)

  // ==============================================
  // Create Orders
  // ==============================================
  console.log('📦 Creating orders...')

  // Order 1: Completed order
  const order1 = await prisma.order.create({
    data: {
      userId: customer1.id,
      orderNumber: 'SK-2026-00001',
      status: OrderStatus.COMPLETED,
      totalJPY: 15000,
      totalTHB: 3600,
      exchangeRate: 0.24,
      serviceFee: 540,
      shippingCost: 300,
      discount: 0,
      shippingAddressId: address1.id,
      paidAt: new Date('2026-03-01T10:00:00Z'),
      completedAt: new Date('2026-03-05T15:30:00Z'),
      items: {
        create: [
          {
            productName: 'Nintendo Switch OLED',
            productUrl: 'https://www.amazon.co.jp/dp/B09G9F123X',
            imageUrl: 'https://via.placeholder.com/300x300?text=Switch+OLED',
            priceJPY: 10000,
            quantity: 1,
            variant: 'White',
          },
          {
            productName: 'Pokemon Game Card',
            productUrl: 'https://www.amazon.co.jp/dp/B08H93ZRK9',
            imageUrl: 'https://via.placeholder.com/300x300?text=Pokemon',
            priceJPY: 5000,
            quantity: 1,
            variant: 'Standard Edition',
          },
        ],
      },
    },
    include: { items: true },
  })
  console.log(`✅ Created order: ${order1.orderNumber}`)

  // Order 2: In transit order
  const order2 = await prisma.order.create({
    data: {
      userId: customer2.id,
      orderNumber: 'SK-2026-00002',
      status: OrderStatus.SHIPPED_TO_TH,
      totalJPY: 8000,
      totalTHB: 1920,
      exchangeRate: 0.24,
      serviceFee: 288,
      shippingCost: 250,
      discount: 100,
      discountCode: 'WELCOME10',
      shippingAddressId: address2.id,
      paidAt: new Date('2026-03-03T14:00:00Z'),
      items: {
        create: [
          {
            productName: 'Japanese Manga Set (Vol 1-5)',
            productUrl: 'https://www.amazon.co.jp/dp/B07XYZ123',
            imageUrl: 'https://via.placeholder.com/300x300?text=Manga',
            priceJPY: 8000,
            quantity: 1,
            variant: 'Complete Set',
          },
        ],
      },
    },
    include: { items: true },
  })
  console.log(`✅ Created order: ${order2.orderNumber}`)

  // Order 3: Pending payment
  const order3 = await prisma.order.create({
    data: {
      userId: customer1.id,
      orderNumber: 'SK-2026-00003',
      status: OrderStatus.PENDING_PAYMENT,
      totalJPY: 3500,
      totalTHB: 840,
      exchangeRate: 0.24,
      serviceFee: 126,
      shippingCost: 150,
      discount: 0,
      shippingAddressId: address1.id,
      items: {
        create: [
          {
            productName: 'Japanese Snack Box',
            productUrl: 'https://www.amazon.co.jp/dp/B09SNACK1',
            imageUrl: 'https://via.placeholder.com/300x300?text=Snacks',
            priceJPY: 3500,
            quantity: 1,
          },
        ],
      },
    },
    include: { items: true },
  })
  console.log(`✅ Created order: ${order3.orderNumber}`)

  // ==============================================
  // Create Payments
  // ==============================================
  console.log('💳 Creating payments...')

  const payment1 = await prisma.payment.create({
    data: {
      orderId: order1.id,
      amount: 3600,
      currency: 'THB',
      method: 'CREDIT_CARD',
      status: PaymentStatus.COMPLETED,
      provider: 'omise',
      providerChargeId: 'chrg_test_5v7oa9q3k97djpky7wl',
      idempotencyKey: `${order1.id}-${Date.now()}-seed1`,
      paidAt: new Date('2026-03-01T10:05:00Z'),
      metadata: {
        card_brand: 'visa',
        last_digits: '4242',
      },
    },
  })
  console.log(`✅ Created payment for order: ${order1.orderNumber}`)

  const payment2 = await prisma.payment.create({
    data: {
      orderId: order2.id,
      amount: 1920,
      currency: 'THB',
      method: 'PROMPTPAY',
      status: PaymentStatus.COMPLETED,
      provider: 'omise',
      providerChargeId: 'chrg_test_5v7oa9q3k97djpky7w2',
      idempotencyKey: `${order2.id}-${Date.now()}-seed2`,
      paidAt: new Date('2026-03-03T14:10:00Z'),
    },
  })
  console.log(`✅ Created payment for order: ${order2.orderNumber}`)

  // ==============================================
  // Create Tracking
  // ==============================================
  console.log('📍 Creating tracking information...')

  const tracking1 = await prisma.tracking.create({
    data: {
      orderId: order1.id,
      status: 'DELIVERED',
      trackingNumber: 'TH123456789JP',
      carrier: 'Japan Post EMS',
      estimatedDelivery: new Date('2026-03-05T00:00:00Z'),
      deliveredAt: new Date('2026-03-05T15:30:00Z'),
      events: {
        create: [
          {
            status: 'ORDER_PLACED',
            description: 'Order has been placed',
            location: 'Bangkok, Thailand',
            eventAt: new Date('2026-03-01T10:00:00Z'),
          },
          {
            status: 'PURCHASED',
            description: 'Items purchased from Japanese marketplace',
            location: 'Tokyo, Japan',
            eventAt: new Date('2026-03-01T18:00:00Z'),
          },
          {
            status: 'SHIPPED_FROM_JP',
            description: 'Package shipped from Japan',
            location: 'Tokyo International Post Office',
            eventAt: new Date('2026-03-02T10:00:00Z'),
          },
          {
            status: 'IN_TRANSIT',
            description: 'Package in transit',
            location: 'Narita Airport, Japan',
            eventAt: new Date('2026-03-03T08:00:00Z'),
          },
          {
            status: 'ARRIVED_WAREHOUSE',
            description: 'Package arrived at Thailand warehouse',
            location: 'Bangkok International Airport',
            eventAt: new Date('2026-03-04T14:00:00Z'),
          },
          {
            status: 'OUT_FOR_DELIVERY',
            description: 'Out for delivery',
            location: 'Bangkok Distribution Center',
            eventAt: new Date('2026-03-05T09:00:00Z'),
          },
          {
            status: 'DELIVERED',
            description: 'Package delivered successfully',
            location: 'Bangkok, Thailand',
            eventAt: new Date('2026-03-05T15:30:00Z'),
          },
        ],
      },
    },
    include: { events: true },
  })
  console.log(`✅ Created tracking for order: ${order1.orderNumber}`)

  const tracking2 = await prisma.tracking.create({
    data: {
      orderId: order2.id,
      status: 'IN_TRANSIT',
      trackingNumber: 'TH987654321JP',
      carrier: 'Japan Post EMS',
      estimatedDelivery: new Date('2026-03-08T00:00:00Z'),
      events: {
        create: [
          {
            status: 'ORDER_PLACED',
            description: 'Order has been placed',
            location: 'Bangkok, Thailand',
            eventAt: new Date('2026-03-03T14:00:00Z'),
          },
          {
            status: 'PURCHASED',
            description: 'Items purchased from Japanese marketplace',
            location: 'Osaka, Japan',
            eventAt: new Date('2026-03-04T10:00:00Z'),
          },
          {
            status: 'SHIPPED_FROM_JP',
            description: 'Package shipped from Japan',
            location: 'Osaka International Post Office',
            eventAt: new Date('2026-03-05T08:00:00Z'),
          },
        ],
      },
    },
    include: { events: true },
  })
  console.log(`✅ Created tracking for order: ${order2.orderNumber}`)

  // ==============================================
  // Create Notifications
  // ==============================================
  console.log('🔔 Creating notifications...')

  await prisma.notification.createMany({
    data: [
      {
        userId: customer1.id,
        type: 'ORDER_UPDATE',
        title: 'Order Delivered',
        message: `Your order #${order1.orderNumber} has been delivered successfully.`,
        resourceId: String(order1.id),
        isRead: true,
        readAt: new Date('2026-03-05T16:00:00Z'),
      },
      {
        userId: customer2.id,
        type: 'TRACKING_UPDATE',
        title: 'Package Shipped',
        message: `Your order #${order2.orderNumber} has been shipped from Japan.`,
        resourceId: String(order2.id),
        isRead: false,
      },
      {
        userId: customer1.id,
        type: 'PAYMENT_UPDATE',
        title: 'Payment Pending',
        message: `Please complete payment for order #${order3.orderNumber}.`,
        resourceId: String(order3.id),
        isRead: false,
      },
    ],
  })
  console.log(`✅ Created notifications`)

  console.log('\n✅ Seeding completed successfully!')
  console.log('\n📊 Summary:')
  console.log(`- Users: ${await prisma.user.count()}`)
  console.log(`- Addresses: ${await prisma.address.count()}`)
  console.log(`- Orders: ${await prisma.order.count()}`)
  console.log(`- Order Items: ${await prisma.orderItem.count()}`)
  console.log(`- Payments: ${await prisma.payment.count()}`)
  console.log(`- Tracking: ${await prisma.tracking.count()}`)
  console.log(`- Tracking Events: ${await prisma.trackingEvent.count()}`)
  console.log(`- Notifications: ${await prisma.notification.count()}`)
  console.log('\n🔐 Test Credentials:')
  console.log('Admin: admin@sakura.com / password123')
  console.log('Staff: staff@sakura.com / password123')
  console.log('Customer 1: customer1@example.com / password123')
  console.log('Customer 2: customer2@example.com / password123')
}

/**
 * Execute seed function
 */
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
