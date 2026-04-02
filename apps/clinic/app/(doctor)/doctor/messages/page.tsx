'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Send, MessageCircle, Paperclip, X, Image, FileText, Check, CheckCheck, Clock, User } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// TYPES
// ============================================================================

interface Patient {
  id: string
  full_name: string
  phone: string
}

interface Message {
  id: string
  sender_type: 'doctor' | 'patient'
  content: string
  created_at: string
  is_read: boolean
  sending?: boolean   // optimistic: true while awaiting server confirmation
  failed?: boolean    // optimistic: true if send failed
  attachment?: { url: string; name: string; type: 'image' | 'file' } | null
}

interface Conversation {
  patient: Patient
  last_message: string
  last_message_time: string
  unread_count: number
}

// ============================================================================
// ATTACHMENT ENCODING — stored in message content as JSON prefix
// Format: {"_att":{"url":"...","name":"...","mime":"...","caption":"..."}}
// Falls back to plain text if not parseable
// ============================================================================

function encodeAttachment(url: string, name: string, mime: string, caption = ''): string {
  return JSON.stringify({ _att: { url, name, mime, caption } })
}

function decodeMessage(content: string): { text: string; attachment: Message['attachment'] } {
  try {
    const parsed = JSON.parse(content)
    if (parsed._att) {
      const { url, name, mime, caption } = parsed._att
      const isImage = mime.startsWith('image/')
      return {
        text: caption || '',
        attachment: { url, name, type: isImage ? 'image' : 'file' }
      }
    }
  } catch { /* not JSON — plain text */ }
  return { text: content, attachment: null }
}

// ============================================================================
// AVATAR — consistent color per patient, icon instead of initials
// (Egyptians don't use name abbreviations/initials)
// ============================================================================

const AVATAR_COLORS = [
  { bg: 'bg-[#DCFCE7]', icon: 'text-[#16A34A]' },
  { bg: 'bg-[#DBEAFE]', icon: 'text-[#2563EB]' },
  { bg: 'bg-[#FEF9C3]', icon: 'text-[#A16207]' },
  { bg: 'bg-[#FCE7F3]', icon: 'text-[#BE185D]' },
  { bg: 'bg-[#E0E7FF]', icon: 'text-[#4338CA]' },
  { bg: 'bg-[#FED7AA]', icon: 'text-[#C2410C]' },
]

function getAvatarColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

/** Renders a colored circle with a User icon — no initials */
function PatientAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const color = getAvatarColor(name)
  const dim   = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12'
  const icon  = size === 'sm' ? 'w-4 h-4'   : 'w-5 h-5'
  return (
    <div className={`${dim} rounded-full flex items-center justify-center flex-shrink-0 ${color.bg}`}>
      <User className={`${icon} ${color.icon}`} strokeWidth={2} />
    </div>
  )
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'أمس'
  }

  return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
}

function formatMessageTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

// Returns a human-readable date label for chat separators
function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return 'اليوم'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'أمس'
  return date.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })
}

// Returns YYYY-MM-DD for grouping messages by date
function toDateKey(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-CA') // produces YYYY-MM-DD
}

// ============================================================================
// ATTACHMENT PREVIEW (in message bubble)
// ============================================================================

function AttachmentBubble({ attachment, caption }: { attachment: NonNullable<Message['attachment']>; caption: string }) {
  if (attachment.type === 'image') {
    return (
      <div>
        <a href={attachment.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.name}
            className="max-w-[200px] rounded-[10px] mb-1 object-cover"
          />
        </a>
        {caption && <p className="font-cairo text-[13px] mt-1">{caption}</p>}
      </div>
    )
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-black/10 rounded-[10px] px-3 py-2"
    >
      <FileText className="w-5 h-5 flex-shrink-0" />
      <span className="font-cairo text-[13px] truncate max-w-[150px]">{attachment.name}</span>
    </a>
  )
}

// ============================================================================
// CONVERSATION LIST
// ============================================================================

function ConversationList({
  conversations,
  loading,
  onSelect,
}: {
  conversations: Conversation[]
  loading: boolean
  onSelect: (patient: Patient) => void
}) {
  const router = useRouter()

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="font-cairo text-[14px] text-[#6B7280]">جاري التحميل...</p>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="w-8 h-8 text-[#D1D5DB]" />
        </div>
        <p className="font-cairo text-[16px] font-semibold text-[#030712] mb-1">لا توجد رسائل</p>
        <p className="font-cairo text-[14px] text-[#6B7280]">ستظهر محادثاتك مع المرضى هنا</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#F3F4F6]">
      {conversations.map((conv) => {
        // Decode last message for preview (hide attachment JSON)
        const { text: previewText } = decodeMessage(conv.last_message)
        const displayPreview = previewText || '📎 مرفق'

        return (
          <button
            key={conv.patient.id}
            onClick={() => onSelect(conv.patient)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors text-right"
          >
            <PatientAvatar name={conv.patient.full_name} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className={`font-cairo text-[14px] truncate ${conv.unread_count > 0 ? 'font-bold text-[#030712]' : 'font-medium text-[#030712]'}`}>
                  {conv.patient.full_name}
                </h3>
                <span className="font-cairo text-[11px] text-[#9CA3AF] flex-shrink-0">
                  {formatTime(conv.last_message_time)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className={`font-cairo text-[13px] truncate ${conv.unread_count > 0 ? 'text-[#4B5563]' : 'text-[#9CA3AF]'}`}>
                  {displayPreview}
                </p>
                {conv.unread_count > 0 && (
                  <span className="bg-[#16A34A] text-white font-cairo text-[11px] font-bold min-w-[20px] h-[20px] rounded-full flex items-center justify-center flex-shrink-0 px-1.5">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// QUICK REPLIES
// ============================================================================

const QUICK_REPLIES = [
  'خد الدواء في مواعيده',
  'النتايج طبيعية الحمد لله',
  'تعالى العيادة لو في أي مشكلة',
  'استمر على نفس العلاج',
  'حالتك مطمنة',
  'لازم تعمل التحاليل دي الأول',
  'اوقف الدواء وتعالى للمراجعة',
  'اشرب سوائل كتير وراحة',
  'هبعتلك الروشتة دلوقتي',
  'معاد المراجعة الأسبوع الجاي',
  'لو الأعراض زادت روح الطوارئ',
  'خد المضاد الحيوي لحد ما يخلص',
  'مفيش قلق، ده طبيعي',
  'محتاج أشعة قبل ما نقرر',
  'ممنوع أكل دسم أو مقليات',
]

// ============================================================================
// PATIENT PROFILE CARD — collapsible summary panel inside chat
// ============================================================================

interface PatientCardData {
  // from /api/doctor/patients/:id
  age: number | null
  sex: string | null
  bloodType: string | null
  // from /api/clinical/patient-summary
  totalVisits: number
  lastVisitDate: string | null
  lastComplaints: string[]
  lastDiagnoses: string[]
  activeMeds: string[]
  allergies: string[]
  chronicDiseases: string[]
  followUpDate: string | null
}

const SEX_AR: Record<string, string> = { male: 'ذكر', female: 'أنثى', m: 'ذكر', f: 'أنثى' }

function PatientProfileCard({ patient }: { patient: Patient }) {
  const router = useRouter()
  const [data, setData]       = useState<PatientCardData | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profileRes, summaryRes] = await Promise.all([
          fetch(`/api/doctor/patients/${patient.id}`),
          fetch(`/api/clinical/patient-summary?patientId=${patient.id}`),
        ])

        const profile = profileRes.ok ? (await profileRes.json()) : null
        const summary = summaryRes.ok ? (await summaryRes.json()) : null
        if (cancelled) return

        const p = profile?.patient ?? {}
        const lv = summary?.lastVisit ?? null

        setData({
          age:           p.age ?? null,
          sex:           p.sex ?? null,
          bloodType:     p.blood_type || null,
          totalVisits:   summary?.totalVisits ?? 0,
          lastVisitDate: lv?.date ?? null,
          lastComplaints: lv?.complaints ?? [],
          lastDiagnoses:  lv?.diagnoses  ?? [],
          activeMeds:    (lv?.medications ?? []).map((m: any) => m.name).filter(Boolean).slice(0, 4),
          allergies:     summary?.allergies       ?? p.allergies       ?? [],
          chronicDiseases: summary?.chronicDiseases ?? p.chronic_conditions ?? [],
          followUpDate:  summary?.pendingFollowUp?.date ?? null,
        })
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [patient.id])

  if (loading) return (
    <div className="mx-3 mt-2 px-3 py-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] animate-pulse">
      <div className="h-3 w-48 bg-[#E5E7EB] rounded" />
    </div>
  )

  if (!data) return null

  const sexLabel       = data.sex ? (SEX_AR[data.sex.toLowerCase()] ?? data.sex) : null
  const visitDateLabel = data.lastVisitDate
    ? new Date(data.lastVisitDate).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
    : null
  const followLabel    = data.followUpDate
    ? new Date(data.followUpDate).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
    : null

  // ── Collapsed pill ──────────────────────────────────────────────────────────
  const collapsedRow = (
    <div className="flex items-center gap-2 flex-wrap">
      {data.age     && <span className="font-semibold">{data.age} سنة</span>}
      {sexLabel     && <span className="text-[#6B7280]">· {sexLabel}</span>}
      {data.bloodType && (
        <span className="px-1.5 py-0.5 bg-[#FEE2E2] text-[#DC2626] rounded text-[10px] font-bold">
          {data.bloodType}
        </span>
      )}
      {data.totalVisits > 0 && (
        <span className="text-[#6B7280]">· {data.totalVisits} زيارة</span>
      )}
      {data.allergies.length > 0 && (
        <span className="px-1.5 py-0.5 bg-[#FEF3C7] text-[#92400E] rounded text-[10px] font-semibold">
          ⚠ حساسية
        </span>
      )}
    </div>
  )

  // Build the always-visible clinical summary line (complaint + Rx)
  const complaintSummary = data.lastComplaints.slice(0, 2).join(' · ')
  const rxSummary        = data.activeMeds.slice(0, 3).join('، ')
  const hasSummaryLine   = complaintSummary || rxSummary

  return (
    <div className="mx-3 mt-2 border border-[#E5E7EB] rounded-[12px] overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">

      {/* ── Always-visible area ── */}
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-[#F9FAFB] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0 space-y-1">
          {/* Row 1: demographics */}
          {collapsedRow}

          {/* Row 2: last complaint + Rx — visible without expanding */}
          {hasSummaryLine && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-cairo text-[11px] text-[#4B5563]">
              {complaintSummary && (
                <span>
                  <span className="text-[#9CA3AF]">الشكوى: </span>
                  {complaintSummary}
                </span>
              )}
              {complaintSummary && rxSummary && (
                <span className="text-[#D1D5DB]">·</span>
              )}
              {rxSummary && (
                <span>
                  <span className="text-[#9CA3AF]">Rx: </span>
                  <span className="text-[#166534] font-medium">{rxSummary}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); router.push(`/doctor/patients/${patient.id}`) }}
            className="font-cairo text-[11px] text-[#16A34A] hover:underline whitespace-nowrap"
          >
            الملف الكامل ←
          </button>
          <svg
            className={`w-4 h-4 text-[#9CA3AF] transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* ── Expanded panel: full clinical detail ── */}
      {expanded && (
        <div className="border-t border-[#F3F4F6] px-3 py-2.5 space-y-2 bg-[#FAFAFA]">

          {/* Last visit date + diagnoses */}
          {(visitDateLabel || data.lastDiagnoses.length > 0) && (
            <div className="flex gap-2">
              <span className="font-cairo text-[11px] text-[#6B7280] flex-shrink-0 pt-0.5">آخر زيارة</span>
              <div className="flex-1 min-w-0">
                {visitDateLabel && (
                  <span className="font-cairo text-[11px] text-[#374151] font-medium">{visitDateLabel}</span>
                )}
                {data.lastDiagnoses.length > 0 && (
                  <p className="font-cairo text-[11px] text-[#4B5563] mt-0.5">
                    التشخيص: {data.lastDiagnoses.slice(0, 2).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Active medications (chips) */}
          {data.activeMeds.length > 0 && (
            <div className="flex gap-2 items-start">
              <span className="font-cairo text-[11px] text-[#6B7280] flex-shrink-0 pt-0.5">الأدوية</span>
              <div className="flex flex-wrap gap-1">
                {data.activeMeds.map(m => (
                  <span key={m} className="px-2 py-0.5 bg-[#DCFCE7] text-[#166534] font-cairo text-[11px] rounded-full">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Chronic diseases */}
          {data.chronicDiseases.length > 0 && (
            <div className="flex gap-2 items-start">
              <span className="font-cairo text-[11px] text-[#6B7280] flex-shrink-0 pt-0.5">أمراض مزمنة</span>
              <div className="flex flex-wrap gap-1">
                {data.chronicDiseases.map(d => (
                  <span key={d} className="px-2 py-0.5 bg-[#EFF6FF] text-[#1D4ED8] font-cairo text-[11px] rounded-full">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Allergies */}
          {data.allergies.length > 0 && (
            <div className="flex gap-2 items-start">
              <span className="font-cairo text-[11px] text-[#6B7280] flex-shrink-0 pt-0.5">حساسية</span>
              <div className="flex flex-wrap gap-1">
                {data.allergies.map(a => (
                  <span key={a} className="px-2 py-0.5 bg-[#FEE2E2] text-[#DC2626] font-cairo text-[11px] font-medium rounded-full">
                    ⚠ {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming follow-up */}
          {followLabel && (
            <div className="flex gap-2 items-center">
              <span className="font-cairo text-[11px] text-[#6B7280] flex-shrink-0">متابعة</span>
              <span className="px-2 py-0.5 bg-[#FEF9C3] text-[#92400E] font-cairo text-[11px] font-medium rounded-full">
                📅 {followLabel}
              </span>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ============================================================================
// ATTACHMENT PICKER STATE
// ============================================================================

interface PendingAttachment {
  file: File
  previewUrl: string | null
  type: 'image' | 'file'
}

// ============================================================================
// CHAT VIEW
// ============================================================================

function ChatView({
  patient,
  messages,
  newMessage,
  sending,
  pendingAttachment,
  onBack,
  onMessageChange,
  onSend,
  onAttachmentSelect,
  onAttachmentClear,
  isPolling,
}: {
  patient: Patient
  messages: Message[]
  newMessage: string
  sending: boolean
  pendingAttachment: PendingAttachment | null
  onBack: () => void
  onMessageChange: (msg: string) => void
  onSend: () => void
  onAttachmentSelect: (file: File) => void
  onAttachmentClear: () => void
  isPolling: boolean
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showQuickReplies, setShowQuickReplies] = useState(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#E5E7EB]">
        <button
          onClick={onBack}
          className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
        >
          <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
        </button>
        <PatientAvatar name={patient.full_name} size="sm" />
        <div className="flex-1 min-w-0">
          <h3 className="font-cairo text-[15px] font-semibold text-[#030712] truncate">{patient.full_name}</h3>
          <p className="font-cairo text-[12px] text-[#9CA3AF]" dir="ltr">{patient.phone}</p>
        </div>
        {/* Live polling indicator */}
        {isPolling && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-pulse" />
            <span className="font-cairo text-[10px] text-[#9CA3AF]">مباشر</span>
          </div>
        )}
      </div>

      <PatientProfileCard patient={patient} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#F9FAFB]">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-cairo text-[13px] text-[#9CA3AF]">لا توجد رسائل بعد</p>
          </div>
        ) : (() => {
          const items: React.ReactNode[] = []
          let lastDateKey = ''

          messages.forEach((msg) => {
            const dateKey = msg.sending ? toDateKey(new Date().toISOString()) : toDateKey(msg.created_at)

            // ── Date separator ──────────────────────────────────────
            if (dateKey !== lastDateKey) {
              lastDateKey = dateKey
              const label = msg.sending
                ? 'اليوم'
                : getDateLabel(msg.created_at)
              items.push(
                <div key={`sep-${dateKey}`} className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-[#E5E7EB]" />
                  <span className="font-cairo text-[11px] text-[#9CA3AF] px-2 py-0.5 bg-[#F3F4F6] rounded-full flex-shrink-0">
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-[#E5E7EB]" />
                </div>
              )
            }

            // ── Message bubble ──────────────────────────────────────
            const { text, attachment } = decodeMessage(msg.content)
            const isDoctor = msg.sender_type === 'doctor'

            items.push(
              <div
                key={msg.id}
                className={`flex mb-2 ${isDoctor ? 'justify-start' : 'justify-end'} ${msg.sending ? 'opacity-70' : ''}`}
              >
                <div
                  className={`max-w-[75%] rounded-[16px] px-4 py-2.5 ${
                    isDoctor
                      ? 'bg-[#16A34A] text-white rounded-br-[4px]'
                      : 'bg-white text-[#030712] border border-[#E5E7EB] rounded-bl-[4px]'
                  } ${msg.failed ? 'bg-[#FEE2E2] border-[#FCA5A5]' : ''}`}
                >
                  {attachment && (
                    <AttachmentBubble attachment={attachment} caption={text} />
                  )}
                  {!attachment && text && (
                    <p className="font-cairo text-[14px] leading-[22px]">{text}</p>
                  )}
                  {/* Timestamp + status tick */}
                  <div className={`flex items-center gap-1 mt-1 ${isDoctor ? 'justify-end' : 'justify-start'}`}>
                    <span className={`font-cairo text-[11px] ${isDoctor ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                      {msg.sending
                        ? formatMessageTime(new Date().toISOString())
                        : formatMessageTime(msg.created_at)}
                    </span>
                    {/* Read-status icons — doctor messages only */}
                    {isDoctor && (
                      msg.failed ? (
                        <span className="text-[#EF4444]" title="فشل الإرسال">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : msg.sending ? (
                        <Clock className="w-3 h-3 text-white/50" />
                      ) : msg.is_read ? (
                        <CheckCheck className="w-3.5 h-3.5 text-white/90" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-white/50" />
                      )
                    )}
                  </div>
                </div>
              </div>
            )
          })

          return items
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending attachment preview */}
      {pendingAttachment && (
        <div className="px-4 py-2 bg-[#F0FDF4] border-t border-[#BBF7D0] flex items-center gap-3">
          {pendingAttachment.type === 'image' && pendingAttachment.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingAttachment.previewUrl} alt="preview" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 bg-[#DCFCE7] rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-[#16A34A]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-cairo text-[13px] font-medium text-[#030712] truncate">{pendingAttachment.file.name}</p>
            <p className="font-cairo text-[11px] text-[#6B7280]">
              {(pendingAttachment.file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
          <button onClick={onAttachmentClear} className="p-1 rounded-full hover:bg-[#DCFCE7]">
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>
      )}

      {/* Quick Replies Tray */}
      {showQuickReplies && (
        <div className="px-3 py-2 bg-white border-t border-[#E5E7EB] max-h-[140px] overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => { onMessageChange(reply); setShowQuickReplies(false) }}
                className="px-3 py-1.5 font-cairo text-[12px] font-medium rounded-full border border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A] hover:text-[#16A34A] transition-colors bg-white"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 py-3 bg-white border-t border-[#E5E7EB] safe-area-bottom">
        <div className="flex items-center gap-2">
          {/* Quick reply toggle */}
          <button
            type="button"
            onClick={() => setShowQuickReplies(!showQuickReplies)}
            className={`w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 border-[0.8px] transition-colors ${
              showQuickReplies
                ? 'bg-[#16A34A] border-[#16A34A] text-white'
                : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280] hover:border-[#16A34A]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>

          {/* Attachment button + 5MB hint */}
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-[44px] h-[44px] rounded-full flex items-center justify-center border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] hover:border-[#16A34A] transition-colors"
              title="إرفاق صورة أو ملف PDF — الحد الأقصى 5MB"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <span className="font-cairo text-[9px] text-[#9CA3AF] leading-none">5MB</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onAttachmentSelect(file)
              e.target.value = ''
            }}
          />

          <input
            type="text"
            value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
            placeholder={pendingAttachment ? 'أضف تعليقاً (اختياري)...' : 'اكتب رسالة...'}
            className="flex-1 h-[44px] px-4 rounded-full border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]"
          />
          <button
            onClick={onSend}
            disabled={sending || (!newMessage.trim() && !pendingAttachment)}
            className="w-[44px] h-[44px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white -rotate-90" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024 // 5 MB

export default function MessagesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const selectedPatientRef = useRef<Patient | null>(null)

  selectedPatientRef.current = selectedPatient

  // ── Load conversations + poll every 60s ──────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      setLoadError('')
      const response = await fetch('/api/doctor/messages/conversations')
      if (!response.ok) throw new Error('فشل تحميل المحادثات')
      const data = await response.json()
      if (data.conversations) setConversations(data.conversations)
    } catch (error: any) {
      setLoadError(error.message || 'حدث خطأ في تحميل الرسائل')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
    const interval = setInterval(loadConversations, 60_000)
    return () => clearInterval(interval)
  }, [loadConversations])

  // Auto-open chat if navigated here with ?patientId= (from patient profile)
  useEffect(() => {
    const patientId = searchParams.get('patientId')
    const patientName = searchParams.get('patientName')
    const patientPhone = searchParams.get('patientPhone')
    if (patientId && patientName && !selectedPatient) {
      setSelectedPatient({
        id: patientId,
        full_name: patientName,
        phone: patientPhone || ''
      })
    }
  }, [searchParams, selectedPatient])

  // ── Load messages + poll every 20s when chat is open ─────────────────────

  const loadMessages = useCallback(async (patientId: string, silent = false) => {
    try {
      const response = await fetch(`/api/doctor/messages?patientId=${patientId}`)
      const data = await response.json()
      if (data.messages) {
        setMessages(data.messages)
        setIsPolling(true)
      }
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    if (!selectedPatient) {
      setIsPolling(false)
      return
    }
    loadMessages(selectedPatient.id)
    const interval = setInterval(() => {
      if (selectedPatientRef.current) {
        loadMessages(selectedPatientRef.current.id, true)
      }
    }, 20_000)
    return () => clearInterval(interval)
  }, [selectedPatient, loadMessages])

  // ── Attachment picker ─────────────────────────────────────────────────────

  const handleAttachmentSelect = (file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setSendError('حجم الملف كبير — الحد الأقصى 5 ميجا')
      return
    }
    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    setPendingAttachment({ file, previewUrl, type: isImage ? 'image' : 'file' })
  }

  const clearAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment(null)
  }

  // ── Upload attachment to Supabase Storage ─────────────────────────────────

  const uploadAttachment = async (file: File): Promise<{ url: string; name: string; mime: string } | null> => {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const ext = file.name.split('.').pop() || 'bin'
      const path = `messages/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await sb.storage.from('attachments').upload(path, file, { contentType: file.type })
      if (error) throw error
      const { data: urlData } = sb.storage.from('attachments').getPublicUrl(path)
      return { url: urlData.publicUrl, name: file.name, mime: file.type }
    } catch (err) {
      console.error('Upload failed:', err)
      return null
    }
  }

  // ── Send message (with optimistic UI) ────────────────────────────────────

  const sendMessage = async () => {
    if ((!newMessage.trim() && !pendingAttachment) || !selectedPatient) return

    setSending(true)
    setSendError('')

    // Build the content string (may include attachment JSON)
    let content = newMessage.trim()
    const attachmentSnapshot = pendingAttachment

    // Clear input immediately so the user can type the next message
    setNewMessage('')

    // ── Optimistic bubble ─────────────────────────────────────────────────
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId,
      sender_type: 'doctor',
      content: attachmentSnapshot
        ? encodeAttachment(attachmentSnapshot.previewUrl || '', attachmentSnapshot.file.name, attachmentSnapshot.file.type, content)
        : content,
      created_at: new Date().toISOString(),
      is_read: false,
      sending: true,
    }
    setMessages(prev => [...prev, optimisticMsg])

    try {
      if (attachmentSnapshot) {
        const uploaded = await uploadAttachment(attachmentSnapshot.file)
        if (!uploaded) throw new Error('فشل رفع الملف — حاول مرة أخرى')
        content = encodeAttachment(uploaded.url, uploaded.name, uploaded.mime, content)
        clearAttachment()
      }

      const response = await fetch('/api/doctor/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: selectedPatient.id, content })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'فشل إرسال الرسالة')
      }

      const data = await response.json()
      // Replace optimistic message with the real one from server
      setMessages(prev => prev.map(m =>
        m.id === optimisticId
          ? { ...data.message, sending: false }
          : m
      ))
      loadConversations()
    } catch (error: any) {
      // Mark optimistic message as failed
      setMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, sending: false, failed: true } : m
      ))
      setSendError(error.message || 'فشل إرسال الرسالة. حاول مرة أخرى')
    } finally {
      setSending(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      <div className="max-w-md mx-auto bg-white min-h-screen lg:max-w-none lg:mx-0 lg:rounded-xl lg:border lg:border-[#E5E7EB] lg:min-h-[calc(100vh-5rem)]">
        {selectedPatient ? (
          <>
            <ChatView
              patient={selectedPatient}
              messages={messages}
              newMessage={newMessage}
              sending={sending}
              pendingAttachment={pendingAttachment}
              isPolling={isPolling}
              onBack={() => { setSelectedPatient(null); setMessages([]); setSendError(''); clearAttachment() }}
              onMessageChange={(msg) => { setNewMessage(msg); setSendError('') }}
              onSend={sendMessage}
              onAttachmentSelect={handleAttachmentSelect}
              onAttachmentClear={clearAttachment}
            />
            {sendError && (
              <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg z-50 font-cairo text-[13px]">
                {sendError}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-[#E5E7EB]">
              <button
                onClick={() => router.back()}
                className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center"
              >
                <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
              </button>
              <h1 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712] flex-1">
                الرسائل
              </h1>
              {conversations.some(c => c.unread_count > 0) && (
                <span className="bg-[#16A34A] text-white font-cairo text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {conversations.reduce((s, c) => s + c.unread_count, 0)} جديد
                </span>
              )}
            </div>

            {loadError && (
              <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="font-cairo text-[13px] text-red-700 text-center">{loadError}</p>
                <button
                  onClick={() => { setLoading(true); loadConversations() }}
                  className="block mx-auto mt-2 font-cairo text-[13px] font-medium text-[#16A34A]"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}

            <ConversationList
              conversations={conversations}
              loading={loading}
              onSelect={setSelectedPatient}
            />
          </>
        )}
      </div>
    </div>
  )
}
