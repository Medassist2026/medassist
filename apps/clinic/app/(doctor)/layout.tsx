export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireRole } from '@shared/lib/auth/session'
import { getDoctorProfile } from '@shared/lib/data/users'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { DoctorShell } from '@ui-clinic/components/doctor/DoctorShell'

/** Map English specialty slugs → Arabic display labels */
const SPECIALTY_AR: Record<string, string> = {
  'general': 'طب عام',
  'general-practitioner': 'طب عام',
  'general practitioner': 'طب عام',
  'internal-medicine': 'باطنة',
  'باطنة': 'باطنة',
  'pediatrics': 'أطفال',
  'cardiology': 'قلب وأوعية دموية',
  'obstetrics-gynecology': 'نساء وتوليد',
  'orthopedics': 'عظام',
  'dermatology': 'جلدية',
  'ophthalmology': 'عيون',
  'ent': 'أنف وأذن وحنجرة',
  'neurology': 'مخ وأعصاب',
  'psychiatry': 'نفسية',
  'urology': 'مسالك بولية',
  'surgery': 'جراحة عامة',
  'dentistry': 'أسنان',
  'radiology': 'أشعة',
  'laboratory': 'تحاليل',
  'physiotherapy': 'علاج طبيعي',
  'nutrition': 'تغذية',
  'endocrinology': 'غدد صماء',
}

function toArabicSpecialty(slug?: string): string | undefined {
  if (!slug) return undefined
  return SPECIALTY_AR[slug] ?? SPECIALTY_AR[slug.toLowerCase()] ?? slug
}

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireRole('doctor')
  const profile = await getDoctorProfile(user.id)
  const clinicContext = await getClinicContext(user.id, 'doctor')

  // No clinic yet → redirect to setup
  if (!clinicContext) {
    redirect('/setup')
  }

  return (
    <DoctorShell
      userName={profile.full_name || `د. ${user.phone}`}
      userSpecialty={toArabicSpecialty(profile.specialty)}
      clinicName={clinicContext.clinic?.name}
      activeClinic={clinicContext.clinic}
      allClinics={clinicContext.allClinics}
      canSwitchClinic={clinicContext.hasMultipleClinics}
    >
      {children}
    </DoctorShell>
  )
}
