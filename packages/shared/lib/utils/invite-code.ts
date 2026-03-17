import { createAdminClient } from '@shared/lib/supabase/admin'

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No 0/O/1/I confusion

/**
 * Generate a short invite code in format XXXX-YY
 */
export function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  code += '-'
  for (let i = 0; i < 2; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return code
}

/**
 * Generate a unique invite code (checks DB for collisions)
 */
export async function generateUniqueInviteCode(): Promise<string> {
  const admin = createAdminClient('invite-code-gen')
  let attempts = 0

  while (attempts < 10) {
    const code = generateInviteCode()

    const { data } = await admin
      .from('clinics')
      .select('id')
      .eq('invite_code', code)
      .maybeSingle()

    if (!data) return code // No collision
    attempts++
  }

  // Fallback: use timestamp-based code
  const ts = Date.now().toString(36).toUpperCase().slice(-6)
  return `${ts.slice(0, 4)}-${ts.slice(4)}`
}
