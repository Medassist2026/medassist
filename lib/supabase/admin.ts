import { createClient } from '@supabase/supabase-js'

const ALLOWED_ADMIN_SCOPES = new Set([
  'auth-login-lookup',
  'patient-onboarding',
  'patient-privacy-checks',
  'schema-health-check',
  'privacy-migration-backfill',
  'rate-limit'
])

/**
 * Admin client that bypasses Row Level Security (RLS)
 * Used for administrative operations like creating walk-in patients
 * IMPORTANT: Only use this for trusted server-side operations
 */
export function createAdminClient(scope: string) {
  if (process.env.NODE_ENV === 'production' && !ALLOWED_ADMIN_SCOPES.has(scope)) {
    throw new Error(`Admin client scope not allowed: ${scope}`)
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
