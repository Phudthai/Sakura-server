/**
 * @file order.types.ts
 * @description Order-related type definitions
 * @module @sakura/shared/types
 *
 * @author Sakura Team
 * @created 2026-03-05
 */

/**
 * Order total breakdown
 *
 * @description
 * Detailed breakdown of order pricing
 *
 * @example
 * ```typescript
 * const breakdown: OrderTotalBreakdown = {
 *   subtotalJPY: 5000,
 *   subtotalTHB: 1200,
 *   serviceFee: 180,    // 15% of subtotal
 *   shippingCost: 200,
 *   discount: 100,
 *   total: 1480
 * }
 * ```
 */
export interface OrderTotalBreakdown {
  /** Subtotal in Japanese Yen */
  subtotalJPY: number

  /** Subtotal in Thai Baht */
  subtotalTHB: number

  /** Service fee (15% of subtotal) */
  serviceFee: number

  /** Shipping cost based on weight */
  shippingCost: number

  /** Discount amount (if applicable) */
  discount: number

  /** Final total amount in THB */
  total: number
}

/**
 * Create order DTO (Data Transfer Object)
 *
 * @description
 * Data required to create a new order
 *
 * @example
 * ```typescript
 * const orderData: CreateOrderDto = {
 *   items: [
 *     {
 *       productName: 'Nintendo Switch',
 *       productUrl: 'https://amazon.co.jp/...',
 *       priceJPY: 10000,
 *       quantity: 1
 *     }
 *   ],
 *   shippingAddressId: 'address-id',
 *   notes: 'Please wrap as gift'
 * }
 * ```
 */
export interface CreateOrderDto {
  /** Items to order */
  items: CreateOrderItemDto[]

  /** Shipping address ID */
  shippingAddressId: string

  /** Optional discount code */
  discountCode?: string

  /** Special instructions */
  notes?: string
}

/**
 * Create order item DTO
 *
 * @description
 * Data for a single order item
 */
export interface CreateOrderItemDto {
  /** Product name */
  productName: string

  /** Product URL from Japanese marketplace */
  productUrl: string

  /** Product image URL */
  imageUrl?: string

  /** Price per unit in JPY */
  priceJPY: number

  /** Quantity */
  quantity: number

  /** Size/variant */
  variant?: string

  /** Color */
  color?: string

  /** Item notes */
  notes?: string
}

/**
 * Update order DTO
 *
 * @description
 * Data for updating an existing order
 */
export interface UpdateOrderDto {
  /** New shipping address ID */
  shippingAddressId?: string

  /** New special instructions */
  notes?: string
}
