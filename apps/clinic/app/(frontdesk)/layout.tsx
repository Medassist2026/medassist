export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireRole } from '@shared/lib/auth/session'
import { getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'
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
  // Pass role=frontdesk so setup page skips "create" option and goes straight to join
  const clinicId = await getUserClinicId(user.id)
  if (!clinicId) {
    redirect('/setup?role=frontdesk')
  }

  // Fetch frontdesk staff name in parallel with clinic context
  const supabaseAdmin = createAdminClient('frontdesk-layout')
  const [clinicContext, staffResult] = await Promise.all([
    getClinicContext(user.id, 'frontdesk'),
    supabaseAdmin
      .from('front_desk_staff')
      .select('full_name')
      .eq('id', user.id)
      .single(),
  ])

  const displayName = (staffResult as any)?.data?.full_name || user.phone

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      {/* Desktop sidebar wrapper — client component */}
      <FrontdeskDesktopWrapper
        userName={displayName}
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
