'use client'

import { useEffect, useState } from 'react'
import { Stethoscope, Clock, Users } from 'lucide-react'

interface DoctorStatus {
  doctorId: string
  doctorName: string
  specialty: string
  currentPatient?: {
    name: string
    queueNumber: number
    startedAt: string // ISO timestamp
  }
  waitingCount: number
  nextPatient?: {
    name: string
    queueNumber: number
  }
}

export function DoctorStatusCard({ doctor }: { doctor: DoctorStatus }) {
  const [elapsed, setElapsed] = useState(0)

  // Live session timer
  useEffect(() => {
    if (!doctor.currentPatient?.startedAt) return

    const started = new Date(doctor.currentPatient.startedAt).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - started) / 60000))
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [doctor.currentPatient?.startedAt])

  const isBusy = !!doctor.currentPatient
  const statusColor = isBusy ? '#3B82F6' : '#16A34A'
  const statusBg = isBusy ? 'bg-blue-50' : 'bg-green-50'
  const statusDot = isBusy ? 'bg-blue-500' : 'bg-green-500'

  // Estimate ~15 min per patient for progress bar
  const avgSession = 15
  const progress = isBusy ? Math.min((elapsed / avgSession) * 100, 100) : 0

  return (
    <div className={`rounded-[12px] border-[0.8px] border-[#E5E7EB] overflow-hidden ${statusBg}`}>
      {/* Doctor Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border-[0.8px] border-[#E5E7EB]">
            <Stethoscope className="w-5 h-5" style={{ color: statusColor }} />
          </div>
          <div className={`absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-white ${statusDot}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-cairo text-[15px] font-bold text-[#030712] truncate">
            د. {doctor.doctorName}
          </h3>
          <p className="font-cairo text-[12px] text-[#6B7280]">{doctor.specialty}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white rounded-full px-2.5 py-1 border-[0.8px] border-[#E5E7EB]">
          <Users className="w-3.5 h-3.5 text-[#6B7280]" />
          <span className="font-cairo text-[12px] font-bold text-[#030712]">{doctor.waitingCount}</span>
        </div>
      </div>

      {/* Current Patient / Available */}
      <div className="px-4 pb-3">
        {isBusy ? (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-cairo text-[13px] text-[#4B5563]">
                المريض الحالي: <span className="font-semibold text-[#030712]">{doctor.currentPatient!.name}</span>
                <span className="text-[#9CA3AF]"> #{doctor.currentPatient!.queueNumber}</span>
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-[6px] bg-white rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#9CA3AF]" />
              <span className="font-cairo text-[11px] text-[#9CA3AF]">{elapsed} دقيقة</span>
            </div>
          </>
        ) : (
          <div className="py-1">
            <span className="font-cairo text-[13px] font-medium text-[#16A34A]">
              متاح — لا يوجد مريض حالياً
            </span>
          </div>
        )}

        {/* Next patient */}
        {doctor.nextPatient && (
          <div className="mt-2 pt-2 border-t border-white/60">
            <span className="font-cairo text-[12px] text-[#6B7280]">
              التالي: <span className="font-medium text-[#030712]">{doctor.nextPatient.name}</span>
              <span className="text-[#9CA3AF]"> #{doctor.nextPatient.queueNumber}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
