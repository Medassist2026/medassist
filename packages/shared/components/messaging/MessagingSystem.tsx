'use client'

import { useState, useEffect, useRef } from 'react'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string
  sender_id: string
  sender_type: 'patient' | 'doctor'
  sender_name: string
  content: string
  sent_at: string
  read_at?: string
  attachments?: string[]
}

interface Conversation {
  id: string
  patient_id: string
  patient_name: string
  doctor_id: string
  doctor_name: string
  last_message?: Message
  unread_count: number
  status: 'active' | 'blocked' | 'closed'
  created_from_visit_id: string // Required - messages only after visits
  created_at: string
}

interface MessagingRules {
  canInitiate: boolean
  canRespond: boolean
  blockReason?: string
  hasHadVisit: boolean
  lastVisitDate?: string
}

// ============================================================================
// MESSAGING RULES CHECK
// ============================================================================

function checkMessagingRules(
  userType: 'patient' | 'doctor',
  conversation?: Conversation,
  hasVisitHistory: boolean = false,
  lastVisitDate?: string
): MessagingRules {
  // Rule 1: Messages only after a visit
  if (!hasVisitHistory) {
    return {
      canInitiate: false,
      canRespond: false,
      blockReason: 'You can only message doctors you have visited.',
      hasHadVisit: false
    }
  }

  // Rule 2: Check if conversation is blocked
  if (conversation?.status === 'blocked') {
    return {
      canInitiate: false,
      canRespond: false,
      blockReason: userType === 'patient' 
        ? 'This doctor has paused messaging. Please contact the clinic directly.'
        : 'You have blocked messages from this patient.',
      hasHadVisit: true,
      lastVisitDate
    }
  }

  // Rule 3: Conversation closed
  if (conversation?.status === 'closed') {
    return {
      canInitiate: false,
      canRespond: false,
      blockReason: 'This conversation has been closed.',
      hasHadVisit: true,
      lastVisitDate
    }
  }

  return {
    canInitiate: true,
    canRespond: true,
    hasHadVisit: true,
    lastVisitDate
  }
}

// ============================================================================
// CONVERSATION LIST (Patient View)
// ============================================================================

interface PatientConversationsProps {
  patientId: string
}

export function PatientConversations({ patientId }: PatientConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)

  useEffect(() => {
    const loadConversations = async () => {
      try {
        const res = await fetch('/api/patient/messages')
        if (res.ok) {
          const data = await res.json()
          setConversations(data.conversations || [])
        }
      } catch (error) {
        console.error('Failed to load conversations:', error)
      } finally {
        setLoading(false)
      }
    }
    loadConversations()
  }, [patientId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (selectedConversation) {
    return (
      <MessageThread
        conversation={selectedConversation}
        userType="patient"
        onBack={() => setSelectedConversation(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
        <div className="text-sm text-gray-500">
          {conversations.filter(c => c.unread_count > 0).length} unread
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <div className="flex items-start gap-2">
          <span className="text-lg">ℹ️</span>
          <div>
            <p className="font-medium">Messaging Rules</p>
            <p className="text-blue-700">You can only message doctors you have visited. Messages are not for emergencies - please call emergency services or visit a hospital for urgent issues.</p>
          </div>
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <span className="text-4xl">💬</span>
          <p className="text-gray-600 mt-3">No messages yet</p>
          <p className="text-sm text-gray-500 mt-1">
            After your first doctor visit, you'll be able to message them here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className="w-full p-4 text-left hover:bg-gray-50 flex items-start gap-3"
            >
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-semibold">
                  {conv.doctor_name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{conv.doctor_name}</span>
                  {conv.last_message && (
                    <span className="text-xs text-gray-500">
                      {new Date(conv.last_message.sent_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 truncate mt-0.5">
                  {conv.last_message?.content || 'No messages yet'}
                </p>
                {conv.status === 'blocked' && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-red-600">
                    <span>🚫</span> Messages paused
                  </span>
                )}
              </div>
              {conv.unread_count > 0 && (
                <span className="bg-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {conv.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// DOCTOR CONVERSATIONS
// ============================================================================

interface DoctorConversationsProps {
  doctorId: string
}

export function DoctorConversations({ doctorId }: DoctorConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [blockConfirm, setBlockConfirm] = useState<Conversation | null>(null)

  useEffect(() => {
    const loadConversations = async () => {
      try {
        const res = await fetch('/api/doctor/messages')
        if (res.ok) {
          const data = await res.json()
          setConversations(data.conversations || [])
        }
      } catch (error) {
        console.error('Failed to load conversations:', error)
      } finally {
        setLoading(false)
      }
    }
    loadConversations()
  }, [doctorId])

  const handleBlockPatient = async (conversation: Conversation) => {
    try {
      const res = await fetch(`/api/doctor/messages/${conversation.id}/block`, {
        method: 'POST'
      })
      if (res.ok) {
        setConversations(prev => prev.map(c => 
          c.id === conversation.id ? { ...c, status: 'blocked' as const } : c
        ))
      }
    } catch (error) {
      console.error('Failed to block patient:', error)
    }
    setBlockConfirm(null)
  }

  const handleUnblockPatient = async (conversation: Conversation) => {
    try {
      const res = await fetch(`/api/doctor/messages/${conversation.id}/unblock`, {
        method: 'POST'
      })
      if (res.ok) {
        setConversations(prev => prev.map(c => 
          c.id === conversation.id ? { ...c, status: 'active' as const } : c
        ))
      }
    } catch (error) {
      console.error('Failed to unblock patient:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (selectedConversation) {
    return (
      <MessageThread
        conversation={selectedConversation}
        userType="doctor"
        onBack={() => setSelectedConversation(null)}
        onBlock={() => setBlockConfirm(selectedConversation)}
        onUnblock={() => handleUnblockPatient(selectedConversation)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Patient Messages</h2>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{conversations.filter(c => c.unread_count > 0).length} unread</span>
          <span>{conversations.filter(c => c.status === 'blocked').length} blocked</span>
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <span className="text-4xl">💬</span>
          <p className="text-gray-600 mt-3">No patient messages</p>
          <p className="text-sm text-gray-500 mt-1">
            Patients can message you after their first visit.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200">
          {conversations.map((conv) => (
            <div key={conv.id} className="flex items-center">
              <button
                onClick={() => setSelectedConversation(conv)}
                className="flex-1 p-4 text-left hover:bg-gray-50 flex items-start gap-3"
              >
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-semibold">
                    {conv.patient_name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{conv.patient_name}</span>
                    {conv.last_message && (
                      <span className="text-xs text-gray-500">
                        {new Date(conv.last_message.sent_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate mt-0.5">
                    {conv.last_message?.content || 'No messages yet'}
                  </p>
                  {conv.status === 'blocked' && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-red-600">
                      <span>🚫</span> Blocked
                    </span>
                  )}
                </div>
                {conv.unread_count > 0 && (
                  <span className="bg-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {conv.unread_count}
                  </span>
                )}
              </button>
              
              {/* Quick block/unblock */}
              <div className="pr-4">
                {conv.status === 'blocked' ? (
                  <button
                    onClick={() => handleUnblockPatient(conv)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                    title="Unblock"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => setBlockConfirm(conv)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Block"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Block Confirmation */}
      <ConfirmDialog
        isOpen={!!blockConfirm}
        title="Block Patient Messages"
        message={
          <div>
            <p>Block messages from <strong>{blockConfirm?.patient_name}</strong>?</p>
            <p className="text-sm text-gray-500 mt-2">
              They won't be able to send you new messages. You can unblock them anytime.
            </p>
          </div>
        }
        confirmLabel="Block"
        confirmVariant="danger"
        onConfirm={() => blockConfirm && handleBlockPatient(blockConfirm)}
        onCancel={() => setBlockConfirm(null)}
      />
    </div>
  )
}

// ============================================================================
// MESSAGE THREAD
// ============================================================================

interface MessageThreadProps {
  conversation: Conversation
  userType: 'patient' | 'doctor'
  onBack: () => void
  onBlock?: () => void
  onUnblock?: () => void
}

function MessageThread({ conversation, userType, onBack, onBlock, onUnblock }: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check messaging rules
  const rules = checkMessagingRules(userType, conversation, true)

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const endpoint = userType === 'patient' 
          ? `/api/patient/messages/${conversation.id}`
          : `/api/doctor/messages/${conversation.id}`
        const res = await fetch(endpoint)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages || [])
        }
      } catch (error) {
        console.error('Failed to load messages:', error)
      } finally {
        setLoading(false)
      }
    }
    loadMessages()
  }, [conversation.id, userType])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!newMessage.trim() || !rules.canRespond) return

    setSending(true)
    try {
      const endpoint = userType === 'patient' 
        ? `/api/patient/messages/${conversation.id}`
        : `/api/doctor/messages/${conversation.id}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage.trim() })
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, data.message])
        setNewMessage('')
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  const otherPartyName = userType === 'patient' ? conversation.doctor_name : conversation.patient_name

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h3 className="font-semibold">{otherPartyName}</h3>
            {conversation.status === 'blocked' && (
              <span className="text-xs text-red-600">Messages paused</span>
            )}
          </div>
        </div>
        
        {/* Doctor can block/unblock */}
        {userType === 'doctor' && (
          <div>
            {conversation.status === 'blocked' ? (
              <button
                onClick={onUnblock}
                className="text-sm text-green-600 hover:text-green-700"
              >
                Unblock
              </button>
            ) : (
              <button
                onClick={onBlock}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Block
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No messages yet</p>
            <p className="text-sm">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = (userType === 'patient' && msg.sender_type === 'patient') ||
                         (userType === 'doctor' && msg.sender_type === 'doctor')
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                  isOwn 
                    ? 'bg-primary-600 text-white rounded-br-md' 
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  <p className="text-sm">{msg.content}</p>
                  <p className={`text-xs mt-1 ${isOwn ? 'text-primary-200' : 'text-gray-400'}`}>
                    {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {rules.canRespond ? (
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="px-4 py-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 border-t bg-gray-50">
          <p className="text-sm text-gray-600 text-center">
            {rules.blockReason}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================
