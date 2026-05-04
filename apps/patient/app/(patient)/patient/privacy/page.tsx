/**
 * Patient app — Privacy code page (Build prompt 04 / B16).
 *
 * Path: /patient/privacy
 *
 * Displays the patient's current privacy code state ("you have one" /
 * "you don't have one yet") and offers regenerate. The plaintext is
 * shown ONCE on regenerate response — never re-fetched (the DB stores
 * only the bcrypt hash). Lazy mint: if no active code, the button label
 * becomes "Create code" instead of "Change code".
 */

import { PrivacyCodeCard } from '../../../../components/patient/PrivacyCodeCard'
import { hasActivePrivacyCode } from '@shared/lib/data/privacy-codes'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function PatientPrivacyPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    redirect('/auth/login')
  }

  const admin = createAdminClient('patient-privacy-page-server')
  const { data: gp } = await admin
    .from('global_patients')
    .select('id, claimed')
    .eq('claimed_user_id', auth.user.id)
    .maybeSingle()

  // If the patient hasn't claimed yet, show the page in mint-first state.
  let hasCode = false
  if (gp?.id) {
    hasCode = await hasActivePrivacyCode(gp.id)
  }

  return (
    <div dir="rtl" style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <PrivacyCodeCard initialHasCode={hasCode} unclaimed={!gp?.id} />
    </div>
  )
}
