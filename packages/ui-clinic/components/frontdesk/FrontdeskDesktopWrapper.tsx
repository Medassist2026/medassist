'use client'

import { DesktopSidebar } from '../shared/DesktopSidebar'

interface FrontdeskDesktopWrapperProps {
  userName?: string
  clinicName?: string
}

export function FrontdeskDesktopWrapper({ userName, clinicName }: FrontdeskDesktopWrapperProps) {
  return <DesktopSidebar role="frontdesk" userName={userName} clinicName={clinicName} />
}
