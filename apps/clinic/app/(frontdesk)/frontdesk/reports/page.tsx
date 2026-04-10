'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Users, Banknote, Clock, TrendingUp, User, Bell, Building2, LogOut, Stethoscope } from 'lucide-react'
import type { CheckInQueueItem, Payment as SharedPayment } from '@shared/lib/data/frontdesk'
import { translateSpecialty } from '@shared/lib/utils/specialty-labels'

// ============================================================================
// TYPES
// ============================================================================

type QueueItem = CheckInQueueItem
type Payment = Pick<SharedPayment, 'id' | 'amount' | 'payment_method'>

type TabFilter = 'today' | 'yesterday' | 'week'

// ============================================================================
// REPORTS PAGE
// ============================================================================

export default function ReportsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<TabFilter>('today')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [tab])

  const loadData = async () => {
    setLoading(true)
    try {
      const range = tab === 'today' ? 'today' : tab === 'yesterday' ? 'yesterday' : 'week'
      const [queueRes, payRes] = await Promise.all([
        fetch(`/api/frontdesk/queue/today?range=${range}`),
        fetch(`/api/frontdesk/payments?range=${range}`),
      ])

      if (queueRes.ok) {
        const d = await queueRes.json()
        setQueue(d.queue || [])
      }
      if (payRes?.ok) {
        const d = await payRes.json()
        setPayments(d.payments || [])
      }
    } catch (err) {
      console.error('Failed to load report data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Compute stats
  const totalPatients = queue.length
  const completed = queue.filter(q => q.status === 'completed').length
  const waiting = queue.filter(q => q.status === 'waiting').length
  const cancelled = queue.filter(q => q.status === 'cancelled').length
  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const avgPerPatient = completed > 0 ? Math.round(totalRevenue / completed) : 0

  // Average wait time (for completed patients)
  const completedWithTimes = queue.filter(q => q.status === 'completed' && q.checked_in_at && q.called_at)
  const avgWait = completedWithTimes.length > 0
    ? Math.round(completedWithTimes.reduce((sum, q) => {
        return sum + (new Date(q.called_at!).getTime() - new Date(q.checked_in_at).getTime()) / 60000
      }, 0) / completedWithTimes.length)
    : 0

  // Doctor breakdown
  const doctorBreakdown = (() => {
    const map = new Map<string, {
      name: string; specialty: string; patients: number; completed: number; revenue: number; avgWait: number; waitCount: number
    }>()

    for (const q of queue) {
      const docId = q.doctor_id
      const docName = (q as any).doctor?.full_name || 'طبيب'
      const docSpec = translateSpecialty((q as any).doctor?.specialty) || ''
      if (!map.has(docId)) {
        map.set(docId, { name: docName, specialty: docSpec, patients: 0, completed: 0, revenue: 0, avgWait: 0, waitCount: 0 })
      }
      const doc = map.get(docId)!
      doc.patients++
      if (q.status === 'completed') {
        doc.completed++
        if (q.checked_in_at && q.called_at) {
          doc.avgWait += (new Date(q.called_at).getTime() - new Date(q.checked_in_at).getTime()) / 60000
          doc.waitCount++
        }
      }
    }

    // Add revenue per doctor from payments
    for (const p of payments) {
      const docId = (p as any).doctor_id
      if (docId && map.has(docId)) {
        map.get(docId)!.revenue += Number(p.amount || 0)
      }
    }

    // Finalize avg wait
    for (const doc of map.values()) {
      doc.avgWait = doc.waitCount > 0 ? Math.round(doc.avgWait / doc.waitCount) : 0
    }

    return Array.from(map.values())
  })()

  const tabs: { key: TabFilter; label: string }[] = [
    { key: 'today', label: 'اليوم' },
    { key: 'yesterday', label: 'أمس' },
    { key: 'week', label: 'هذا الأسبوع' },
  ]

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      router.push('/login')
    } catch {
      router.push('/login')
    }
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-[#E5E7EB]">
        <button onClick={() => router.back()} className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center">
          <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
        </button>
        <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">التقارير</h1>
      </div>

      {/* Tab Filter */}
      <div className="flex gap-2 px-4 pt-3 pb-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full font-cairo text-[13px] font-medium transition-colors ${
              tab === t.key ? 'bg-[#16A34A] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-2 pb-24 space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
            {/* Summary Card */}
            <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4 space-y-3">
              <h2 className="font-cairo text-[14px] font-semibold text-[#030712]">
                {tab === 'today' && `ملخص اليوم — ${new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}`}
                {tab === 'yesterday' && (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `ملخص أمس — ${d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}` })()}
                {tab === 'week' && 'ملخص هذا الأسبوع'}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#16A34A]" />
                  <div>
                    <p className="font-cairo text-[12px] text-[#6B7280]">إجمالي المرضى</p>
                    <p className="font-cairo text-[16px] font-bold text-[#030712]">{totalPatients}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Only show trending-up when there are actually completed visits */}
                  {completed > 0
                    ? <TrendingUp className="w-4 h-4 text-[#16A34A]" />
                    : <Users className="w-4 h-4 text-[#9CA3AF]" />
                  }
                  <div>
                    <p className="font-cairo text-[12px] text-[#6B7280]">مكتمل</p>
                    <p className="font-cairo text-[16px] font-bold text-[#030712]">{completed}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-[#16A34A]" />
                  <div>
                    <p className="font-cairo text-[12px] text-[#6B7280]">الإيرادات</p>
                    <p className="font-cairo text-[16px] font-bold text-[#030712]">{(totalRevenue ?? 0).toLocaleString('ar-EG')} ج.م</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#D97706]" />
                  <div>
                    <p className="font-cairo text-[12px] text-[#6B7280]">متوسط الانتظار (المكتملون)</p>
                    <p className="font-cairo text-[16px] font-bold text-[#030712]">{avgWait} دقيقة</p>
                  </div>
                </div>
              </div>

              {avgPerPatient > 0 && (
                <p className="font-cairo text-[12px] text-[#9CA3AF] pt-1">
                  متوسط لكل مريض: {avgPerPatient.toLocaleString('ar-EG')} ج.م
                </p>
              )}
            </div>

            {/* Doctor Breakdown */}
            {doctorBreakdown.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-cairo text-[14px] font-semibold text-[#030712] px-1">تفاصيل الأطباء</h2>
                {doctorBreakdown.map((doc, i) => (
                  <div key={i} className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-[#F0FDF4] flex items-center justify-center">
                        <Stethoscope className="w-4.5 h-4.5 text-[#16A34A]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-cairo text-[14px] font-bold text-[#030712] truncate">د. {doc.name}</h3>
                        {doc.specialty && (
                          <p className="font-cairo text-[11px] text-[#6B7280]">{doc.specialty}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="font-cairo text-[16px] font-bold text-[#030712]">{doc.patients}</p>
                        <p className="font-cairo text-[10px] text-[#9CA3AF]">مرضى</p>
                      </div>
                      <div className="text-center">
                        <p className="font-cairo text-[16px] font-bold text-[#16A34A]">{(doc.revenue ?? 0).toLocaleString('ar-EG')} <span className="text-[12px]">ج.م</span></p>
                        <p className="font-cairo text-[10px] text-[#9CA3AF]">إيرادات</p>
                      </div>
                      <div className="text-center">
                        <p className="font-cairo text-[16px] font-bold text-[#D97706]">{doc.avgWait}<span className="text-[12px]">د</span></p>
                        <p className="font-cairo text-[10px] text-[#9CA3AF]">متوسط انتظار</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Settings Section */}
            <div className="pt-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-[0.5px] bg-[#E5E7EB]" />
                <span className="font-cairo text-[12px] text-[#9CA3AF]">الإعدادات</span>
                <div className="flex-1 h-[0.5px] bg-[#E5E7EB]" />
              </div>

              <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] overflow-hidden divide-y divide-[#F3F4F6]">
                <Link href="/frontdesk/profile" className="flex items-center gap-3 px-4 py-3.5">
                  <User className="w-5 h-5 text-[#6B7280]" />
                  <span className="font-cairo text-[14px] text-[#030712]">الحساب</span>
                </Link>
                <Link href="/frontdesk/invitations" className="flex items-center gap-3 px-4 py-3.5">
                  <Bell className="w-5 h-5 text-[#6B7280]" />
                  <span className="font-cairo text-[14px] text-[#030712]">الدعوات</span>
                </Link>
                <Link href="/frontdesk/profile" className="flex items-center gap-3 px-4 py-3.5">
                  <Building2 className="w-5 h-5 text-[#6B7280]" />
                  <span className="font-cairo text-[14px] text-[#030712]">العيادة</span>
                </Link>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3.5 text-right">
                  <LogOut className="w-5 h-5 text-[#EF4444]" />
                  <span className="font-cairo text-[14px] text-[#EF4444]">تسجيل الخروج</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
