import { requireRole } from '@shared/lib/auth/session'
import { getPatientProfile } from '@shared/lib/data/users'
import { TourProvider } from '@shared/components/ui/OnboardingTour'
import { Navigation, type NavItem } from '@shared/components/ui/Navigation'

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireRole('patient')
  const profile = await getPatientProfile(user.id)

  const navItems: NavItem[] = [
    { href: '/patient/dashboard', label: 'Dashboard', arLabel: 'لوحة التحكم' },
    { href: '/patient/my-code', label: 'My Code', arLabel: 'الكود الخاص' },
    { href: '/patient/prescriptions', label: 'Prescriptions', arLabel: 'الروشتة' },
    { href: '/patient/appointments', label: 'Appointments', arLabel: 'المواعيد' },
    { href: '/patient/labs', label: 'Lab Results', arLabel: 'نتائج التحاليل' },
    { href: '/patient/records', label: 'Records', arLabel: 'السجلات' },
    { href: '/patient/messages', label: 'Messages', arLabel: 'الرسائل' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation
        role="patient"
        items={navItems}
        userName={user.phone}
        userSubtitle="Patient"
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TourProvider>
          {children}
        </TourProvider>
      </main>
    </div>
  )
}
