'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Send, MessageCircle, Paperclip, X, Image, FileText } from 'lucide-react'
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
// AVATAR COLORS — consistent color per patient initial
// ============================================================================

const AVATAR_COLORS = [
  { bg: 'bg-[#DCFCE7]', text: 'text-[#16A34A]' },
  { bg: 'bg-[#DBEAFE]', text: 'text-[#2563EB]' },
  { bg: 'bg-[#FEF9C3]', text: 'text-[#A16207]' },
  { bg: 'bg-[#FCE7F3]', text: 'text-[#BE185D]' },
  { bg: 'bg-[#E0E7FF]', text: 'text-[#4338CA]' },
  { bg: 'bg-[#FED7AA]', text: 'text-[#C2410C]' },
]

function getAvatarColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2)
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
        const color = getAvatarColor(conv.patient.full_name)
        // Decode last message for preview (hide attachment JSON)
        const { text: previewText } = decodeMessage(conv.last_message)
        const displayPreview = previewText || '📎 مرفق'

        return (
          <button
            key={conv.patient.id}
            onClick={() => onSelect(conv.patient)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors text-right"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 relative ${color.bg}`}>
              <span className={`font-cairo text-[14px] font-bold ${color.text}`}>
                {getInitials(conv.patient.full_name)}
              </span>
            </div>
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
// PATIENT CONTEXT BANNER
// ============================================================================

interface PatientContext {
  lastVisitDate: string | null
  chiefComplaint: string | null
  medications: string[]
  allergies: string[]
}

function PatientContextBanner({ patientId }: { patientId: string }) {
  const [ctx, setCtx] = useState<PatientContext | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/doctor/patients/${patientId}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        const patient = data.patient
        if (!patient || cancelled) return

        let lastNote: any = null
        try {
          const notesRes = await fetch(`/api/clinical/patient-notes?patientId=${patientId}&limit=1`)
          if (notesRes.ok) {
            const notesData = await notesRes.json()
            lastNote = notesData.notes?.[0] || null
          }
        } catch { /* no notes */ }

        if (cancelled) return
        setCtx({
          lastVisitDate: lastNote?.created_at || patient.last_visit_date || null,
          chiefComplaint: lastNote?.chief_complaint?.[0] || null,
          medications: (lastNote?.medications || []).map((m: any) => m.name).slice(0, 3),
          allergies: patient.allergies || [],
        })
      } catch { /* silent */ }
    }
    load()
    return () => { cancelled = true }
  }, [patientId])

  if (!ctx || (!ctx.lastVisitDate && !ctx.chiefComplaint && ctx.medications.length === 0)) return null

  const visitDate = ctx.lastVisitDate
    ? new Date(ctx.lastVisitDate).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="mx-3 mt-2 px-3 py-2 bg-[#EFF6FF] border border-[#BFDBFE] rounded-[10px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-cairo text-[11px] text-[#1E40AF]">
        {visitDate && <span>آخر زيارة: {visitDate}</span>}
        {ctx.chiefComplaint && <span>| {ctx.chiefComplaint}</span>}
        {ctx.medications.length > 0 && <span>| Rx: {ctx.medications.join('، ')}</span>}
        {ctx.allergies.length > 0 && <span className="text-[#DC2626]">| حساسية: {ctx.allergies.join('، ')}</span>}
      </div>
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
  const color = getAvatarColor(patient.full_name)
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
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${color.bg}`}>
          <span className={`font-cairo text-[13px] font-bold ${color.text}`}>
            {getInitials(patient.full_name)}
          </span>
        </div>
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

      <PatientContextBanner patientId={patient.id} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F9FAFB]">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-cairo text-[13px] text-[#9CA3AF]">لا توجد رسائل بعد</p>
          </div>
        ) : (
          messages.map((msg) => {
            const { text, attachment } = decodeMessage(msg.content)
            return (
              <div
                key={msg.id}
                className={`flex ${msg.sender_type === 'doctor' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[75%] rounded-[16px] px-4 py-2.5 ${
                    msg.sender_type === 'doctor'
                      ? 'bg-[#16A34A] text-white rounded-br-[4px]'
                      : 'bg-white text-[#030712] border border-[#E5E7EB] rounded-bl-[4px]'
                  }`}
                >
                  {attachment && (
                    <AttachmentBubble attachment={attachment} caption={text} />
                  )}
                  {!attachment && text && (
                    <p className="font-cairo text-[14px] leading-[22px]">{text}</p>
                  )}
                  <p className={`font-cairo text-[11px] mt-1 ${msg.sender_type === 'doctor' ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                    {formatMessageTime(msg.created_at)}
                    {msg.sender_type === 'doctor' && msg.is_read && (
                      <span className="mr-1 opacity-80">✓✓</span>
                    )}
                  </p>
                </div>
              </div>
            )
          })
        )}
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

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] hover:border-[#16A34A] transition-colors"
            title="إرفاق صورة أو ملف"
          >
            <Paperclip className="w-5 h-5" />
          </button>
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

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if ((!newMessage.trim() && !pendingAttachment) || !selectedPatient) return

    setSending(true)
    setSendError('')

    try {
      let content = newMessage.trim()

      if (pendingAttachment) {
        const uploaded = await uploadAttachment(pendingAttachment.file)
        if (!uploaded) throw new Error('فشل رفع الملف — حاول مرة أخرى')
        content = encodeAttachment(uploaded.url, uploaded.name, uploaded.mime, content)
        clearAttachment()
      }

      const response = await fetch('/api/doctor/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: selectedPatient.id, content })
      })

      if (!response.ok) throw new Error('فشل إرسال الرسالة')
      setNewMessage('')
      loadMessages(selectedPatient.id)
      loadConversations()
    } catch (error: any) {
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
