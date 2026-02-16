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
  type?: 'text' | 'options' | 'symptom-check' | 'summary' | 'medication'
  options?: ChatOption[]
  data?: any
}

interface ChatOption {
  id: string
  label: string
  value: string
  icon?: string
}

interface ShefaContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  startSymptomCheck: () => void
  startHealthSummary: () => void
  startMedicationAssistant: () => void
  messages: Message[]
  sendMessage: (content: string) => void
  selectOption: (option: ChatOption) => void
  isTyping: boolean
  clearChat: () => void
}

// ============================================================================
// CONTEXT
// ============================================================================

const ShefaContext = createContext<ShefaContextValue | null>(null)

export function useShefa() {
  const context = useContext(ShefaContext)
  if (!context) {
    throw new Error('useShefa must be used within ShefaProvider')
  }
  return context
}

// ============================================================================
// MOCK RESPONSES (Will be replaced with real AI later)
// ============================================================================

const SHEFA_INTRO = `مرحباً! أنا شفاء 👋

I'm Shefa, your personal health assistant. I can help you with:

• 🩺 **Check Symptoms** - Describe how you're feeling
• 📊 **Health Summary** - Review your health data
• 💊 **Medication Help** - Drug info & interactions

How can I help you today?`

const SYMPTOM_QUESTIONS = [
  {
    id: 'location',
    question: "Where are you experiencing the symptom?",
    options: [
      { id: 'head', label: 'Head', value: 'head', icon: '🧠' },
      { id: 'chest', label: 'Chest', value: 'chest', icon: '🫁' },
      { id: 'abdomen', label: 'Abdomen', value: 'abdomen', icon: '🫃' },
      { id: 'other', label: 'Other', value: 'other', icon: '🦴' }
    ]
  },
  {
    id: 'duration',
    question: "How long have you had this symptom?",
    options: [
      { id: 'hours', label: 'A few hours', value: 'hours', icon: '⏰' },
      { id: 'days', label: '1-3 days', value: 'days', icon: '📅' },
      { id: 'week', label: 'About a week', value: 'week', icon: '📆' },
      { id: 'longer', label: 'Longer', value: 'longer', icon: '🗓️' }
    ]
  },
  {
    id: 'severity',
    question: "How severe is it on a scale of 1-10?",
    options: [
      { id: 'mild', label: 'Mild (1-3)', value: 'mild', icon: '😊' },
      { id: 'moderate', label: 'Moderate (4-6)', value: 'moderate', icon: '😐' },
      { id: 'severe', label: 'Severe (7-9)', value: 'severe', icon: '😣' },
      { id: 'extreme', label: 'Extreme (10)', value: 'extreme', icon: '🚨' }
    ]
  }
]

// ============================================================================
// SHEFA PROVIDER
// ============================================================================

interface ShefaProviderProps {
  children: ReactNode
  patientData?: {
    name?: string
    medications?: any[]
    conditions?: any[]
    recentLabs?: any[]
  }
}

export function ShefaProvider({ children, patientData }: ShefaProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [currentFlow, setCurrentFlow] = useState<'chat' | 'symptoms' | 'summary' | 'medication'>('chat')
  const [symptomState, setSymptomState] = useState({ step: 0, answers: {} as Record<string, string> })

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substring(7)

  // Add message with typing simulation
  const addAssistantMessage = useCallback((content: string, type?: Message['type'], options?: ChatOption[], data?: any) => {
    setIsTyping(true)
    
    // Simulate typing delay
    const delay = Math.min(content.length * 10, 1500)
    
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        type: type || 'text',
        options,
        data
      }])
      setIsTyping(false)
    }, delay)
  }, [])

  // Initialize chat
  const initializeChat = useCallback(() => {
    if (messages.length === 0) {
      setMessages([{
        id: generateId(),
        role: 'assistant',
        content: SHEFA_INTRO,
        timestamp: new Date(),
        type: 'options',
        options: [
          { id: 'symptoms', label: 'Check Symptoms', value: 'symptoms', icon: '🩺' },
          { id: 'summary', label: 'Health Summary', value: 'summary', icon: '📊' },
          { id: 'medication', label: 'Medication Help', value: 'medication', icon: '💊' }
        ]
      }])
    }
  }, [messages.length])

  // Open chat
  const openChat = useCallback(() => {
    setIsOpen(true)
    initializeChat()
  }, [initializeChat])

  const closeChat = useCallback(() => setIsOpen(false), [])
  const toggleChat = useCallback(() => {
    if (!isOpen) {
      openChat()
    } else {
      closeChat()
    }
  }, [isOpen, openChat, closeChat])

  // Clear chat
  const clearChat = useCallback(() => {
    setMessages([])
    setCurrentFlow('chat')
    setSymptomState({ step: 0, answers: {} })
    initializeChat()
  }, [initializeChat])

  // Send user message
  const sendMessage = (content: string) => {
    // Add user message
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date()
    }])

    // Process based on current flow
    if (currentFlow === 'symptoms') {
      processSymptomResponse(content)
    } else if (currentFlow === 'medication') {
      processMedicationQuery(content)
    } else {
      // General chat - detect intent
      const lowerContent = content.toLowerCase()
      if (lowerContent.includes('symptom') || lowerContent.includes('feel') || lowerContent.includes('pain') || lowerContent.includes('sick')) {
        startSymptomCheck()
      } else if (lowerContent.includes('medication') || lowerContent.includes('drug') || lowerContent.includes('medicine')) {
        startMedicationAssistant()
      } else if (lowerContent.includes('summary') || lowerContent.includes('health') || lowerContent.includes('overview')) {
        startHealthSummary()
      } else {
        addAssistantMessage(
          "I understand you're asking about: \"" + content + "\"\n\nI can help you with:\n• **Symptom checking** - Tell me what you're feeling\n• **Health summary** - Overview of your health data\n• **Medication info** - Drug information and interactions\n\nWhat would you like to explore?",
          'options',
          [
            { id: 'symptoms', label: 'Check Symptoms', value: 'symptoms', icon: '🩺' },
            { id: 'summary', label: 'Health Summary', value: 'summary', icon: '📊' },
            { id: 'medication', label: 'Medication Help', value: 'medication', icon: '💊' }
          ]
        )
      }
    }
  }

  // Select option
  const selectOption = (option: ChatOption) => {
    // Add selection as user message
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'user',
      content: option.label,
      timestamp: new Date()
    }])

    // Handle based on option
    switch (option.value) {
      case 'symptoms':
        startSymptomCheck()
        break
      case 'summary':
        startHealthSummary()
        break
      case 'medication':
        startMedicationAssistant()
        break
      default:
        // Symptom flow options
        if (currentFlow === 'symptoms') {
          processSymptomOption(option)
        }
    }
  }

  // ============================================================================
  // SYMPTOM CHECK FLOW (AI-002)
  // ============================================================================

  const startSymptomCheck = useCallback(() => {
    setCurrentFlow('symptoms')
    setSymptomState({ step: 0, answers: {} })
    
    addAssistantMessage(
      "Let's check your symptoms. I'll ask you a few questions to better understand how you're feeling.\n\n" + SYMPTOM_QUESTIONS[0].question,
      'options',
      SYMPTOM_QUESTIONS[0].options
    )
  }, [addAssistantMessage])

  const processSymptomOption = (option: ChatOption) => {
    const newAnswers = { ...symptomState.answers, [SYMPTOM_QUESTIONS[symptomState.step].id]: option.value }
    const nextStep = symptomState.step + 1

    if (nextStep < SYMPTOM_QUESTIONS.length) {
      setSymptomState({ step: nextStep, answers: newAnswers })
      addAssistantMessage(
        SYMPTOM_QUESTIONS[nextStep].question,
        'options',
        SYMPTOM_QUESTIONS[nextStep].options
      )
    } else {
      // Complete symptom check
      setSymptomState({ step: 0, answers: {} })
      generateSymptomAnalysis(newAnswers)
    }
  }

  const processSymptomResponse = useCallback((content: string) => {
    // Free text symptom description
    addAssistantMessage(
      `Thank you for describing your symptoms. Based on what you've told me:\n\n**"${content}"**\n\nLet me ask a few follow-up questions to better understand your condition.`,
      'options',
      SYMPTOM_QUESTIONS[0].options
    )
    setSymptomState({ step: 0, answers: { description: content } })
  }, [addAssistantMessage])

  const generateSymptomAnalysis = useCallback((answers: Record<string, string>) => {
    setCurrentFlow('chat')
    
    // Mock analysis based on answers
    const severity = answers.severity || 'moderate'
    const location = answers.location || 'unknown'
    
    let recommendation = ''
    let urgency = 'low'
    
    if (severity === 'extreme' || severity === 'severe') {
      urgency = 'high'
      recommendation = '🚨 **Urgent**: Based on the severity you described, I recommend seeking medical attention soon. Please contact your doctor or visit an urgent care facility.'
    } else if (severity === 'moderate') {
      urgency = 'medium'
      recommendation = '⚠️ **Recommendation**: Monitor your symptoms over the next 24-48 hours. If they worsen or don\'t improve, schedule an appointment with your doctor.'
    } else {
      urgency = 'low'
      recommendation = '✅ **Recommendation**: Your symptoms appear mild. Rest, stay hydrated, and monitor for any changes. If symptoms persist for more than a few days, consult your doctor.'
    }

    const analysis = `## Symptom Analysis

**Location**: ${location.charAt(0).toUpperCase() + location.slice(1)}
**Duration**: ${answers.duration || 'Not specified'}
**Severity**: ${severity.charAt(0).toUpperCase() + severity.slice(1)}

---

${recommendation}

---

⚕️ *This is not a medical diagnosis. Always consult a healthcare professional for medical advice.*

Would you like to:
• Book an appointment with your doctor
• Log this in your health diary
• Learn more about related conditions`

    addAssistantMessage(analysis, 'symptom-check', [
      { id: 'book', label: 'Book Appointment', value: 'book', icon: '📅' },
      { id: 'diary', label: 'Log to Diary', value: 'diary', icon: '📔' },
      { id: 'done', label: 'Done', value: 'done', icon: '✓' }
    ], { urgency, answers })
  }, [addAssistantMessage])

  // ============================================================================
  // HEALTH SUMMARY FLOW (AI-003)
  // ============================================================================

  const startHealthSummary = useCallback(() => {
    setCurrentFlow('chat')
    
    // Generate mock health summary
    const summary = `## Your Health Summary 📊

### Active Medications (${patientData?.medications?.length || 3})
${patientData?.medications?.map(m => `• ${m.name} - ${m.dosage}`).join('\n') || 
`• Metformin 500mg - Twice daily
• Vitamin D 1000 IU - Once daily
• Lisinopril 10mg - Once daily`}

### Active Conditions
${patientData?.conditions?.map(c => `• ${c.name}`).join('\n') || 
`• Type 2 Diabetes (managed)
• Hypertension (controlled)`}

### Recent Lab Highlights
${patientData?.recentLabs?.map(l => `• ${l.name}: ${l.value} ${l.status === 'normal' ? '✅' : '⚠️'}`).join('\n') || 
`• HbA1c: 6.8% ✅ (improved from 7.2%)
• Blood Pressure: 128/82 ✅
• Cholesterol: 195 mg/dL ⚠️ (slightly elevated)`}

### Wellness Trends
📈 Your mood has been **good** this week (avg 4.2/5)
😴 Average sleep: **6.5 hours** (could be better)
⚡ Energy levels: **moderate**

---

**AI Insights:**
Your diabetes management is showing improvement based on your recent HbA1c levels. Consider discussing cholesterol management with your doctor at your next visit.

What would you like to know more about?`

    addAssistantMessage(summary, 'summary', [
      { id: 'medications', label: 'Medication Details', value: 'medications', icon: '💊' },
      { id: 'trends', label: 'Health Trends', value: 'trends', icon: '📈' },
      { id: 'recommendations', label: 'Recommendations', value: 'recommendations', icon: '💡' }
    ])
  }, [patientData, addAssistantMessage])

  // ============================================================================
  // MEDICATION ASSISTANT FLOW (AI-004)
  // ============================================================================

  const startMedicationAssistant = useCallback(() => {
    setCurrentFlow('medication')
    
    addAssistantMessage(
      "I can help you with medication information. What would you like to know?\n\n• Drug information and side effects\n• Interaction checking\n• Dosage reminders\n• Generic alternatives\n\nType the name of a medication or ask a question.",
      'options',
      [
        { id: 'interactions', label: 'Check Interactions', value: 'interactions', icon: '⚠️' },
        { id: 'sideeffects', label: 'Side Effects', value: 'sideeffects', icon: '📋' },
        { id: 'reminders', label: 'Set Reminders', value: 'reminders', icon: '⏰' }
      ]
    )
  }, [addAssistantMessage])

  const processMedicationQuery = useCallback((query: string) => {
    setCurrentFlow('chat')
    
    // Mock medication response
    const mockDrugInfo = `## ${query.charAt(0).toUpperCase() + query.slice(1)} Information

**Generic Name**: ${query}
**Drug Class**: Common Medication
**Used For**: Various conditions

### Common Side Effects
• Headache
• Nausea
• Dizziness
• Fatigue

### Important Warnings
⚠️ Do not take with alcohol
⚠️ May cause drowsiness

### Interactions with Your Medications
Based on your current medications, I found:
✅ No major interactions detected

---

*Always consult your doctor or pharmacist before making changes to your medications.*

Would you like more information?`

    addAssistantMessage(mockDrugInfo, 'medication', [
      { id: 'another', label: 'Ask About Another Drug', value: 'another', icon: '💊' },
      { id: 'interactions', label: 'Full Interaction Check', value: 'interactions', icon: '⚠️' },
      { id: 'done', label: 'Done', value: 'done', icon: '✓' }
    ])
  }, [addAssistantMessage])

  const value: ShefaContextValue = {
    isOpen,
    openChat,
    closeChat,
    toggleChat,
    startSymptomCheck,
    startHealthSummary,
    startMedicationAssistant,
    messages,
    sendMessage,
    selectOption,
    isTyping,
    clearChat
  }

  return (
    <ShefaContext.Provider value={value}>
      {children}
    </ShefaContext.Provider>
  )
}

// ============================================================================
// FLOATING BUTTON COMPONENT
// ============================================================================

export function ShefaFloatingButton() {
  const { toggleChat, isOpen } = useShefa()
  const [hasNewMessage, setHasNewMessage] = useState(false)

  return (
    <button
      onClick={toggleChat}
      className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all z-50 ${
        isOpen 
          ? 'bg-gray-600 hover:bg-gray-700 rotate-0' 
          : 'bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-600 hover:to-primary-800'
      }`}
      aria-label={isOpen ? 'Close Shefa' : 'Open Shefa'}
    >
      {isOpen ? (
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <>
          <span className="text-2xl">🌟</span>
          {hasNewMessage && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          )}
        </>
      )}
    </button>
  )
}

// ============================================================================
// CHAT DRAWER COMPONENT
// ============================================================================

export function ShefaChatDrawer() {
  const { 
    isOpen, 
    closeChat, 
    messages, 
    sendMessage, 
    selectOption, 
    isTyping,
    clearChat 
  } = useShefa()
  
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Focus input when opened
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
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30 animate-fade-in"
        onClick={closeChat}
      />
      
      {/* Drawer */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slide-left">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary-600 to-primary-700 text-white">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌟</span>
            <div>
              <h2 className="font-semibold">Shefa</h2>
              <p className="text-xs text-primary-200">Your Health Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearChat}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Clear chat"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={closeChat}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <MessageBubble 
              key={message.id} 
              message={message} 
              onSelectOption={selectOption}
            />
          ))}
          
          {isTyping && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm">Shefa is typing...</span>
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
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="px-4 py-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
// MESSAGE BUBBLE COMPONENT
// ============================================================================

interface MessageBubbleProps {
  message: Message
  onSelectOption: (option: ChatOption) => void
}

function MessageBubble({ message, onSelectOption }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">🌟</span>
            <span className="text-xs text-gray-500">Shefa</span>
          </div>
        )}
        
        <div className={`rounded-2xl px-4 py-2 ${
          isUser 
            ? 'bg-primary-600 text-white rounded-br-md' 
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        }`}>
          {/* Render markdown-like content */}
          <div className="prose prose-sm max-w-none">
            {message.content.split('\n').map((line, i) => {
              // Headers
              if (line.startsWith('## ')) {
                return <h3 key={i} className={`font-bold text-base mt-2 mb-1 ${isUser ? 'text-white' : ''}`}>{line.replace('## ', '')}</h3>
              }
              if (line.startsWith('### ')) {
                return <h4 key={i} className={`font-semibold text-sm mt-2 mb-1 ${isUser ? 'text-white' : ''}`}>{line.replace('### ', '')}</h4>
              }
              // Bold
              if (line.includes('**')) {
                const parts = line.split(/\*\*(.*?)\*\*/g)
                return (
                  <p key={i} className="text-sm my-1">
                    {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
                  </p>
                )
              }
              // List items
              if (line.startsWith('• ') || line.startsWith('- ')) {
                return <p key={i} className="text-sm my-0.5 ml-2">{line}</p>
              }
              // Horizontal rule
              if (line === '---') {
                return <hr key={i} className={`my-2 ${isUser ? 'border-primary-400' : 'border-gray-300'}`} />
              }
              // Empty line
              if (line.trim() === '') {
                return <div key={i} className="h-2" />
              }
              // Regular text
              return <p key={i} className="text-sm my-1">{line}</p>
            })}
          </div>
        </div>

        {/* Options */}
        {message.options && message.options.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.options.map((option) => (
              <button
                key={option.id}
                onClick={() => onSelectOption(option)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm hover:bg-gray-50 hover:border-primary-300 transition-colors"
              >
                {option.icon && <span>{option.icon}</span>}
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div className={`text-xs mt-1 ${isUser ? 'text-primary-200' : 'text-gray-400'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// QUICK ACCESS CARDS (for Dashboard integration)
// ============================================================================

export function ShefaQuickActions() {
  const { openChat, startSymptomCheck, startHealthSummary, startMedicationAssistant } = useShefa()

  return (
    <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border border-primary-200">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🌟</span>
        <div>
          <h3 className="font-semibold text-primary-900">Shefa AI Assistant</h3>
          <p className="text-sm text-primary-700">Your personal health helper</p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => { openChat(); setTimeout(startSymptomCheck, 500) }}
          className="p-3 bg-white rounded-lg hover:shadow-md transition-shadow text-center"
        >
          <div className="text-xl mb-1">🩺</div>
          <div className="text-xs font-medium text-gray-700">Symptoms</div>
        </button>
        <button
          onClick={() => { openChat(); setTimeout(startHealthSummary, 500) }}
          className="p-3 bg-white rounded-lg hover:shadow-md transition-shadow text-center"
        >
          <div className="text-xl mb-1">📊</div>
          <div className="text-xs font-medium text-gray-700">Summary</div>
        </button>
        <button
          onClick={() => { openChat(); setTimeout(startMedicationAssistant, 500) }}
          className="p-3 bg-white rounded-lg hover:shadow-md transition-shadow text-center"
        >
          <div className="text-xl mb-1">💊</div>
          <div className="text-xs font-medium text-gray-700">Medications</div>
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// EXPORT ALL
// ============================================================================
