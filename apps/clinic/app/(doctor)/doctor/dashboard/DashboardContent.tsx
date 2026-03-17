'use client'

import { DashboardHeader } from '@ui-clinic/components/doctor/DashboardHeader'
import { DashboardEmptyState } from '@ui-clinic/components/doctor/DashboardEmptyState'
import { PatientQueueCard, type VisitType } from '@ui-clinic/components/doctor/PatientQueueCard'

interface Appointment {
  id: string
  patient_id: string
  patient_name: string
  patient_phone?: string
  patient_age?: number
  patient_sex?: string
  start_time: string
  duration_minutes: number
  status: string
  type?: string
  description?: string
}

interface ClinicOption {
  id: string
  name: string
}

interface DashboardContentProps {
  doctorName: string
  clinicName?: string
  clinicId?: string
  allClinics?: ClinicOption[]
  appointments: Appointment[]
  unreadNotifications?: number
}

function deriveVisitType(apt: Appointment): VisitType {
  if (apt.type === 'emergency' || apt.type === 'طارئ') return 'emergency'
  if (apt.type === 'followup' || apt.type === 'follow_up' || apt.type === 'إعادة كشف') return 'followup'
  if (apt.type === 'new' || apt.type === 'كشف جديد') return 'new'
  return 'new'
}

export function DashboardContent({
  doctorName,
  clinicName,
  clinicId,
  allClinics,
  appointments,
  unreadNotifications,
}: DashboardContentProps) {
  const activeAppointments = appointments.filter(
    a => a.status !== 'cancelled' && a.status !== 'no_show'
  )

  return (
    <div>
      <DashboardHeader
        doctorName={doctorName}
        clinicName={clinicName}
        clinicId={clinicId}
        allClinics={allClinics}
        expectedCount={activeAppointments.length}
        unreadNotifications={unreadNotifications}
      />

      {activeAppointments.length === 0 ? (
        <DashboardEmptyState />
      ) : (
        <div className="px-4">
          {activeAppointments.map((apt, index) => (
            <div key={apt.id}>
              <PatientQueueCard
                patientId={apt.patient_id}
                patientName={apt.patient_name}
                patientPhone={apt.patient_phone}
                patientAge={apt.patient_age}
                patientSex={apt.patient_sex}
                visitType={deriveVisitType(apt)}
                appointmentId={apt.id}
                appointmentTime={apt.start_time}
                description={apt.description}
              />
              {/* Divider between cards — 1px #E5E7EB, matching Figma */}
              {index < activeAppointments.length - 1 && (
                <div className="h-[1px] bg-[#E5E7EB] my-3" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
