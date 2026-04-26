import { createClient } from '@supabase/supabase-js'

const ALLOWED_ADMIN_SCOPES = new Set([
  'auth-login-lookup',
  'otp-create',
  'otp-verify',
  'patient-onboarding',
  'patient-privacy-checks',
  'schema-health-check',
  'privacy-migration-backfill',
  'rate-limit',
  'clinic-join',
  'clinic-registration',
  'patient-details',
  'patient-visits',
  'patient-appointments',
  'doctor-appointments',
  'prescription-sync',
  'patient-dedup',
  'audit-log',
  'api-versioning',
  'input-validation',
  'sms-reminders',
  'lab-results',
  'user-registration',
  'api-route',
  // ── Phone-change v2 (PR-2 / Phase B) — see PHONE_CHANGE_PLAN.md §6.2 ──────
  'phone-change-request',          // INSERT phone_change_requests + otp_codes
  'phone-change-verify',           // verify OTP + UPDATE phone_change_requests.status
  'phone-change-commit',           // SQL change_phone_commit RPC + auth.admin.updateUserById
  'phone-change-rollback',         // SQL change_phone_rollback RPC + revert auth admin
  'phone-change-cancel',           // UPDATE phone_change_requests.status='cancelled'
  'phone-change-fallback',         // UPDATE method='sms_new_only' + INSERT account_recovery_requests
  'phone-change-owner-inbox-read', // SELECT JOIN requests/users/patients/memberships
  'phone-change-owner-approve',    // same surface as commit
  'phone-change-owner-reject',     // UPDATE phone_change_requests.status='rejected'
  'phone-correction',              // UPDATE patients + INSERT phone_corrections + history (Phase C)
])

/**
 * Admin client that bypasses Row Level Security (RLS)
 * Used for administrative operations like creating walk-in patients
 * IMPORTANT: Only use this for trusted server-side operations
 */
export function createAdminClient(scope: string = 'api-route') {
  if (!ALLOWED_ADMIN_SCOPES.has(scope)) {
    // Log unregistered scopes for tracking but don't block — many valid
    // scopes exist across the codebase that aren't in the whitelist yet
    console.warn(`[AdminClient] Unregistered scope: ${scope}`)
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
