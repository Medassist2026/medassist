'use client'

import { useState } from 'react'
import { BottomNav } from '@shared/components/ui/BottomNav'
import { SettingsDrawer } from './SettingsDrawer'

/**
 * DoctorShell — Layout wrapper for doctor pages.
 *
 * Figma design: NO sticky header bar at top.
 * Instead, content starts directly with logo + welcome section.
 * Only the bottom nav is fixed.
 *
 * The old sticky header with profile icon + clinic selector + notification bell
 * is replaced by a swipe-down settings drawer accessible via tapping the
 * profile icon in the dashboard header.
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
      {/* Main Content — Figma: padding 48px top, 16px horizontal, 34px bottom + nav space */}
      <main className="pb-24 max-w-lg mx-auto">
        {children}
      </main>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Settings Drawer — accessible from profile icon tap in DashboardHeader */}
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
