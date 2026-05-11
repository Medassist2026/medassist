export const dynamic = 'force-dynamic'

// Re-exported from shared handler — single source of truth.
// B07 Phase G Section 6 — clinic-side READ of a patient's active
// delegations ("care network"). See handler for AUTHZ + response shape.
export { GET } from '@shared/lib/api/handlers/admin/patient/care-network/handler'
