export const dynamic = 'force-dynamic'

import { requireRole } from '@shared/lib/auth/session'
import { getPatientProfile } from '@shared/lib/data/users'
import { TourProvider } from '@shared/components/ui/OnboardingTour'
import { PatientShell } from '@ui-clinic/components/patient/PatientShell'
import { AccountProvider } from '@patient/lib/contexts/account-context'
import { CaregiverBanner } from '@patient/components/CaregiverBanner'

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

  // Resolve the display name once so both PatientShell (sidebar user info)
  // and AccountProvider (self context label) share the same source of truth.
  const selfDisplayName = fullName || user.phone || 'حسابي'

  return (
    <PatientShell userName={selfDisplayName}>
      {/*
        AccountProvider — B07 Phase F. Tracks active patient context (self,
        guardian_of_minor, delegated) via the URL `?as=<gpId>` param. Feeds
        the AccountSwitcher header element + the CaregiverBanner.
      */}
      <AccountProvider selfDisplayName={selfDisplayName}>
        <CaregiverBanner />
        <TourProvider>{children}</TourProvider>
      </AccountProvider>
    </PatientShell>
  )
}
