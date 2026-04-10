'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ChevronRight,
  Send,
  MessageCircle,
  Paperclip,
  X,
  FileText,
  Stethoscope,
  Check,
  CheckCheck,
  Clock,
} from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'

// ============================================================================
// TYPES
// ============================================================================

interface Doctor {
  id: string
  full_name: string
  specialty: string
}

interface Message {
  id: string
  sender_type: 'doctor' | 'patient'
  content: string
  created_at: string
  is_read: boolean
  sending?: boolean
  failed?: boolean
}

interface Conversation {
  doctor: Doctor
  last_message: string
  last_message_time: string
  unread_count: number
}

// ============================================================================
// ATTACHMENT DECODING
// ============================================================================

function decodeMessage(content: string): {
  text: string
  attachment: { url: string; name: string; type: 'image' | 'file' } | null
} {
  try {
    const parsed = JSON.parse(content)
    if (parsed._att) {
      const { url, name, mime, caption } = parsed._att
      return {
        text: caption || '',
        attachment: {
          url,
          name,
          type: mime?.startsWith('image/') ? 'image' : 'file',
        },
      }
    }
  } catch {
    /* plain text */
  }
  return { text: content, attachment: null }
}

function encodeAttachment(
  url: string,
  name: string,
  mime: string,
  caption = '',
): string {
  return JSON.stringify({ _att: { url, name, mime, caption } })
}

// ============================================================================
// SPECIALTY MAP
// ============================================================================

const SPECIALTY_AR: Record<string, string> = {
  general: 'طب عام',
  'general-practitioner': 'طب عام',
  'internal-medicine': 'باطنة',
  pediatrics: 'أطفال',
  cardiology: 'قلب',
  'obstetrics-gynecology': 'نساء وتوليد',
  orthopedics: 'عظام',
  dermatology: 'جلدية',
  ophthalmology: 'عيون',
  ent: 'أنف وأذن وحنجرة',
  neurology: 'مخ وأعصاب',
  psychiatry: 'نفسية',
}

function toAr(specialty: string) {
  return (
    SPECIALTY_AR[specialty] ?? SPECIALTY_AR[specialty?.toLowerCase()] ?? specialty
  )
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ar-EG', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'أمس'
  return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
}

function formatMsgTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('ar-EG', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'اليوم'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'أمس'
  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function toDateKey(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-CA')
}

// ============================================================================
// AVATAR
// ============================================================================

function DoctorAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
  return (
    <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
      <span className="font-cairo text-[14px] font-bold text-[#16A34A]">
        {initials}
      </span>
    </div>
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
  onSelect: (doctor: Doctor) => void
}) {
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
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="w-8 h-8 text-[#D1D5DB]" />
        </div>
        <p className="font-cairo text-[16px] font-semibold text-[#030712] mb-2">
          لا توجد محادثات
        </p>
        <p className="font-cairo text-[13px] text-[#6B7280] leading-relaxed">
          بعد زيارتك لأي طبيب يمكنك التواصل معه هنا لمتابعة حالتك
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#F3F4F6]">
      {conversations.map((conv) => {
        const { text: preview } = decodeMessage(conv.last_message)
        return (
          <button
            key={conv.doctor.id}
            onClick={() => onSelect(conv.doctor)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors text-right"
          >
            <DoctorAvatar name={conv.doctor.full_name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={`font-cairo text-[14px] truncate ${
                    conv.unread_count > 0
                      ? 'font-bold text-[#030712]'
                      : 'font-medium text-[#030712]'
                  }`}
                >
                  {conv.doctor.full_name}
                </h3>
                <span className="font-cairo text-[11px] text-[#9CA3AF] flex-shrink-0">
                  {formatTime(conv.last_message_time)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p
                  className={`font-cairo text-[12px] truncate ${
                    conv.unread_count > 0 ? 'text-[#4B5563]' : 'text-[#9CA3AF]'
                  }`}
                >
                  <span className="text-[#9CA3AF] text-[11px]">
                    {toAr(conv.doctor.specialty)} ·{' '}
                  </span>
                  {preview || '📎 مرفق'}
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
// CHAT VIEW
// ============================================================================

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024

function ChatView({
  doctor,
  messages,
  newMessage,
  sending,
  onBack,
  onMessageChange,
  onSend,
  isPolling,
}: {
  doctor: Doctor
  messages: Message[]
  newMessage: string
  sending: boolean
  onBack: () => void
  onMessageChange: (msg: string) => void
  onSend: (attachment?: { content: string }) => void
  isPolling: boolean
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<{
    file: File
    preview: string | null
  } | null>(null)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleFileSelect = (file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setUploadError('حجم الملف كبير — الحد الأقصى 5 ميجا')
      return
    }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    setPendingFile({ file, preview })
    setUploadError('')
  }

  const handleSend = async () => {
    if (pendingFile) {
      try {
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
        const ext = pendingFile.file.name.split('.').pop() || 'bin'
        const path = `messages/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await sb.storage
          .from('attachments')
          .upload(path, pendingFile.file, { contentType: pendingFile.file.type })
        if (error) throw error
        const { data: urlData } = sb.storage.from('attachments').getPublicUrl(path)
        const content = encodeAttachment(
          urlData.publicUrl,
          pendingFile.file.name,
          pendingFile.file.type,
          newMessage.trim(),
        )
        if (pendingFile.preview) URL.revokeObjectURL(pendingFile.preview)
        setPendingFile(null)
        onSend({ content })
      } catch {
        setUploadError('فشل رفع الملف — حاول مرة أخرى')
      }
    } else {
      onSend()
    }
  }

  return (
    <div dir="rtl" className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b-[0.8px] border-[#E5E7EB] safe-area-top">
        <button
          onClick={onBack}
          className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] flex items-center justify-center flex-shrink-0 hover:bg-[#F9FAFB]"
          aria-label="رجوع"
        >
          <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
        </button>
        <DoctorAvatar name={doctor.full_name} />
        <div className="flex-1 min-w-0">
          <h3 className="font-cairo text-[15px] font-semibold text-[#030712] truncate">
            {doctor.full_name}
          </h3>
          <p className="font-cairo text-[12px] text-[#9CA3AF]">
            {toAr(doctor.specialty)}
          </p>
        </div>
        {isPolling && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-pulse" />
            <span className="font-cairo text-[10px] text-[#9CA3AF]">مباشر</span>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="mx-3 mt-2 px-3 py-2 bg-[#FEF9C3] border-[0.8px] border-[#FDE047] rounded-[10px]">
        <p className="font-cairo text-[11px] text-[#713F12]">
          📋 هذه المحادثة خاصة بينك وبين طبيبك — يمكنك إرسال صور التحاليل أو
          الأسئلة الطبية
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#F9FAFB]">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Stethoscope className="w-10 h-10 text-[#D1D5DB] mx-auto mb-3" />
            <p className="font-cairo text-[13px] text-[#9CA3AF]">
              ابدأ محادثتك مع طبيبك
            </p>
          </div>
        ) : (
          (() => {
            const items: React.ReactNode[] = []
            let lastDateKey = ''

            messages.forEach((msg) => {
              const dateKey = msg.sending
                ? toDateKey(new Date().toISOString())
                : toDateKey(msg.created_at)

              if (dateKey !== lastDateKey) {
                lastDateKey = dateKey
                const label = msg.sending ? 'اليوم' : getDateLabel(msg.created_at)
                items.push(
                  <div
                    key={`sep-${dateKey}`}
                    className="flex items-center gap-3 my-3"
                  >
                    <div className="flex-1 h-px bg-[#E5E7EB]" />
                    <span className="font-cairo text-[11px] text-[#9CA3AF] px-2 py-0.5 bg-[#F3F4F6] rounded-full flex-shrink-0">
                      {label}
                    </span>
                    <div className="flex-1 h-px bg-[#E5E7EB]" />
                  </div>,
                )
              }

              const { text, attachment } = decodeMessage(msg.content)
              const isPatient = msg.sender_type === 'patient'

              items.push(
                <div
                  key={msg.id}
                  className={`flex mb-2 ${
                    isPatient ? 'justify-start' : 'justify-end'
                  } ${msg.sending ? 'opacity-70' : ''}`}
                >
                  <div
                    className={`max-w-[75%] rounded-[16px] px-4 py-2.5 ${
                      isPatient
                        ? 'bg-[#16A34A] text-white rounded-br-[4px]'
                        : 'bg-white text-[#030712] border-[0.8px] border-[#E5E7EB] rounded-bl-[4px]'
                    } ${msg.failed ? 'bg-[#FEE2E2] border-[#FCA5A5]' : ''}`}
                  >
                    {attachment ? (
                      attachment.type === 'image' ? (
                        <div>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={attachment.url}
                              alt={attachment.name}
                              className="max-w-[200px] rounded-[10px] mb-1 object-cover"
                            />
                          </a>
                          {text && (
                            <p className="font-cairo text-[13px]">{text}</p>
                          )}
                        </div>
                      ) : (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-black/10 rounded-[10px] px-3 py-2"
                        >
                          <FileText className="w-5 h-5 flex-shrink-0" />
                          <span className="font-cairo text-[13px] truncate max-w-[150px]">
                            {attachment.name}
                          </span>
                        </a>
                      )
                    ) : (
                      <p className="font-cairo text-[14px] leading-[22px]">{text}</p>
                    )}
                    <div
                      className={`flex items-center gap-1 mt-1 ${
                        isPatient ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span
                        className={`font-cairo text-[11px] ${
                          isPatient ? 'text-white/60' : 'text-[#9CA3AF]'
                        }`}
                      >
                        {msg.sending
                          ? formatMsgTime(new Date().toISOString())
                          : formatMsgTime(msg.created_at)}
                      </span>
                      {isPatient &&
                        (msg.failed ? (
                          <span className="text-[#EF4444]" title="فشل الإرسال">
                            <svg
                              className="w-3 h-3"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        ) : msg.sending ? (
                          <Clock className="w-3 h-3 text-white/50" />
                        ) : msg.is_read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-white/90" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-white/50" />
                        ))}
                    </div>
                  </div>
                </div>,
              )
            })

            return items
          })()
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending attachment preview */}
      {pendingFile && (
        <div className="px-4 py-2 bg-[#F0FDF4] border-t-[0.8px] border-[#BBF7D0] flex items-center gap-3">
          {pendingFile.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pendingFile.preview}
              alt="preview"
              className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 bg-[#DCFCE7] rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-[#16A34A]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-cairo text-[13px] font-medium truncate">
              {pendingFile.file.name}
            </p>
            <p className="font-cairo text-[11px] text-[#6B7280]">
              {(pendingFile.file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
          <button
            onClick={() => {
              if (pendingFile.preview) URL.revokeObjectURL(pendingFile.preview)
              setPendingFile(null)
            }}
            className="p-1"
          >
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>
      )}

      {uploadError && (
        <div className="px-4 py-1.5 bg-red-50 border-t-[0.8px] border-red-200">
          <p className="font-cairo text-[12px] text-red-600">{uploadError}</p>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t-[0.8px] border-[#E5E7EB] safe-area-bottom">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] hover:border-[#16A34A] transition-colors"
            title="إرفاق صورة أو تحليل"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
              e.target.value = ''
            }}
          />
          <input
            type="text"
            value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={pendingFile ? 'أضف تعليقاً...' : 'اكتب سؤالك للطبيب...'}
            className="flex-1 h-[44px] px-4 rounded-full border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]"
          />
          <button
            onClick={handleSend}
            disabled={sending || (!newMessage.trim() && !pendingFile)}
            className="w-[44px] h-[44px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 rounded-full flex items-center justify-center flex-shrink-0"
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

export default function PatientMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [isPolling, setIsPolling] = useState(false)
  const selectedDoctorRef = useRef<Doctor | null>(null)
  selectedDoctorRef.current = selectedDoctor

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/patient/messages/conversations')
      if (!res.ok) return
      const data = await res.json()
      if (data.conversations) setConversations(data.conversations)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
    const interval = setInterval(loadConversations, 60_000)
    return () => clearInterval(interval)
  }, [loadConversations])

  const loadMessages = useCallback(async (doctorId: string) => {
    try {
      const res = await fetch(`/api/patient/messages?doctorId=${doctorId}`)
      const data = await res.json()
      if (data.messages) {
        setMessages(data.messages)
        setIsPolling(true)
      }
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    if (!selectedDoctor) {
      setIsPolling(false)
      return
    }
    loadMessages(selectedDoctor.id)
    const interval = setInterval(() => {
      if (selectedDoctorRef.current) loadMessages(selectedDoctorRef.current.id)
    }, 20_000)
    return () => clearInterval(interval)
  }, [selectedDoctor, loadMessages])

  const sendMessage = async (override?: { content: string }) => {
    if (!selectedDoctor) return
    const content = override?.content ?? newMessage.trim()
    if (!content) return

    setSending(true)
    setSendError('')
    setNewMessage('')

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId,
      sender_type: 'patient',
      content,
      created_at: new Date().toISOString(),
      is_read: false,
      sending: true,
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      const res = await fetch('/api/patient/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id: selectedDoctor.id, content }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل إرسال الرسالة')
      }
      const data = await res.json()
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...data.message, sending: false } : m,
        ),
      )
      loadConversations()
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, sending: false, failed: true } : m,
        ),
      )
      setSendError(e.message || 'فشل إرسال الرسالة')
    } finally {
      setSending(false)
    }
  }

  if (selectedDoctor) {
    return (
      <>
        <ChatView
          doctor={selectedDoctor}
          messages={messages}
          newMessage={newMessage}
          sending={sending}
          isPolling={isPolling}
          onBack={() => {
            setSelectedDoctor(null)
            setMessages([])
            setSendError('')
          }}
          onMessageChange={(m) => {
            setNewMessage(m)
            setSendError('')
          }}
          onSend={sendMessage}
        />
        {sendError && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg z-50 font-cairo text-[13px]">
            {sendError}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <PatientHeader title="رسائلي" subtitle="محادثاتك مع أطبائك" />
      <div dir="rtl" className="bg-white">
        <ConversationList
          conversations={conversations}
          loading={loading}
          onSelect={setSelectedDoctor}
        />
      </div>
    </>
  )
}
