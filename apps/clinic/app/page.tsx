export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@shared/lib/auth/session'
import { getClinicContext } from '@shared/lib/data/clinic-context'

/**
 * Clinic app root — server component
 *
 * Routing logic:
 * 1. Not authenticated → /intro (splash → onboarding → auth)
 * 2. Authenticated doctor WITH clinic → /doctor/dashboard
 * 3. Authenticated frontdesk WITH clinic → /frontdesk/dashboard
 * 4. Authenticated but NO clinic → /setup (create or join clinic)
 */
export default async function ClinicHomePage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/intro')
  }

  // Check if user has a clinic
  const clinicContext = await getClinicContext(user.id, user.role as any)

  if (clinicContext) {
    // Has clinic — go to role dashboard
    if (user.role === 'doctor') {
      redirect('/doctor/dashboard')
    } else if (user.role === 'frontdesk') {
      redirect('/frontdesk/dashboard')
    }
  }

  // Authenticated but no clinic — needs setup
  redirect('/setup')
}
