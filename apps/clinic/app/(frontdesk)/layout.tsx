export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireRole, getAssignedDoctors } from '@shared/lib/auth/session'
import { getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { FrontdeskBottomNav } from '@ui-clinic/components/frontdesk/FrontdeskBottomNav'
import { FrontdeskDesktopWrapper } from '@ui-clinic/components/frontdesk/FrontdeskDesktopWrapper'
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

  const clinicContext = await getClinicContext(user.id, 'frontdesk')

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      {/* Desktop sidebar wrapper — client component */}
      <FrontdeskDesktopWrapper
        userName={user.phone}
        clinicName={clinicContext?.clinic?.name}
      />

      {/* Content container — mobile: max-w-md centered, desktop: offset by sidebar */}
      <div className="max-w-md mx-auto bg-white min-h-screen relative lg:max-w-none lg:mr-[260px] lg:ml-0 lg:bg-[#F9FAFB]">
        <OfflineIndicator />

        <main className="pb-20 lg:pb-6 lg:px-8">
          <div className="lg:max-w-4xl lg:mx-auto lg:bg-white lg:min-h-screen lg:rounded-xl lg:shadow-sm lg:mt-4 lg:p-6">
            {children}
          </div>
        </main>

        {/* Bottom Navigation — mobile only */}
        <div className="lg:hidden">
          <FrontdeskBottomNav />
        </div>
      </div>
    </div>
  )
}
