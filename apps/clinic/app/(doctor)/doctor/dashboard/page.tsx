import { requireRole } from '@shared/lib/auth/session'
import { getDoctorProfile } from '@shared/lib/data/users'
import { getTodayAppointments } from '@shared/lib/data/appointments'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { DashboardContent } from './DashboardContent'

export default async function DoctorDashboardPage() {
  const user = await requireRole('doctor')

  let profile: any = null
  let appointments: any[] = []
  let clinicContext: any = null
  let unreadCount = 0
  let loadError: string | null = null

  try {
    profile = await getDoctorProfile(user.id)
    clinicContext = await getClinicContext(user.id, 'doctor')

    const rawAppointments = await getTodayAppointments(user.id, clinicContext?.clinicId)
    appointments = rawAppointments.map((apt) => ({
      id: apt.id,
      patient_id: apt.patient_id,
      patient_name: apt.patient?.full_name || 'مريض',
      patient_phone: apt.patient?.phone || undefined,
      patient_age: apt.patient?.age || undefined,
      patient_sex: apt.patient?.sex || undefined,
      start_time: apt.start_time,
      duration_minutes: apt.duration_minutes,
      status: apt.status,
      type: (apt as any).type || (apt as any).appointment_type || undefined,
      description: (apt as any).reason || (apt as any).notes || undefined,
    }))

    // Try to get unread notifications count (gracefully fail if table doesn't exist yet)
    try {
      const { createAdminClient } = await import('@shared/lib/supabase/admin')
      const admin = createAdminClient('notifications-count')
      const { count } = await admin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('read', false)
      unreadCount = count ?? 0
    } catch {
      // Notifications table may not exist yet — that's ok
      unreadCount = 0
    }
  } catch (err: any) {
    console.error('Dashboard load error:', err)
    loadError = err.message
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center" dir="rtl">
          <h1 className="text-lg font-bold text-red-900 mb-2">خطأ في تحميل البيانات</h1>
          <p className="text-red-700 text-sm">{loadError}</p>
        </div>
      </div>
    )
  }

  // Prepare clinic options for the switcher
  const allClinics = (clinicContext?.allClinics || []).map((c: any) => ({
    id: c.id,
    name: c.name,
  }))

  return (
    <DashboardContent
      doctorName={profile?.full_name || 'طبيب'}
      clinicName={clinicContext?.clinic?.name}
      clinicId={clinicContext?.clinicId}
      allClinics={allClinics}
      appointments={appointments}
      unreadNotifications={unreadCount}
    />
  )
}
