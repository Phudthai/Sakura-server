/** Stored on payment_receipts.purpose — domestic fee slip (same upload route as monthly). */
export const PAYMENT_RECEIPT_PURPOSE_DOMESTIC = 'DOMESTIC_SHIPPING'

/** Stored on payment_receipts.purpose — bank slip for wallet top-up (matches PENDING WALLET_TOPUP obligation). */
export const PAYMENT_RECEIPT_PURPOSE_WALLET_TOPUP = 'WALLET_TOPUP'

/** Backoffice creates purchase + confirms slip in one step — allocation uses all pending PRODUCT_FULL + INTL_SHIPPING for the user. */
export const PAYMENT_RECEIPT_PURPOSE_BACKOFFICE_PURCHASE = 'BACKOFFICE_PURCHASE'
