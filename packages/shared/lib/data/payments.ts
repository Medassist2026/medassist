/**
 * Canonical values for the payments.payment_status column.
 * Matches the CHECK constraint in migration 006_front_desk_module.sql.
 *
 * WHY THIS EXISTS: duplicate string literals ('paid', 'completed',
 * etc.) caused a production bug where doctor analytics filtered by
 * a status value that never exists in the schema, silently
 * returning zero for every doctor. Use these constants everywhere
 * payment_status is read or written.
 */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
} as const

export type PaymentStatus =
  typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS]

/**
 * A payment is "collected revenue" if it was successfully taken
 * and not reversed. Use this predicate in analytics aggregations
 * so we never re-hardcode the list.
 *
 * Note: null is treated as "count it" to preserve the behavior of
 * the original (broken) analytics code — migration 006 does not
 * mark payment_status NOT NULL, so null rows are technically
 * possible. Revisit if the column is later tightened.
 */
export function isCollectedPayment(
  p: { payment_status: string | null }
): boolean {
  return (
    p.payment_status === PAYMENT_STATUS.COMPLETED ||
    p.payment_status === null
  )
}
