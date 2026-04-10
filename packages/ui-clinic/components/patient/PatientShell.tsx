'use client'

import { DesktopSidebar } from '../shared/DesktopSidebar'
import { PatientBottomNav } from './PatientBottomNav'

/**
 * PatientShell — Layout wrapper for patient pages.
 *
 * Mirrors the DoctorShell responsive pattern:
 *  - Mobile: bottom nav + centered content (max-w-md / max-w-lg)
 *  - Desktop (lg+): right sidebar (RTL) offset by 260px
 *
 * Design tokens:
 *  - dir="rtl" on the root (fixes 9 missing-RTL bugs across patient pages)
 *  - bg #F9FAFB matches doctor/frontdesk surfaces
 *  - Cairo font inherited from global CSS — every shared component uses `font-cairo`
 *
 * Pages render their own PatientHeader (so titles vary per page) and push
 * their body content as children here.
 */

interface PatientShellProps {
  children: React.ReactNode
  userName?: string
  clinicName?: string
}

export function PatientShell({ children, userName, clinicName }: PatientShellProps) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB]">
      {/* Desktop Sidebar — visible on lg+ */}
      <DesktopSidebar role="patient" userName={userName} clinicName={clinicName} />

      {/* Main content
          Mobile  : full width, centered, max-w-md, with bottom-nav padding
          Desktop : offset right by sidebar (260px), horizontal padding       */}
      <main className="pb-24 lg:pb-10 max-w-md mx-auto lg:max-w-none lg:mr-[260px] lg:ml-0 lg:px-10 xl:px-14">
        {children}
      </main>

      {/* Bottom Navigation — mobile only */}
      <div className="lg:hidden">
        <PatientBottomNav />
      </div>
    </div>
  )
}
