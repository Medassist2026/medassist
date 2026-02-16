'use client'

import { useState, useRef, useEffect, ReactNode, createContext, useContext } from 'react'

// ============================================================================
// PROGRESSIVE DISCLOSURE PATTERN (DS-004)
// 
// Design principle: Show only essential information first, reveal details on demand.
// Benefits: Reduces cognitive load, cleaner UI, faster initial render.
// ============================================================================

// ============================================================================
// 1. EXPANDABLE SECTION
// Use for: Long content that can be hidden by default
// ============================================================================

interface ExpandableSectionProps {
  title: string
  children: ReactNode
  defaultExpanded?: boolean
  badge?: string | number
  icon?: string
  variant?: 'default' | 'card' | 'minimal'
  onToggle?: (expanded: boolean) => void
}

export function ExpandableSection({
  title,
  children,
  defaultExpanded = false,
  badge,
  icon,
  variant = 'default',
  onToggle
}: ExpandableSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (contentRef.current) {
      setHeight(expanded ? contentRef.current.scrollHeight : 0)
    }
  }, [expanded, children])

  const toggle = () => {
    const newState = !expanded
    setExpanded(newState)
    onToggle?.(newState)
  }

  const variants = {
    default: 'bg-gray-50 rounded-lg',
    card: 'bg-white rounded-xl border border-gray-200 shadow-sm',
    minimal: ''
  }

  return (
    <div className={variants[variant]}>
      <button
        onClick={toggle}
        className={`w-full flex items-center justify-between p-4 text-left hover:bg-gray-100/50 transition-colors ${
          variant === 'minimal' ? 'px-0' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-xl">{icon}</span>}
          <span className="font-medium text-gray-900">{title}</span>
          {badge !== undefined && (
            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs">
              {badge}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      <div
        style={{ height: height ?? 0 }}
        className="overflow-hidden transition-all duration-200"
      >
        <div ref={contentRef} className={`${variant === 'minimal' ? '' : 'px-4 pb-4'}`}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 2. SHOW MORE / SHOW LESS
// Use for: Lists with many items
// ============================================================================

interface ShowMoreListProps<T> {
  items: T[]
  initialCount?: number
  renderItem: (item: T, index: number) => ReactNode
  showMoreLabel?: string
  showLessLabel?: string
}

export function ShowMoreList<T>({
  items,
  initialCount = 3,
  renderItem,
  showMoreLabel = 'Show more',
  showLessLabel = 'Show less'
}: ShowMoreListProps<T>) {
  const [showAll, setShowAll] = useState(false)
  const displayItems = showAll ? items : items.slice(0, initialCount)
  const hasMore = items.length > initialCount

  return (
    <div className="space-y-2">
      {displayItems.map((item, index) => (
        <div key={index}>{renderItem(item, index)}</div>
      ))}
      
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          {showAll ? (
            <>
              {showLessLabel}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </>
          ) : (
            <>
              {showMoreLabel} ({items.length - initialCount} more)
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// 3. PROGRESSIVE FORM
// Use for: Long forms that can be broken into steps
// ============================================================================

interface FormStep {
  id: string
  title: string
  description?: string
  icon?: string
  content: ReactNode
  isOptional?: boolean
  validate?: () => boolean | Promise<boolean>
}

interface ProgressiveFormProps {
  steps: FormStep[]
  onComplete: () => void
  showProgress?: boolean
  allowSkip?: boolean
}

export function ProgressiveForm({
  steps,
  onComplete,
  showProgress = true,
  allowSkip = false
}: ProgressiveFormProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [skippedSteps, setSkippedSteps] = useState<Set<string>>(new Set())

  const isLastStep = currentStep === steps.length - 1
  const currentStepData = steps[currentStep]

  const goNext = async () => {
    // Validate current step
    if (currentStepData.validate) {
      const isValid = await currentStepData.validate()
      if (!isValid) return
    }

    setCompletedSteps(prev => new Set([...Array.from(prev), currentStepData.id]))

    if (isLastStep) {
      onComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const skipStep = () => {
    if (!currentStepData.isOptional) return
    setSkippedSteps(prev => new Set([...Array.from(prev), currentStepData.id]))
    
    if (isLastStep) {
      onComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      {showProgress && (
        <div className="flex items-center gap-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  completedSteps.has(step.id) ? 'bg-green-500 text-white' :
                  skippedSteps.has(step.id) ? 'bg-gray-300 text-gray-600' :
                  index === currentStep ? 'bg-primary-600 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}
              >
                {completedSteps.has(step.id) ? '✓' : index + 1}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-12 h-1 mx-2 ${
                  completedSteps.has(step.id) ? 'bg-green-500' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          {currentStepData.icon && <span className="text-2xl">{currentStepData.icon}</span>}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{currentStepData.title}</h3>
            {currentStepData.description && (
              <p className="text-sm text-gray-500">{currentStepData.description}</p>
            )}
          </div>
          {currentStepData.isOptional && (
            <span className="ml-auto text-xs text-gray-400">Optional</span>
          )}
        </div>

        <div className="mb-6">
          {currentStepData.content}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={goBack}
            disabled={currentStep === 0}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
          
          <div className="flex gap-2">
            {allowSkip && currentStepData.isOptional && (
              <button
                onClick={skipStep}
                className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                Skip
              </button>
            )}
            <button
              onClick={goNext}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              {isLastStep ? 'Complete' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 4. REVEAL ON HOVER
// Use for: Actions/details that appear on hover
// ============================================================================

interface RevealOnHoverProps {
  children: ReactNode
  revealContent: ReactNode
  position?: 'right' | 'left' | 'overlay'
}

export function RevealOnHover({
  children,
  revealContent,
  position = 'right'
}: RevealOnHoverProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1">{children}</div>
        
        {position !== 'overlay' && (
          <div
            className={`transition-all duration-200 ${
              isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
            }`}
          >
            {revealContent}
          </div>
        )}
      </div>

      {position === 'overlay' && isHovered && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center rounded-lg animate-fade-in">
          {revealContent}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 5. LAZY TABS
// Use for: Tab content that should only load when tab is active
// ============================================================================

interface LazyTab {
  id: string
  label: string
  icon?: string
  content: ReactNode | (() => ReactNode)
  badge?: string | number
}

interface LazyTabsProps {
  tabs: LazyTab[]
  defaultTab?: string
  onTabChange?: (tabId: string) => void
}

export function LazyTabs({ tabs, defaultTab, onTabChange }: LazyTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(activeTab ? [activeTab] : []))

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    setLoadedTabs(prev => new Set([...Array.from(prev), tabId]))
    onTabChange?.(tabId)
  }

  const currentTab = tabs.find(t => t.id === activeTab)

  return (
    <div className="space-y-4">
      {/* Tab Headers */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined && (
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content - Only render if tab has been loaded */}
      <div>
        {tabs.map(tab => {
          if (!loadedTabs.has(tab.id)) return null
          
          const content = typeof tab.content === 'function' ? tab.content() : tab.content
          
          return (
            <div
              key={tab.id}
              className={activeTab === tab.id ? 'block' : 'hidden'}
            >
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// 6. DETAIL PANEL
// Use for: Master-detail views where details expand inline or in sidebar
// ============================================================================

interface DetailPanelContextValue {
  selectedId: string | null
  setSelectedId: (id: string | null) => void
}

const DetailPanelContext = createContext<DetailPanelContextValue | null>(null)

interface DetailPanelProviderProps {
  children: ReactNode
}

export function DetailPanelProvider({ children }: DetailPanelProviderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <DetailPanelContext.Provider value={{ selectedId, setSelectedId }}>
      {children}
    </DetailPanelContext.Provider>
  )
}

export function useDetailPanel() {
  const context = useContext(DetailPanelContext)
  if (!context) {
    throw new Error('useDetailPanel must be used within DetailPanelProvider')
  }
  return context
}

interface DetailTriggerProps {
  id: string
  children: ReactNode
}

export function DetailTrigger({ id, children }: DetailTriggerProps) {
  const { selectedId, setSelectedId } = useDetailPanel()
  const isSelected = selectedId === id

  return (
    <div
      onClick={() => setSelectedId(isSelected ? null : id)}
      className={`cursor-pointer transition-colors ${
        isSelected ? 'bg-primary-50 border-primary-200' : 'hover:bg-gray-50'
      }`}
    >
      {children}
    </div>
  )
}

interface DetailContentProps {
  id: string
  children: ReactNode
}

export function DetailContent({ id, children }: DetailContentProps) {
  const { selectedId } = useDetailPanel()
  
  if (selectedId !== id) return null

  return (
    <div className="bg-primary-50 border-l-4 border-primary-500 p-4 animate-fade-in">
      {children}
    </div>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================
