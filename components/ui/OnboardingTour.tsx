'use client'

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface TourStep {
  target: string // CSS selector
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  spotlightPadding?: number
  disableOverlay?: boolean
  onNext?: () => void
  onPrev?: () => void
}

interface TourConfig {
  id: string
  steps: TourStep[]
  onComplete?: () => void
  onSkip?: () => void
}

interface TourContextValue {
  startTour: (config: TourConfig) => void
  endTour: () => void
  isActive: boolean
  currentStep: number
}

// ============================================================================
// CONTEXT
// ============================================================================

const TourContext = createContext<TourContextValue | null>(null)

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within TourProvider')
  }
  return context
}

// ============================================================================
// TOUR PROVIDER
// ============================================================================

interface TourProviderProps {
  children: ReactNode
}

export function TourProvider({ children }: TourProviderProps) {
  const [config, setConfig] = useState<TourConfig | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const isActive = config !== null

  // Find and highlight target element
  useEffect(() => {
    if (!config || currentStep >= config.steps.length) return

    const step = config.steps[currentStep]
    const element = document.querySelector(step.target)

    if (element) {
      const rect = element.getBoundingClientRect()
      setTargetRect(rect)
      
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      setTargetRect(null)
    }
  }, [config, currentStep])

  const startTour = useCallback((newConfig: TourConfig) => {
    // Check if tour was already completed
    const completedTours = JSON.parse(localStorage.getItem('completedTours') || '[]')
    if (completedTours.includes(newConfig.id)) {
      return // Don't show if already completed
    }

    setConfig(newConfig)
    setCurrentStep(0)
    document.body.style.overflow = 'hidden'
  }, [])

  const endTour = useCallback(() => {
    if (config) {
      // Mark tour as completed
      const completedTours = JSON.parse(localStorage.getItem('completedTours') || '[]')
      if (!completedTours.includes(config.id)) {
        completedTours.push(config.id)
        localStorage.setItem('completedTours', JSON.stringify(completedTours))
      }
    }
    
    setConfig(null)
    setCurrentStep(0)
    setTargetRect(null)
    document.body.style.overflow = ''
  }, [config])

  const handleNext = useCallback(() => {
    if (!config) return

    const step = config.steps[currentStep]
    step.onNext?.()

    if (currentStep < config.steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      config.onComplete?.()
      endTour()
    }
  }, [config, currentStep, endTour])

  const handlePrev = useCallback(() => {
    if (!config) return

    const step = config.steps[currentStep]
    step.onPrev?.()

    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [config, currentStep])

  const handleSkip = useCallback(() => {
    config?.onSkip?.()
    endTour()
  }, [config, endTour])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrev, handleSkip, isActive])

  // Calculate tooltip position
  const getTooltipStyle = () => {
    if (!targetRect || !config) return {}

    const step = config.steps[currentStep]
    const placement = step.placement || 'bottom'
    const padding = step.spotlightPadding || 8
    const tooltipMargin = 16

    switch (placement) {
      case 'top':
        return {
          top: targetRect.top - tooltipMargin,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translate(-50%, -100%)'
        }
      case 'bottom':
        return {
          top: targetRect.bottom + padding + tooltipMargin,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)'
        }
      case 'left':
        return {
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.left - tooltipMargin,
          transform: 'translate(-100%, -50%)'
        }
      case 'right':
        return {
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.right + padding + tooltipMargin,
          transform: 'translateY(-50%)'
        }
    }
  }

  return (
    <TourContext.Provider value={{ startTour, endTour, isActive, currentStep }}>
      {children}

      {/* Tour Overlay */}
      {isActive && config && (
        <div className="fixed inset-0 z-[9999]">
          {/* Dark overlay with spotlight cutout */}
          <svg className="absolute inset-0 w-full h-full">
            <defs>
              <mask id="spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {targetRect && (
                  <rect
                    x={targetRect.left - 8}
                    y={targetRect.top - 8}
                    width={targetRect.width + 16}
                    height={targetRect.height + 16}
                    rx="8"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.7)"
              mask="url(#spotlight-mask)"
            />
          </svg>

          {/* Spotlight border */}
          {targetRect && (
            <div
              className="absolute border-2 border-primary-500 rounded-lg pointer-events-none animate-pulse"
              style={{
                top: targetRect.top - 8,
                left: targetRect.left - 8,
                width: targetRect.width + 16,
                height: targetRect.height + 16,
              }}
            />
          )}

          {/* Tooltip */}
          <div
            className="absolute bg-white rounded-xl shadow-2xl p-6 max-w-sm animate-scale-in"
            style={getTooltipStyle()}
          >
            {/* Progress dots */}
            <div className="flex justify-center gap-1 mb-4">
              {config.steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx === currentStep ? 'bg-primary-600' : 
                    idx < currentStep ? 'bg-primary-300' : 
                    'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {config.steps[currentStep].title}
            </h3>
            <p className="text-gray-600 mb-6">
              {config.steps[currentStep].content}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Skip Tour
              </button>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrev}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {currentStep === config.steps.length - 1 ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>

            {/* Step counter */}
            <div className="text-center text-xs text-gray-400 mt-4">
              Step {currentStep + 1} of {config.steps.length}
            </div>
          </div>
        </div>
      )}
    </TourContext.Provider>
  )
}

// ============================================================================
// PREDEFINED TOURS
// ============================================================================

export const PATIENT_ONBOARDING_TOUR: TourConfig = {
  id: 'patient-onboarding',
  steps: [
    {
      target: '[data-tour="dashboard"]',
      title: 'Welcome to MedAssist! 👋',
      content: 'This is your health dashboard where you can see an overview of your health information.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="pending-actions"]',
      title: 'Pending Actions',
      content: 'These are items that need your attention, like new prescriptions from your doctor or lab results.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="medications"]',
      title: 'Your Medications',
      content: 'View and manage your medications here. You can accept prescriptions from doctors or add your own.',
      placement: 'right'
    },
    {
      target: '[data-tour="health-record"]',
      title: 'Health Record',
      content: 'Access your complete health record including lab results, visit history, and more.',
      placement: 'right'
    },
    {
      target: '[data-tour="diary"]',
      title: 'Health Diary',
      content: 'Track how you feel daily with our diary feature. This helps your doctor understand your health better.',
      placement: 'right'
    },
    {
      target: '[data-tour="profile"]',
      title: 'Your Profile',
      content: 'Update your personal information and preferences here.',
      placement: 'bottom'
    }
  ],
  onComplete: () => {
    console.log('Patient onboarding complete!')
  }
}

export const DOCTOR_ONBOARDING_TOUR: TourConfig = {
  id: 'doctor-onboarding',
  steps: [
    {
      target: '[data-tour="dashboard"]',
      title: 'Welcome to MedAssist! 👨‍⚕️',
      content: 'This is your clinical dashboard where you can manage appointments and patients.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="appointments"]',
      title: "Today's Appointments",
      content: 'View and manage your appointments. Click on any appointment to start a clinical session.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="patient-search"]',
      title: 'Patient Search',
      content: 'Search for patients by name or phone number. You can also create walk-in patients.',
      placement: 'right'
    },
    {
      target: '[data-tour="schedule"]',
      title: 'Your Schedule',
      content: 'Manage your availability and working hours here.',
      placement: 'right'
    },
    {
      target: '[data-tour="session"]',
      title: 'Clinical Session',
      content: 'Start a session to document visits, prescribe medications, and order labs.',
      placement: 'right'
    }
  ],
  onComplete: () => {
    console.log('Doctor onboarding complete!')
  }
}

// ============================================================================
// TOUR TRIGGER BUTTON
// ============================================================================

interface TourTriggerProps {
  tourConfig: TourConfig
  children?: ReactNode
  className?: string
}

export function TourTrigger({ tourConfig, children, className }: TourTriggerProps) {
  const { startTour } = useTour()

  return (
    <button
      onClick={() => startTour(tourConfig)}
      className={className || "inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"}
    >
      {children || (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Take a Tour
        </>
      )}
    </button>
  )
}

// ============================================================================
// AUTO-START TOUR HOOK
// ============================================================================

export function useAutoStartTour(tourConfig: TourConfig, condition: boolean = true) {
  const { startTour, isActive } = useTour()

  useEffect(() => {
    if (condition && !isActive) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startTour(tourConfig)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [condition, isActive, startTour, tourConfig])
}

// ============================================================================
// RESET TOURS (for testing)
// ============================================================================

export function resetCompletedTours() {
  localStorage.removeItem('completedTours')
}
