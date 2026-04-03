'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface AuditEvent {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  actor_user_id: string
  metadata: Record<string, unknown> | null
  created_at: string
  users?: { phone: string; email: string | null } | null
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  VIEW_PATIENT: { label: 'عرض مريض', color: 'text-blue-600' },
  EDIT_PATIENT: { label: 'تعديل مريض', color: 'text-amber-600' },
  CREATE_PATIENT: { label: 'إنشاء مريض', color: 'text-green-600' },
  VIEW_CLINICAL_NOTE: { label: 'عرض ملاحظة', color: 'text-blue-600' },
  CREATE_CLINICAL_NOTE: { label: 'إنشاء ملاحظة', color: 'text-green-600' },
  VIEW_PRESCRIPTION: { label: 'عرض روشتة', color: 'text-blue-600' },
  PRINT_PRESCRIPTION: { label: 'طباعة روشتة', color: 'text-teal-600' },
  SHARE_PATIENT: { label: 'مشاركة مريض', color: 'text-indigo-600' },
  REVOKE_SHARE: { label: 'إلغاء مشاركة', color: 'text-red-600' },
  CREATE_APPOINTMENT: { label: 'إنشاء موعد', color: 'text-green-600' },
  VIEW_LAB_RESULTS: { label: 'عرض تحاليل', color: 'text-blue-600' },
  LOGIN: { label: 'تسجيل دخول', color: 'text-gray-600' },
  LOGOUT: { label: 'تسجيل خروج', color: 'text-gray-600' },
}

const FILTER_ACTIONS = [
  'VIEW_PATIENT', 'EDIT_PATIENT', 'CREATE_PATIENT',
  'CREATE_CLINICAL_NOTE', 'VIEW_PRESCRIPTION', 'PRINT_PRESCRIPTION',
  'SHARE_PATIENT', 'REVOKE_SHARE',
]

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    loadAuditLog()
  }, [actionFilter])

  async function loadAuditLog() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (actionFilter) params.set('action', actionFilter)

      const res = await fetch(`/api/clinic/audit-log?${params}`)
      if (!res.ok) throw new Error('فشل في تحميل سجل المراجعة')
      const data = await res.json()

      if (data.success) {
        setEvents(data.events || [])
      } else {
        throw new Error(data.error || 'فشل في تحميل سجل المراجعة')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في التحميل')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-md mx-auto px-4 py-4" dir="rtl">
      <div>
        <Link
          href="/doctor/clinic-settings"
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 mb-2"
        >
          <ChevronRight className="w-4 h-4" />
          العودة لإعدادات العيادة
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">سجل المراجعة</h1>
        <p className="text-gray-600 mt-1">تتبع جميع الإجراءات في عيادتك</p>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          <span className="flex-1">{error}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => loadAuditLog()}
              className="text-red-700 underline hover:no-underline text-xs"
            >
              إعادة المحاولة
            </button>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">✕</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">كل الإجراءات</option>
          {FILTER_ACTIONS.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
          ))}
        </select>
      </div>

      {/* Events table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">لا توجد أحداث</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الوقت</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">المستخدم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الإجراء</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">العنصر</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map(event => {
                  const actionConfig = ACTION_LABELS[event.action] || { label: event.action, color: 'text-gray-600' }
                  return (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {new Date(event.created_at).toLocaleString('ar-EG', {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                          timeZone: 'Africa/Cairo',
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {event.users?.phone || event.actor_user_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${actionConfig.color}`}>
                          {actionConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {event.entity_type}
                        {event.entity_id && (
                          <span className="text-gray-400 mr-1">#{event.entity_id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                        {event.metadata ? JSON.stringify(event.metadata) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
