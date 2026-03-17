import { redirect } from 'next/navigation'
import { getCurrentUser } from '@shared/lib/auth/session'

/**
 * Patient app root — server component
 * Authenticated patient → /patient/dashboard
 * Not authenticated → /intro
 */
export default async function PatientHomePage() {
  const user = await getCurrentUser()

  if (user) {
    if (user.role === 'patient') {
      redirect('/patient/dashboard')
    }
    // Non-patient ended up here — send to intro
    redirect('/intro')
  }

  redirect('/intro')
}
