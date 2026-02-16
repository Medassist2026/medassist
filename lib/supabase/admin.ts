import { createClient } from '@supabase/supabase-js'

/**
 * Admin client that bypasses Row Level Security (RLS)
 * Used for administrative operations like creating walk-in patients
 * IMPORTANT: Only use this for trusted server-side operations
 */
export function createAdminClient() {
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
