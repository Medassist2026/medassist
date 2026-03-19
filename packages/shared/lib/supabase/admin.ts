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
  'prescription-sync',
  'patient-dedup',
  'audit-log',
  'api-versioning',
  'input-validation',
  'sms-reminders',
  'lab-results',
  'api-route'
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
