'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'

// ============================================================================
// TOOLTIP COMPONENT
// DS-001: Inline help tooltips on all confusing labels
// ============================================================================

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  maxWidth?: number
  delay?: number
}

export function Tooltip({ 
  content, 
  children, 
  position = 'top',
  maxWidth = 250,
  delay = 200
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      
      let top = 0
      let left = 0
      
      switch (position) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - 8
          left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
          break
        case 'bottom':
          top = triggerRect.bottom + 8
          left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
          break
        case 'left':
          top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2)
          left = triggerRect.left - tooltipRect.width - 8
          break
        case 'right':
          top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2)
          left = triggerRect.right + 8
          break
      }
      
      // Keep tooltip within viewport
      const padding = 10
      if (left < padding) left = padding
      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding
      }
      if (top < padding) top = padding
      if (top + tooltipRect.height > window.innerHeight - padding) {
        top = window.innerHeight - tooltipRect.height - padding
      }
      
      setCoords({ top, left })
    }
  }, [isVisible, position])

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="inline-flex cursor-help"
      >
        {children}
      </span>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-50 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg shadow-lg pointer-events-none animate-fade-in"
          style={{
            top: coords.top,
            left: coords.left,
            maxWidth: maxWidth
          }}
        >
          {content}
          <div 
            className={`absolute w-2 h-2 bg-gray-900 transform rotate-45 ${
              position === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2' :
              position === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2' :
              position === 'left' ? 'right-[-4px] top-1/2 -translate-y-1/2' :
              'left-[-4px] top-1/2 -translate-y-1/2'
            }`}
          />
        </div>
      )}
    </>
  )
}

// ============================================================================
// HELP ICON COMPONENT
// Small "?" or "i" icon that shows tooltip on hover
// ============================================================================

interface HelpIconProps {
  content: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md' | 'lg'
  variant?: 'question' | 'info'
}

export function HelpIcon({ 
  content, 
  position = 'top',
  size = 'sm',
  variant = 'info'
}: HelpIconProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 text-xs',
    md: 'w-5 h-5 text-sm',
    lg: 'w-6 h-6 text-base'
  }

  return (
    <Tooltip content={content} position={position}>
      <span 
        className={`inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 ${sizeClasses[size]}`}
        aria-label="Help"
      >
        {variant === 'question' ? '?' : 'i'}
      </span>
    </Tooltip>
  )
}

// ============================================================================
// INFO BADGE COMPONENT
// Inline badge with tooltip for status explanations
// ============================================================================

interface InfoBadgeProps {
  label: string
  tooltip: string
  color?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'
}

export function InfoBadge({ label, tooltip, color = 'gray' }: InfoBadgeProps) {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200'
  }

  return (
    <Tooltip content={tooltip}>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${colorClasses[color]}`}>
        {label}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    </Tooltip>
  )
}

// ============================================================================
// STATUS LEGEND COMPONENT
// Shows all statuses with explanations (UX-P005, UX-D008)
// ============================================================================

interface StatusLegendItem {
  label: string
  description: string
  color: string
  dotColor: string
}

interface StatusLegendProps {
  items: StatusLegendItem[]
  title?: string
  compact?: boolean
}

export function StatusLegend({ items, title = 'Status Guide', compact = false }: StatusLegendProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {title}
        </button>
        
        {isExpanded && (
          <div className="absolute top-full left-0 mt-2 p-3 bg-white rounded-lg shadow-lg border border-gray-200 z-40 min-w-[250px]">
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${item.dotColor}`} />
                  <div>
                    <span className="font-medium text-sm text-gray-900">{item.label}</span>
                    <p className="text-xs text-gray-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h4 className="text-sm font-medium text-gray-700 mb-3">{title}</h4>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${item.dotColor}`} />
            <div>
              <span className="font-medium text-sm text-gray-900">{item.label}</span>
              <p className="text-xs text-gray-500">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// CONTEXTUAL HELP PANEL
// Expandable help section for complex features
// ============================================================================

interface HelpPanelProps {
  title: string
  children: ReactNode
  defaultExpanded?: boolean
}

export function HelpPanel({ title, children, defaultExpanded = false }: HelpPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium text-blue-800">{title}</span>
        </div>
        <svg 
          className={`w-5 h-5 text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 text-sm text-blue-800">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PREBUILT LEGENDS FOR MEDASSIST
// ============================================================================

// Medication Status Legend (UX-P005)
export const MEDICATION_STATUS_LEGEND: StatusLegendItem[] = [
  {
    label: 'Active',
    description: 'Medication you are currently taking',
    color: 'green',
    dotColor: 'bg-green-500'
  },
  {
    label: 'Pending',
    description: 'New prescription waiting for your acceptance',
    color: 'yellow',
    dotColor: 'bg-yellow-500'
  },
  {
    label: 'From Doctor',
    description: 'Prescribed by your doctor during a visit',
    color: 'blue',
    dotColor: 'bg-blue-500'
  },
  {
    label: 'Manual Entry',
    description: 'Medication you added yourself',
    color: 'purple',
    dotColor: 'bg-purple-500'
  },
  {
    label: 'Expired',
    description: 'Treatment period has ended',
    color: 'gray',
    dotColor: 'bg-gray-400'
  },
  {
    label: 'Declined',
    description: 'Prescription you chose not to take',
    color: 'red',
    dotColor: 'bg-red-400'
  }
]

// Appointment Status Legend (UX-D008)
export const APPOINTMENT_STATUS_LEGEND: StatusLegendItem[] = [
  {
    label: "Today's",
    description: 'Appointments scheduled for today',
    color: 'blue',
    dotColor: 'bg-blue-500'
  },
  {
    label: 'Confirmed',
    description: 'Patient has confirmed attendance',
    color: 'green',
    dotColor: 'bg-green-500'
  },
  {
    label: 'Pending',
    description: 'Awaiting patient confirmation',
    color: 'yellow',
    dotColor: 'bg-yellow-500'
  },
  {
    label: 'Completed',
    description: 'Visit finished, session documented',
    color: 'gray',
    dotColor: 'bg-gray-500'
  },
  {
    label: 'Cancelled',
    description: 'Appointment was cancelled',
    color: 'red',
    dotColor: 'bg-red-400'
  },
  {
    label: 'No Show',
    description: 'Patient did not attend',
    color: 'red',
    dotColor: 'bg-red-600'
  }
]

// Patient Search Scope Help (UX-D002)
export const PATIENT_SEARCH_HELP = {
  title: 'Patient Search',
  content: (
    <div className="space-y-2">
      <p><strong>Search shows:</strong></p>
      <ul className="list-disc list-inside space-y-1 ml-2">
        <li><strong>Your patients</strong> - Anyone you've treated before</li>
        <li><strong>Walk-in patients</strong> - Created during sessions</li>
        <li><strong>Registered patients</strong> - Who have the MedAssist app</li>
      </ul>
      <p className="text-xs text-gray-500 mt-2">
        Search by name, phone number, or patient ID
      </p>
    </div>
  )
}

// Dependent Patient Help (UX-D003)
export const DEPENDENT_PATIENT_HELP = {
  title: 'Dependent Patients (Children)',
  content: (
    <div className="space-y-2">
      <p>A <strong>dependent patient</strong> is typically a child linked to a parent's account.</p>
      <ul className="list-disc list-inside space-y-1 ml-2">
        <li>The parent manages their medical records</li>
        <li>Notifications go to the parent's phone</li>
        <li>Parent can accept/decline medications on their behalf</li>
      </ul>
      <p className="text-xs text-gray-500 mt-2">
        To add a dependent: Enter child's info, then select "This is a dependent of" and search for the parent.
      </p>
    </div>
  )
}

// Walk-in Patient Storage Help (UX-D004)
export const WALKIN_PATIENT_HELP = {
  title: 'Walk-in Patient Records',
  content: (
    <div className="space-y-2">
      <p>Walk-in patients are stored <strong>globally</strong> in the system.</p>
      <ul className="list-disc list-inside space-y-1 ml-2">
        <li>Any doctor can find them by phone number</li>
        <li>Medical records are shared across clinics</li>
        <li>If they register later, records are linked automatically</li>
      </ul>
      <p className="text-xs text-gray-500 mt-2">
        Privacy note: Clinical notes are only visible to the doctor who created them until the patient registers and grants access.
      </p>
    </div>
  )
}

// Pending Actions Help (UX-P002)
export const PENDING_ACTIONS_HELP = {
  title: 'What are Pending Actions?',
  content: (
    <div className="space-y-2">
      <p>Pending actions are items that need your attention:</p>
      <ul className="list-disc list-inside space-y-1 ml-2">
        <li><strong>New medications</strong> - Prescriptions from your doctor</li>
        <li><strong>Lab results</strong> - Test results ready to view</li>
        <li><strong>Messages</strong> - Unread messages from your doctor</li>
      </ul>
      <p className="text-xs text-gray-500 mt-2">
        Tap each item to review and take action. Items expire after 2 weeks if not addressed.
      </p>
    </div>
  )
}
