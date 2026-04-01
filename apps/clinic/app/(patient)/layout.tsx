export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireRole } from '@shared/lib/auth/session'

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  await requireRole('patient').catch(() => redirect('/login'))

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB]">
      {children}
    </div>
  )
}
