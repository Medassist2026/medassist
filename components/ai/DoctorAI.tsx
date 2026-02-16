'use client'

import { useState, useRef, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  type?: 'text' | 'patient-summary' | 'schedule' | 'options' | 'action'
  data?: any
}

interface DoctorAIContextValue {
  isOpen: boolean
  openAssistant: () => void
  closeAssistant: () => void
  toggleAssistant: () => void
  messages: Message[]
  sendMessage: (content: string) => void
  summarizePatient: (patientId: string, patientName: string) => void
  suggestScheduleChange: (context: string) => void
  isTyping: boolean
  clearChat: () => void
}

interface PatientSummaryData {
  patientName: string
  age: number
  lastVisit?: string
  activeConditions: string[]
  currentMedications: { name: string; dosage: string }[]
  recentLabs: { name: string; value: string; status: 'normal' | 'abnormal' }[]
  allergies: string[]
  recentSymptoms: string[]
  visitHistory: { date: string; reason: string }[]
  aiInsights: string[]
}

// ============================================================================
// CONTEXT
// ============================================================================

const DoctorAIContext = createContext<DoctorAIContextValue | null>(null)

export function useDoctorAI() {
  const context = useContext(DoctorAIContext)
  if (!context) {
    throw new Error('useDoctorAI must be used within DoctorAIProvider')
  }
  return context
}

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

function generatePatientSummary(patientName: string): PatientSummaryData {
  return {
    patientName,
    age: 45,
    lastVisit: '2026-01-15',
    activeConditions: ['Type 2 Diabetes', 'Hypertension'],
    currentMedications: [
      { name: 'Metformin', dosage: '500mg twice daily' },
      { name: 'Lisinopril', dosage: '10mg once daily' },
      { name: 'Vitamin D', dosage: '1000 IU daily' }
    ],
    recentLabs: [
      { name: 'HbA1c', value: '6.8%', status: 'normal' },
      { name: 'Blood Pressure', value: '128/82', status: 'normal' },
      { name: 'LDL Cholesterol', value: '145 mg/dL', status: 'abnormal' }
    ],
    allergies: ['Penicillin', 'Sulfa drugs'],
    recentSymptoms: ['Occasional fatigue', 'Mild headaches'],
    visitHistory: [
      { date: '2026-01-15', reason: 'Diabetes follow-up' },
      { date: '2025-10-20', reason: 'Annual checkup' },
      { date: '2025-07-05', reason: 'Blood pressure monitoring' }
    ],
    aiInsights: [
      '📈 HbA1c improved from 7.2% to 6.8% over 3 months - good diabetes control',
      '⚠️ LDL cholesterol elevated - consider statin therapy discussion',
      '💊 Good medication adherence based on refill patterns',
      '📋 Patient reports fatigue - may be related to diabetes or medication side effects'
    ]
  }
}

function generateScheduleSuggestions() {
  return [
    {
      type: 'reschedule',
      patient: 'Ahmed Hassan',
      currentTime: '2:00 PM',
      suggestedTime: '3:30 PM',
      reason: 'Lab results will be ready by 3:00 PM - better to review during visit'
    },
    {
      type: 'add_break',
      suggestedTime: '12:30 PM',
      duration: '30 min',
      reason: 'You have back-to-back appointments from 9 AM - consider a lunch break'
    },
    {
      type: 'followup',
      patient: 'Sara Mohamed',
      suggestedDate: 'Next Tuesday',
      reason: 'Started new medication today - follow-up in 5-7 days recommended'
    }
  ]
}

// ============================================================================
// DOCTOR AI PROVIDER
// ============================================================================

interface DoctorAIProviderProps {
  children: ReactNode
  doctorName?: string
}

export function DoctorAIProvider({ children, doctorName = 'Doctor' }: DoctorAIProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)

  const generateId = () => Math.random().toString(36).substring(7)

  const addAssistantMessage = useCallback((
    content: string, 
    type?: Message['type'], 
    data?: any
  ) => {
    setIsTyping(true)
    const delay = Math.min(content.length * 8, 1200)
    
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        type: type || 'text',
        data
      }])
      setIsTyping(false)
    }, delay)
  }, [])

  const initializeChat = useCallback(() => {
    if (messages.length === 0) {
      setMessages([{
        id: generateId(),
        role: 'assistant',
        content: `Hello ${doctorName}! 👨‍⚕️

I'm your clinical AI assistant. I can help you with:

• **Patient Summary** - Quick overview before appointments
• **Schedule Optimization** - Smart scheduling suggestions
• **Clinical Insights** - Treatment recommendations
• **Documentation** - Generate notes and summaries

What would you like help with?`,
        timestamp: new Date(),
        type: 'options'
      }])
    }
  }, [messages.length, doctorName])

  const openAssistant = useCallback(() => {
    setIsOpen(true)
    initializeChat()
  }, [initializeChat])

  const closeAssistant = useCallback(() => setIsOpen(false), [])
  const toggleAssistant = useCallback(() => {
    if (!isOpen) openAssistant()
    else closeAssistant()
  }, [isOpen, openAssistant, closeAssistant])

  const clearChat = useCallback(() => {
    setMessages([])
    initializeChat()
  }, [initializeChat])

  // ============================================================================
  // AI-005: PATIENT SUMMARY
  // ============================================================================

  const summarizePatient = useCallback((patientId: string, patientName: string) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'user',
      content: `Summarize patient: ${patientName}`,
      timestamp: new Date()
    }])

    const summaryData = generatePatientSummary(patientName)
    
    const summaryContent = `## Patient Summary: ${summaryData.patientName}

**Age**: ${summaryData.age} years | **Last Visit**: ${summaryData.lastVisit ? new Date(summaryData.lastVisit).toLocaleDateString() : 'First visit'}

---

### 🏥 Active Conditions
${summaryData.activeConditions.map(c => `• ${c}`).join('\n')}

### 💊 Current Medications
${summaryData.currentMedications.map(m => `• **${m.name}** - ${m.dosage}`).join('\n')}

### 🧪 Recent Lab Results
${summaryData.recentLabs.map(l => `• ${l.name}: ${l.value} ${l.status === 'abnormal' ? '⚠️' : '✅'}`).join('\n')}

### ⚠️ Allergies
${summaryData.allergies.length > 0 ? summaryData.allergies.map(a => `• ${a}`).join('\n') : 'No known allergies'}

### 📋 Recent Symptoms (from diary)
${summaryData.recentSymptoms.length > 0 ? summaryData.recentSymptoms.map(s => `• ${s}`).join('\n') : 'No recent symptoms reported'}

---

### 🤖 AI Insights
${summaryData.aiInsights.map(i => i).join('\n')}

---

*Summary generated from patient records. Tap to view full history.*`

    addAssistantMessage(summaryContent, 'patient-summary', summaryData)
  }, [addAssistantMessage])

  // ============================================================================
  // AI-006: SCHEDULE MODIFICATION
  // ============================================================================

  const suggestScheduleChange = useCallback((context: string) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'user',
      content: `Optimize my schedule: ${context}`,
      timestamp: new Date()
    }])

    const suggestions = generateScheduleSuggestions()
    
    const scheduleContent = `## Schedule Optimization Suggestions 📅

Based on your current schedule and patient needs, here are my recommendations:

---

### 1. 🔄 Reschedule Recommendation
**Patient**: ${suggestions[0].patient}
**Current**: ${suggestions[0].currentTime} → **Suggested**: ${suggestions[0].suggestedTime}
**Reason**: ${suggestions[0].reason}

### 2. ☕ Break Recommendation  
**Time**: ${suggestions[1].suggestedTime} (${suggestions[1].duration})
**Reason**: ${suggestions[1].reason}

### 3. 📆 Follow-up Needed
**Patient**: ${suggestions[2].patient}
**Suggested**: ${suggestions[2].suggestedDate}
**Reason**: ${suggestions[2].reason}

---

Would you like me to apply any of these changes?`

    addAssistantMessage(scheduleContent, 'schedule', suggestions)
  }, [addAssistantMessage])

  // ============================================================================
  // GENERAL MESSAGE HANDLER
  // ============================================================================

  const sendMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date()
    }])

    const lowerContent = content.toLowerCase()

    // Detect intent
    if (lowerContent.includes('summarize') || lowerContent.includes('patient') || lowerContent.includes('overview')) {
      addAssistantMessage(
        "Which patient would you like me to summarize? You can also click on a patient in your appointment list to get a quick summary.",
        'text'
      )
    } else if (lowerContent.includes('schedule') || lowerContent.includes('appointment') || lowerContent.includes('reschedule')) {
      suggestScheduleChange(content)
    } else if (lowerContent.includes('note') || lowerContent.includes('document') || lowerContent.includes('soap')) {
      addAssistantMessage(
        `## Documentation Assistant 📝

I can help you generate:
• **SOAP Notes** - Structured clinical documentation
• **Referral Letters** - To specialists
• **Prescription Summaries** - For patient handoff
• **Visit Summaries** - Plain language for patients

Select a patient first, then I'll help draft the documentation.`,
        'options'
      )
    } else if (lowerContent.includes('diagnosis') || lowerContent.includes('treatment') || lowerContent.includes('recommend')) {
      addAssistantMessage(
        `## Clinical Decision Support 🏥

I can provide evidence-based suggestions for:
• Differential diagnoses based on symptoms
• Treatment protocol recommendations
• Drug interaction warnings
• Dosage calculations

**Note**: All suggestions should be verified against clinical guidelines. I'm here to assist, not replace clinical judgment.

What condition or symptoms would you like me to analyze?`,
        'text'
      )
    } else {
      addAssistantMessage(
        `I understand you're asking about: "${content}"

I can help with:
• **Patient summaries** - Say "summarize [patient name]"
• **Schedule optimization** - Say "optimize my schedule"
• **Documentation** - Say "help with notes"
• **Clinical support** - Say "diagnosis suggestions"

How can I assist you?`,
        'options'
      )
    }
  }, [addAssistantMessage, suggestScheduleChange])

  const value: DoctorAIContextValue = {
    isOpen,
    openAssistant,
    closeAssistant,
    toggleAssistant,
    messages,
    sendMessage,
    summarizePatient,
    suggestScheduleChange,
    isTyping,
    clearChat
  }

  return (
    <DoctorAIContext.Provider value={value}>
      {children}
    </DoctorAIContext.Provider>
  )
}

// ============================================================================
// FLOATING BUTTON
// ============================================================================

export function DoctorAIFloatingButton() {
  const { toggleAssistant, isOpen } = useDoctorAI()

  return (
    <button
      onClick={toggleAssistant}
      className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all z-50 ${
        isOpen 
          ? 'bg-gray-600 hover:bg-gray-700' 
          : 'bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800'
      }`}
      aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
    >
      {isOpen ? (
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <span className="text-2xl">🤖</span>
      )}
    </button>
  )
}

// ============================================================================
// CHAT PANEL
// ============================================================================

export function DoctorAIChatPanel() {
  const { 
    isOpen, 
    closeAssistant, 
    messages, 
    sendMessage, 
    isTyping,
    clearChat 
  } = useDoctorAI()
  
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      sendMessage(inputValue.trim())
      setInputValue('')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={closeAssistant} />
      
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-slide-left">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h2 className="font-semibold">Clinical AI Assistant</h2>
              <p className="text-xs text-blue-200">Powered by AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={clearChat} className="p-2 hover:bg-white/10 rounded-lg" title="Clear chat">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={closeAssistant} className="p-2 hover:bg-white/10 rounded-lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-2 border-b bg-gray-50 flex gap-2 overflow-x-auto">
          <QuickActionButton icon="📋" label="Patient Summary" action="summarize patient" />
          <QuickActionButton icon="📅" label="Optimize Schedule" action="optimize schedule" />
          <QuickActionButton icon="📝" label="Write Notes" action="help with notes" />
          <QuickActionButton icon="💊" label="Drug Check" action="check drug interactions" />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <DoctorMessageBubble key={message.id} message={message} />
          ))}
          
          {isTyping && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm">AI is thinking...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t bg-gray-50">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask anything clinical..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// QUICK ACTION BUTTON
// ============================================================================

function QuickActionButton({ icon, label, action }: { icon: string; label: string; action: string }) {
  const { sendMessage } = useDoctorAI()
  
  return (
    <button
      onClick={() => sendMessage(action)}
      className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm hover:bg-gray-100 whitespace-nowrap"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// ============================================================================
// MESSAGE BUBBLE
// ============================================================================

function DoctorMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">🤖</span>
            <span className="text-xs text-gray-500">Clinical AI</span>
          </div>
        )}
        
        <div className={`rounded-2xl px-4 py-2 ${
          isUser 
            ? 'bg-blue-600 text-white rounded-br-md' 
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        }`}>
          <div className="prose prose-sm max-w-none">
            {message.content.split('\n').map((line, i) => {
              if (line.startsWith('## ')) {
                return <h3 key={i} className={`font-bold text-base mt-2 mb-1 ${isUser ? 'text-white' : ''}`}>{line.replace('## ', '')}</h3>
              }
              if (line.startsWith('### ')) {
                return <h4 key={i} className={`font-semibold text-sm mt-2 mb-1 ${isUser ? 'text-white' : ''}`}>{line.replace('### ', '')}</h4>
              }
              if (line.includes('**')) {
                const parts = line.split(/\*\*(.*?)\*\*/g)
                return (
                  <p key={i} className="text-sm my-1">
                    {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
                  </p>
                )
              }
              if (line.startsWith('• ') || line.startsWith('- ')) {
                return <p key={i} className="text-sm my-0.5 ml-2">{line}</p>
              }
              if (line === '---') {
                return <hr key={i} className={`my-2 ${isUser ? 'border-blue-400' : 'border-gray-300'}`} />
              }
              if (line.trim() === '') return <div key={i} className="h-2" />
              return <p key={i} className="text-sm my-1">{line}</p>
            })}
          </div>
        </div>

        <div className={`text-xs mt-1 ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PATIENT CARD AI BUTTON (for appointment list integration)
// ============================================================================

export function PatientSummaryButton({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { openAssistant, summarizePatient } = useDoctorAI()

  const handleClick = () => {
    openAssistant()
    setTimeout(() => summarizePatient(patientId, patientName), 500)
  }

  return (
    <button
      onClick={handleClick}
      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      title="AI Summary"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    </button>
  )
}

// ============================================================================
// DASHBOARD WIDGET
// ============================================================================

export function DoctorAIDashboardWidget() {
  const { openAssistant, suggestScheduleChange } = useDoctorAI()

  return (
    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🤖</span>
            <h3 className="font-semibold text-lg">Clinical AI Assistant</h3>
          </div>
          <p className="text-blue-200 text-sm">Your intelligent clinical copilot</p>
        </div>
        <span className="px-2 py-1 bg-white/20 rounded-full text-xs">AI Powered</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={openAssistant}
          className="bg-white/10 hover:bg-white/20 rounded-xl p-3 text-center transition-colors"
        >
          <div className="text-2xl mb-1">📋</div>
          <div className="text-xs">Summaries</div>
        </button>
        <button
          onClick={() => { openAssistant(); setTimeout(() => suggestScheduleChange('optimize'), 500) }}
          className="bg-white/10 hover:bg-white/20 rounded-xl p-3 text-center transition-colors"
        >
          <div className="text-2xl mb-1">📅</div>
          <div className="text-xs">Schedule</div>
        </button>
      </div>
      
      <button
        onClick={openAssistant}
        className="w-full py-2 bg-white text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
      >
        <span>💬</span>
        Open Assistant
      </button>
    </div>
  )
}

// ============================================================================
// LAYOUT WRAPPER
// ============================================================================

export function DoctorAILayout({ children, doctorName }: { children: ReactNode; doctorName?: string }) {
  return (
    <DoctorAIProvider doctorName={doctorName}>
      {children}
      <DoctorAIFloatingButton />
      <DoctorAIChatPanel />
    </DoctorAIProvider>
  )
}
