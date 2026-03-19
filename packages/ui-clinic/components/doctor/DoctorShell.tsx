'use client'

import { useState } from 'react'
import { BottomNav } from '@shared/components/ui/BottomNav'
import { SettingsDrawer } from './SettingsDrawer'
import { DesktopSidebar } from '../shared/DesktopSidebar'

/**
 * DoctorShell — Layout wrapper for doctor pages.
 *
 * Responsive behavior:
 * - Mobile: Bottom nav + centered content (max-w-lg)
 * - Desktop (lg+): Right sidebar (RTL) + expanded content area
 */

interface DoctorShellProps {
  children: React.ReactNode
  userName?: string
  userSpecialty?: string
  clinicName?: string
  activeClinic?: any
  allClinics?: any[]
  canSwitchClinic?: boolean
}

export function DoctorShell({
  children,
  userName,
  userSpecialty,
  clinicName,
}: DoctorShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB]">
      {/* Desktop Sidebar — visible on lg+ */}
      <DesktopSidebar role="doctor" userName={userName} clinicName={clinicName} />

      {/* Main Content
          Mobile  : full width, centered, max-w-lg, with bottom-nav padding
          Desktop : offset right by sidebar (260px), horizontal padding, no max-w cap
                    so each page can define its own width constraints              */}
      <main className="pb-24 lg:pb-10 max-w-lg mx-auto lg:max-w-none lg:mr-[260px] lg:ml-0 lg:px-10 xl:px-14">
        {children}
      </main>

      {/* Bottom Navigation — mobile only */}
      <div className="lg:hidden">
        <BottomNav />
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userName={userName}
        userSpecialty={userSpecialty}
        clinicName={clinicName}
      />
    </div>
  )
}
