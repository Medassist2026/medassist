import { redirect } from 'next/navigation'
import { requireRole } from '@shared/lib/auth/session'
import { getDoctorProfile } from '@shared/lib/data/users'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { DoctorShell } from '@ui-clinic/components/doctor/DoctorShell'

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
      userSpecialty={profile.specialty?.replace('-', ' ')}
      clinicName={clinicContext.clinic?.name}
      activeClinic={clinicContext.clinic}
      allClinics={clinicContext.allClinics}
      canSwitchClinic={clinicContext.hasMultipleClinics}
    >
      {children}
    </DoctorShell>
  )
}
