export const dynamic = 'force-dynamic'

import { requireRole } from '@shared/lib/auth/session'
import { getPatientProfile } from '@shared/lib/data/users'
import { TourProvider } from '@shared/components/ui/OnboardingTour'
import { PatientShell } from '@ui-clinic/components/patient/PatientShell'

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireRole('patient')

  // Patient profile is optional — if the row doesn't exist (fresh signup),
  // fall back to phone number for display. The shell handles undefined props
  // gracefully.
  let fullName: string | undefined
  try {
    const profile = await getPatientProfile(user.id)
    fullName = profile?.full_name || undefined
  } catch {
    fullName = undefined
  }

  return (
    <PatientShell userName={fullName || user.phone}>
      <TourProvider>{children}</TourProvider>
    </PatientShell>
  )
}
