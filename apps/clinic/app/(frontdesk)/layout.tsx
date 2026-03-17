import { redirect } from 'next/navigation'
import { requireRole, getAssignedDoctors } from '@shared/lib/auth/session'
import { getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { FrontdeskBottomNav } from '@ui-clinic/components/frontdesk/FrontdeskBottomNav'
import { OfflineIndicator } from '@ui-clinic/components/frontdesk/OfflineIndicator'

export default async function FrontDeskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireRole('frontdesk')

  // Resolve clinic — frontdesk must belong to a clinic
  const clinicId = await getUserClinicId(user.id)
  if (!clinicId) {
    redirect('/setup')
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      <div className="max-w-md mx-auto bg-white min-h-screen relative">
        {/* Offline status indicator */}
        <OfflineIndicator />

        {/* Main Content — padding bottom for BottomNav */}
        <main className="pb-20">
          {children}
        </main>

        {/* Fixed Bottom Navigation */}
        <FrontdeskBottomNav />
      </div>
    </div>
  )
}
