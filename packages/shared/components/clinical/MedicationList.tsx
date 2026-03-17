'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ar } from '@shared/lib/i18n/ar'

// ============================================================================
// TYPES
// ============================================================================

interface Medication {
  name: string
  strength?: string
  type: 'pill' | 'syrup' | 'injection' | 'cream' | 'inhaler' | 'drops' | 'other'
  frequency: string
  duration: string
  endDate?: string
  notes?: string
  taperingInstructions?: string
}

interface MedicationListProps {
  medications: Medication[]
  onChange: (medications: Medication[]) => void
  /** Patient's pre-existing medications (from intake) for interaction checking */
  patientCurrentMedications?: Array<{ name: string; genericName?: string }>
}

interface DrugSearchResult {
  id: string
  name: string
  nameAr?: string
  genericName?: string
  strength?: string
  strengthVariants?: string[]
  form?: string
  category?: string
  subcategory?: string
  defaults?: {
    type: Medication['type']
    frequency: string
    duration: string
    instructions?: string
  }
  requiresMonitoring?: boolean
  controlledSubstance?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MEDICATION_TYPES = [
  { value: 'pill', label: 'حبوب/أقراص', icon: '\uD83D\uDC8A' },
  { value: 'syrup', label: 'شراب', icon: '\uD83E\uDD64' },
  { value: 'injection', label: 'حقن', icon: '\uD83D\uDC89' },
  { value: 'cream', label: 'كريم/مرهم', icon: '\uD83E\uDDF4' },
  { value: 'inhaler', label: 'بخاخ', icon: '\uD83E\uDEC1' },
  { value: 'drops', label: 'قطرة', icon: '\uD83D\uDCA7' },
  { value: 'other', label: 'أخرى', icon: '\uD83D\uDCCB' },
] as const

const FREQUENCY_BY_TYPE: Record<string, Array<{ value: string, label: string, shorthand: string }>> = {
  pill: [
    { value: '1-pill-once-daily', label: 'حبة واحدة مرة يومياً', shorthand: 'مرة يومياً' },
    { value: '1-pill-twice-daily', label: 'حبة واحدة مرتين يومياً', shorthand: 'مرتين يومياً' },
    { value: '1-pill-three-times-daily', label: 'حبة واحدة ثلاث مرات يومياً', shorthand: '3 مرات يومياً' },
    { value: '1-pill-every-6-hours', label: 'حبة واحدة كل 6 ساعات', shorthand: 'كل 6 ساعات' },
    { value: '2-pills-once-daily', label: 'حبتان مرة يومياً', shorthand: '2 × يومياً' },
    { value: '2-pills-twice-daily', label: 'حبتان مرتين يومياً', shorthand: '2 × مرتين يومياً' },
    { value: '1-pill-as-needed', label: 'حبة واحدة عند الحاجة', shorthand: 'عند الحاجة' },
  ],
  syrup: [
    { value: '5ml-once-daily', label: '5 مل مرة يومياً', shorthand: '5 مل يومياً' },
    { value: '5ml-twice-daily', label: '5 مل مرتين يومياً', shorthand: '5 مل × 2' },
    { value: '5ml-three-times-daily', label: '5 مل 3 مرات يومياً', shorthand: '5 مل × 3' },
    { value: '10ml-three-times-daily', label: '10 مل 3 مرات يومياً', shorthand: '10 مل × 3' },
    { value: '5ml-every-8-hours', label: '5 مل كل 8 ساعات', shorthand: 'كل 8 ساعات' },
  ],
  injection: [
    { value: '1-inj-once-daily', label: 'حقنة واحدة مرة يومياً', shorthand: 'حقنة يومياً' },
    { value: '1-inj-twice-daily', label: 'حقنة واحدة مرتين يومياً', shorthand: 'حقنتان يومياً' },
    { value: '1-inj-once-weekly', label: 'حقنة واحدة أسبوعياً', shorthand: 'أسبوعياً' },
    { value: '1-inj-three-times-daily', label: 'حقنة واحدة 3 مرات يومياً', shorthand: '3 مرات يومياً' },
  ],
  cream: [
    { value: 'apply-twice-daily', label: 'دهن مرتين يومياً', shorthand: 'مرتين يومياً' },
    { value: 'apply-three-times-daily', label: 'دهن 3 مرات يومياً', shorthand: '3 مرات يومياً' },
    { value: 'apply-as-needed', label: 'دهن عند الحاجة', shorthand: 'عند الحاجة' },
  ],
  inhaler: [
    { value: '2-puffs-twice-daily', label: 'نفختان مرتين يومياً', shorthand: 'مرتين يومياً' },
    { value: '2-puffs-as-needed', label: 'نفختان عند الحاجة', shorthand: 'عند الحاجة' },
    { value: '1-puff-four-times-daily', label: 'نفخة واحدة 4 مرات يومياً', shorthand: '4 مرات يومياً' },
  ],
  drops: [
    { value: '2-drops-twice-daily', label: 'قطرتان مرتين يومياً', shorthand: 'مرتين يومياً' },
    { value: '1-drop-three-times-daily', label: 'قطرة واحدة 3 مرات يومياً', shorthand: '3 مرات يومياً' },
    { value: '2-drops-every-4-hours', label: 'قطرتان كل 4 ساعات', shorthand: 'كل 4 ساعات' },
  ],
  other: [
    { value: 'once-daily', label: 'مرة يومياً', shorthand: 'يومياً' },
    { value: 'twice-daily', label: 'مرتين يومياً', shorthand: 'مرتين' },
    { value: 'three-times-daily', label: '3 مرات يومياً', shorthand: '3 مرات' },
    { value: 'as-needed', label: 'عند الحاجة', shorthand: 'حسب الحاجة' },
  ],
}

const FALLBACK_FREQUENCIES = FREQUENCY_BY_TYPE.other

const DURATIONS = [
  { value: '3-days', label: '٣ أيام', days: 3 },
  { value: '5-days', label: '٥ أيام', days: 5 },
  { value: '7-days', label: '٧ أيام', days: 7 },
  { value: '10-days', label: '١٠ أيام', days: 10 },
  { value: '14-days', label: '١٤ يوم', days: 14 },
  { value: '1-month', label: 'شهر واحد', days: 30 },
  { value: '3-months', label: '٣ أشهر', days: 90 },
  { value: 'ongoing', label: 'مستمر', days: null },
]

const COMMON_INSTRUCTIONS = [
  'بعد الأكل',
  'قبل الأكل',
  'مع الأكل',
  'على معدة فارغة',
  'عند النوم',
  'مع كمية كافية من الماء',
  'تجنب التعرض للشمس',
  'تجنب الكحول',
  'قبل الإفطار',
]

// ============================================================================
// HELPERS
// ============================================================================

function calculateEndDate(durationValue: string): string | null {
  const duration = DURATIONS.find(d => d.value === durationValue)
  if (!duration || !duration.days) return null
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(today.getDate() + duration.days)
  return endDate.toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getTypeIcon(type: string): string {
  return MEDICATION_TYPES.find(t => t.value === type)?.icon || '\uD83D\uDCCB'
}

function getFrequencyLabel(type: string, frequency: string): string {
  const freqList = FREQUENCY_BY_TYPE[type] || FALLBACK_FREQUENCIES
  return freqList.find(f => f.value === frequency)?.label || frequency
}

function getDurationLabel(duration: string): string {
  return DURATIONS.find(d => d.value === duration)?.label || duration
}

// ============================================================================
// MEDICATION CARD (compact display for added meds)
// ============================================================================

function MedicationCard({
  med,
  index,
  onRemove,
}: {
  med: Medication
  index: number
  onRemove: () => void
}) {
  return (
    <div className="group flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors" dir="rtl">
      {/* Drug info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="font-semibold text-gray-900 text-sm">{med.name}{med.strength && ` ${med.strength}`} .{index + 1}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-1.5 justify-end">
          <span>{getFrequencyLabel(med.type, med.frequency)}</span>
          <span className="text-gray-300">&middot;</span>
          <span>{getDurationLabel(med.duration)}</span>
          {med.endDate && (
            <>
              <span className="text-gray-300">&middot;</span>
              <span className="text-gray-400">ينتهي في {med.endDate}</span>
            </>
          )}
        </div>
        {med.notes && (
          <div className="text-xs text-gray-500 mt-0.5 italic">{med.notes}</div>
        )}
        {med.taperingInstructions && (
          <div className="text-xs text-amber-700 mt-0.5">تخفيف تدريجي: {med.taperingInstructions}</div>
        )}
      </div>

      {/* Number + Icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-sm">
        {getTypeIcon(med.type)}
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500"
        title="إزالة الدواء"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ============================================================================
// CHIP SELECTOR (reusable)
// ============================================================================

function ChipSelector({
  options,
  value,
  onChange,
  renderLabel,
  renderSublabel,
  columns,
}: {
  options: Array<{ value: string; [key: string]: any }>
  value: string
  onChange: (value: string) => void
  renderLabel: (option: any) => string
  renderSublabel?: (option: any) => string | null
  columns?: number
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${columns ? `grid grid-cols-${columns}` : ''}`}>
      {options.map((opt) => {
        const isSelected = value === opt.value
        const sublabel = renderSublabel?.(opt)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              isSelected
                ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:bg-primary-50'
            }`}
          >
            {renderLabel(opt)}
            {sublabel && (
              <span className={`block text-xs mt-0.5 ${isSelected ? 'text-primary-100' : 'text-gray-400'}`}>
                {sublabel}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// INTERACTION WARNING TYPES
// ============================================================================

interface InteractionWarning {
  newDrug: string
  existingDrug: string
  newDrugGeneric: string
  existingDrugGeneric: string
  severity: 'contraindicated' | 'major' | 'moderate' | 'minor'
  effect: string
  recommendation: string
  mechanism?: string
  monitorable?: boolean
}

const SEVERITY_CONFIG = {
  contraindicated: {
    label: 'مضاد استطباب',
    bgClass: 'bg-red-50 border-red-300',
    headerBg: 'bg-red-700 text-white',
    textClass: 'text-red-800',
    badgeClass: 'bg-red-700 text-white',
    icon: '⛔',
  },
  major: {
    label: 'شديد',
    bgClass: 'bg-red-50 border-red-200',
    headerBg: 'bg-red-600 text-white',
    textClass: 'text-red-700',
    badgeClass: 'bg-red-600 text-white',
    icon: '🔴',
  },
  moderate: {
    label: 'متوسط',
    bgClass: 'bg-amber-50 border-amber-200',
    headerBg: 'bg-amber-500 text-white',
    textClass: 'text-amber-800',
    badgeClass: 'bg-amber-500 text-white',
    icon: '🟡',
  },
  minor: {
    label: 'طفيف',
    bgClass: 'bg-blue-50 border-blue-200',
    headerBg: 'bg-blue-500 text-white',
    textClass: 'text-blue-700',
    badgeClass: 'bg-blue-500 text-white',
    icon: 'ℹ️',
  },
} as const

// ============================================================================
// DUPLICATE WARNING PANEL (RX-025)
// ============================================================================

function DuplicateWarningPanel({
  warning,
  acknowledged,
  onAcknowledge,
}: {
  warning: string | null
  acknowledged: boolean
  onAcknowledge: () => void
}) {
  if (!warning) return null

  return (
    <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg" dir="rtl">
      <div className="flex items-start gap-2 justify-end">
        <span className="text-lg">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800">{warning}</p>
          {!acknowledged && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer justify-end">
              <span className="text-xs text-yellow-700">أقر بهذا التحذير</span>
              <input
                type="checkbox"
                onChange={onAcknowledge}
                className="h-4 w-4 rounded border-yellow-300 text-yellow-600 focus:ring-yellow-500"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// INTERACTION WARNING PANEL
// ============================================================================

function InteractionWarningPanel({
  warnings,
  acknowledged,
  onAcknowledge,
}: {
  warnings: InteractionWarning[]
  acknowledged: boolean
  onAcknowledge: () => void
}) {
  if (warnings.length === 0) return null

  const hasContraindicated = warnings.some(w => w.severity === 'contraindicated')
  const hasMajor = warnings.some(w => w.severity === 'major')
  const needsAck = hasContraindicated || hasMajor

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center gap-2 px-1 justify-end">
        <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="text-sm font-bold text-red-800">
          تم الكشف عن تفاعل دوائي ({warnings.length})
        </span>
      </div>

      {warnings.map((w, idx) => {
        const config = SEVERITY_CONFIG[w.severity]
        return (
          <div key={idx} className={`border rounded-lg overflow-hidden ${config.bgClass}`} dir="rtl">
            {/* Severity Header */}
            <div className={`px-3 py-1.5 flex items-center gap-2 justify-between ${config.headerBg}`}>
              <span className="text-xs opacity-90">{w.newDrug} ↔ {w.existingDrug}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wide">{config.label}</span>
                <span className="text-sm">{config.icon}</span>
              </div>
            </div>
            {/* Details */}
            <div className="px-3 py-2 space-y-1.5">
              <p className={`text-xs font-medium ${config.textClass}`}>{w.effect}</p>
              <div className="flex items-start gap-1.5 justify-end">
                <p className="text-xs text-gray-600">{w.recommendation}</p>
                <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              {w.monitorable && (
                <div className="flex items-center gap-1 mt-1 justify-end">
                  <span className="text-xs text-gray-500">يمكن إدارتها بمراقبة دقيقة</span>
                  <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">قابل للمراقبة</span>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Acknowledge checkbox for major/contraindicated */}
      {needsAck && !acknowledged && (
        <label className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors" dir="rtl">
          <span className="text-xs text-gray-700">
            <strong>أقر بـ</strong> تحذيرات التفاعل الدوائي أعلاه وأتحمل المسؤولية السريرية لهذه الروشتة.
            {hasContraindicated && (
              <span className="text-red-600 font-medium"> تتضمن هذه مضادات استطباب.</span>
            )}
          </span>
          <input
            type="checkbox"
            onChange={onAcknowledge}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
        </label>
      )}
    </div>
  )
}

// ============================================================================
// ADD MEDICATION FORM (Phase 2+3: Chip-based design with interaction warnings)
// ============================================================================

interface AddMedicationFormProps {
  onAdd: (medication: Medication, genericName?: string) => void
  onCancel: () => void
  existingMedications: Array<{ name: string; genericName?: string }>
}

interface RecentDrug {
  id: string
  name: string
  strength?: string
  type?: Medication['type']
}

function AddMedicationForm({ onAdd, onCancel, existingMedications }: AddMedicationFormProps) {
  // State
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedDrug, setSelectedDrug] = useState('')
  const [selectedDrugData, setSelectedDrugData] = useState<DrugSearchResult | null>(null)
  const [selectedStrength, setSelectedStrength] = useState('')
  const [medicationType, setMedicationType] = useState<Medication['type']>('pill')
  const [frequency, setFrequency] = useState('')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [taperingInstructions, setTaperingInstructions] = useState('')
  const [showTapering, setShowTapering] = useState(false)
  const [smartDefaultsApplied, setSmartDefaultsApplied] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Phase 3: Interaction state
  const [interactionWarnings, setInteractionWarnings] = useState<InteractionWarning[]>([])
  const [interactionAcknowledged, setInteractionAcknowledged] = useState(false)
  const [checkingInteractions, setCheckingInteractions] = useState(false)
  // RX-025: Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false)
  // RX-026: Recent drugs
  const [recentDrugs, setRecentDrugs] = useState<RecentDrug[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced drug search
  const searchDrugs = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }
    setIsSearching(true)
    try {
      const response = await fetch(`/api/drugs/search?q=${encodeURIComponent(q)}`)
      const data = await response.json()
      setResults(data.results || [])
      setShowDropdown(true)
    } catch (error) {
      console.error('Drug search error:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchDrugs(value), 200)
  }

  // Load recent drugs on mount (RX-026)
  useEffect(() => {
    const loadRecentDrugs = async () => {
      try {
        const response = await fetch('/api/drugs/recent')
        const data = await response.json()
        setRecentDrugs(data.recent || [])
      } catch (error) {
        console.error('Load recent drugs error:', error)
      }
    }
    loadRecentDrugs()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // RX-025: Check for duplicate drugs
  const checkDuplicate = (drugName: string): string | null => {
    const lowerDrugName = drugName.toLowerCase()

    // Check in current session medications
    if (existingMedications.some(med => med.name.toLowerCase() === lowerDrugName)) {
      return 'هذا الدواء موجود بالفعل في الروشتة'
    }

    // Check in patient's current medications
    const patientCurrentNames = existingMedications.filter(med => !med.genericName)
    if (patientCurrentNames.some(med => med.name.toLowerCase() === lowerDrugName)) {
      return 'المريض يتناول هذا الدواء بالفعل'
    }

    return null
  }

  // Check drug interactions against existing medications
  const checkInteractions = useCallback(async (drug: DrugSearchResult) => {
    if (!drug.genericName || existingMedications.length === 0) {
      setInteractionWarnings([])
      return
    }
    setCheckingInteractions(true)
    try {
      const response = await fetch('/api/drugs/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDrug: { name: drug.name, genericName: drug.genericName },
          existingMedications,
        }),
      })
      const data = await response.json()
      setInteractionWarnings(data.interactions || [])
      setInteractionAcknowledged(false)
    } catch (error) {
      console.error('Interaction check error:', error)
      setInteractionWarnings([])
    } finally {
      setCheckingInteractions(false)
    }
  }, [existingMedications])

  // Drug selection with smart defaults + interaction check + duplicate check (RX-025)
  const handleDrugSelect = (drug: DrugSearchResult) => {
    // RX-025: Check for duplicates
    const duplicateMsg = checkDuplicate(drug.name)
    if (duplicateMsg) {
      setDuplicateWarning(duplicateMsg)
      setDuplicateAcknowledged(false)
      // Still allow the user to proceed after acknowledging
    } else {
      setDuplicateWarning(null)
      setDuplicateAcknowledged(false)
    }

    setSelectedDrug(drug.name)
    setSelectedDrugData(drug)
    setQuery('')
    setShowDropdown(false)

    // Auto-select first strength variant if available
    if (drug.strengthVariants && drug.strengthVariants.length > 0) {
      setSelectedStrength(drug.strengthVariants[0])
    } else {
      setSelectedStrength('')
    }

    if (drug.defaults) {
      setMedicationType(drug.defaults.type)
      setFrequency(drug.defaults.frequency)
      setDuration(drug.defaults.duration)
      if (drug.defaults.instructions) {
        setNotes(drug.defaults.instructions)
      }
      setSmartDefaultsApplied(true)
    }

    // Phase 3: Check interactions
    checkInteractions(drug)
  }

  const handleFreeTextSelect = (name: string) => {
    setSelectedDrug(name)
    setSelectedDrugData(null)
    setQuery('')
    setShowDropdown(false)
    setSmartDefaultsApplied(false)
  }

  const resetDrugSelection = () => {
    setSelectedDrug('')
    setSelectedDrugData(null)
    setSelectedStrength('')
    setSmartDefaultsApplied(false)
    setMedicationType('pill')
    setFrequency('')
    setDuration('')
    setNotes('')
    setShowTapering(false)
    setTaperingInstructions('')
    setShowAdvanced(false)
    setInteractionWarnings([])
    setInteractionAcknowledged(false)
    setDuplicateWarning(null)
    setDuplicateAcknowledged(false)
  }

  const handleSubmit = () => {
    if (!selectedDrug || !medicationType || !frequency || !duration) return
    const endDate = calculateEndDate(duration)
    onAdd(
      {
        name: selectedDrug,
        strength: selectedStrength || undefined,
        type: medicationType,
        frequency,
        duration,
        endDate: endDate || undefined,
        notes: notes || undefined,
        taperingInstructions: taperingInstructions || undefined,
      },
      selectedDrugData?.genericName || undefined
    )
  }

  const hasDangerousInteraction = interactionWarnings.some(
    w => w.severity === 'contraindicated' || w.severity === 'major'
  )
  const interactionBlocking = hasDangerousInteraction && !interactionAcknowledged
  const duplicateBlocking = duplicateWarning && !duplicateAcknowledged
  const isComplete = selectedDrug && medicationType && frequency && duration && !interactionBlocking && !duplicateBlocking
  const currentFrequencies = FREQUENCY_BY_TYPE[medicationType] || FALLBACK_FREQUENCIES

  // ── RENDER ──

  return (
    <div className="bg-white border-2 border-primary-200 rounded-xl shadow-sm overflow-hidden" dir="rtl">
      {/* ─── Header ─── */}
      <div className="bg-primary-50 px-4 py-3 flex items-center justify-between border-b border-primary-100">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 className="font-semibold text-primary-900 text-sm">إضافة دواء</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* ─── STEP 1: Drug Search ─── */}
        {!selectedDrug ? (
          <div className="space-y-4">
            {/* RX-026: Recent Drugs Section */}
            {recentDrugs.length > 0 && (
              <div dir="rtl">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  الأدوية الأخيرة
                </label>
                <div className="flex flex-wrap gap-2 justify-end">
                  {recentDrugs.slice(0, 5).map((drug) => (
                    <button
                      key={drug.id}
                      type="button"
                      onClick={() => {
                        // Trigger the same flow as selecting from search results
                        const recentAsDrug: DrugSearchResult = {
                          id: drug.id,
                          name: drug.name,
                          strength: drug.strength,
                        }
                        handleDrugSelect(recentAsDrug)
                      }}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200 hover:border-primary-400 hover:bg-primary-100 transition-all"
                    >
                      {drug.name}{drug.strength && ` ${drug.strength}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="relative" dir="rtl">
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => results.length > 0 && setShowDropdown(true)}
                placeholder="ابحث عن اسم الدواء..."
                className="w-full pl-10 pr-10 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                autoFocus
                dir="rtl"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-300 border-t-primary-600"></div>
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showDropdown && results.length > 0 && (
              <div ref={dropdownRef} className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-y-auto" dir="rtl">
                {results.map((drug, idx) => (
                  <button
                    key={drug.id || idx}
                    onClick={() => handleDrugSelect(drug)}
                    className="w-full text-right px-4 py-3 hover:bg-primary-50 border-b last:border-b-0 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        {drug.defaults && (
                          <span className="text-xs px-2 py-0.5 bg-success-50 text-success-700 rounded-full whitespace-nowrap">
                            ذكي
                          </span>
                        )}
                        {drug.category && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full whitespace-nowrap">
                            {drug.category}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {drug.nameAr && (
                            <span className="text-gray-400 text-sm" dir="rtl">{drug.nameAr}</span>
                          )}
                          <span className="font-semibold text-gray-900">{drug.name}</span>
                        </div>
                        {drug.genericName && (
                          <div className="text-xs text-gray-500 mt-0.5 text-right">{drug.genericName}</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Free text fallback */}
            {query.length >= 2 && results.length === 0 && !isSearching && (
              <div className="absolute z-30 w-full mt-1 bg-blue-50 border border-blue-200 rounded-lg p-3" dir="rtl">
                <p className="text-sm text-blue-700 text-right">
                  غير موجود في قاعدة البيانات.{' '}
                  <button
                    onClick={() => handleFreeTextSelect(query)}
                    className="font-semibold underline hover:text-blue-900"
                  >
                    أضف &quot;{query}&quot; يدويًا
                  </button>
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ─── STEP 2: All-in-one prescription config (shown together) ─── */}

            {/* Selected Drug Header */}
            <div className="p-3 bg-gray-50 rounded-lg" dir="rtl">
              <div className="flex items-center justify-between">
                <button
                  onClick={resetDrugSelection}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium underline"
                >
                  تغيير
                </button>
                <div className="text-right">
                  <span className="font-bold text-gray-900">{selectedDrug}</span>
                  {selectedDrugData?.nameAr && (
                    <span className="text-gray-400 text-sm mr-2" dir="rtl">{selectedDrugData.nameAr}</span>
                  )}
                  {selectedDrugData?.genericName && (
                    <div className="text-xs text-gray-500 mt-0.5">{selectedDrugData.genericName}</div>
                  )}
                </div>
              </div>
              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mt-2 justify-end" dir="rtl">
                {selectedDrugData?.controlledSubstance && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                    مادة مراقبة
                  </span>
                )}
                {selectedDrugData?.requiresMonitoring && (
                  <span className="inline-flex items-center gap-1 text-xs text-warning-700 bg-warning-50 border border-warning-200 px-2 py-0.5 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    مراقبة مطلوبة
                  </span>
                )}
                {smartDefaultsApplied && (
                  <span className="inline-flex items-center gap-1 text-xs text-success-700 bg-success-50 border border-success-200 px-2 py-0.5 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    تم تطبيق الإعدادات الافتراضية
                  </span>
                )}
              </div>
            </div>

            {/* ─── RX-025: DUPLICATE WARNING PANEL ─── */}
            <DuplicateWarningPanel
              warning={duplicateWarning}
              acknowledged={duplicateAcknowledged}
              onAcknowledge={() => setDuplicateAcknowledged(true)}
            />

            {/* ─── DOSAGE/STRENGTH chips ─── */}
            {selectedDrugData?.strengthVariants && selectedDrugData.strengthVariants.length > 0 && (
              <div dir="rtl">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  التركيز/الجرعة
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDrugData.strengthVariants.map((strength) => (
                    <button
                      key={strength}
                      type="button"
                      onClick={() => setSelectedStrength(strength)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        selectedStrength === strength
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {strength}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─── TYPE chips ─── */}
            <div dir="rtl">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                الشكل
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MEDICATION_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setMedicationType(type.value as Medication['type'])
                      // Auto-select first frequency for new type if current one isn't valid
                      const newFreqs = FREQUENCY_BY_TYPE[type.value] || FALLBACK_FREQUENCIES
                      if (!newFreqs.find(f => f.value === frequency)) {
                        setFrequency(newFreqs[0]?.value || '')
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      medicationType === type.value
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                    }`}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ─── FREQUENCY chips ─── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                الجرعة
              </label>
              <ChipSelector
                options={currentFrequencies}
                value={frequency}
                onChange={setFrequency}
                renderLabel={(opt) => opt.shorthand}
              />
            </div>

            {/* ─── DURATION chips ─── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                المدة
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((dur) => {
                  const isSelected = duration === dur.value
                  const endDate = calculateEndDate(dur.value)
                  return (
                    <button
                      key={dur.value}
                      type="button"
                      onClick={() => setDuration(dur.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        isSelected
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                      }`}
                      title={endDate ? `ينتهي في ${endDate}` : undefined}
                    >
                      {dur.label}
                    </button>
                  )
                })}
              </div>
              {duration && calculateEndDate(duration) && (
                <p className="text-xs text-gray-400 mt-1">
                  ينتهي في: {calculateEndDate(duration)}
                </p>
              )}
            </div>

            {/* ─── INSTRUCTIONS (chip + free text) ─── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                التعليمات
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_INSTRUCTIONS.map((instr) => {
                  const isSelected = notes === instr
                  return (
                    <button
                      key={instr}
                      type="button"
                      onClick={() => setNotes(isSelected ? '' : instr)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-primary-100 text-primary-700 border-primary-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-primary-200'
                      }`}
                    >
                      {instr}
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="تعليمات إضافية..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>

            {/* ─── ADVANCED: Tapering ─── */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1"
              >
                <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                خيارات متقدمة
              </button>

              {showAdvanced && (
                <div className="mt-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showTapering"
                      checked={showTapering}
                      onChange={(e) => setShowTapering(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="showTapering" className="text-sm text-gray-600 cursor-pointer">
                      يتطلب تخفيض تدريجي (تغيير الجرعة بمرور الوقت)
                    </label>
                  </div>

                  {showTapering && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <textarea
                        value={taperingInstructions}
                        onChange={(e) => setTaperingInstructions(e.target.value)}
                        placeholder="مثال: ٣ حبات يومياً لمدة ٣ أيام، ثم حبتان لمدة ٤ أيام، ثم حبة واحدة لمدة ٣ أيام"
                        rows={2}
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── INTERACTION WARNINGS (Phase 3) ─── */}
            {checkingInteractions && (
              <div className="flex items-center gap-2 p-2 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-300 border-t-primary-600"></div>
                جاري فحص التفاعلات الدوائية...
              </div>
            )}

            {!checkingInteractions && interactionWarnings.length > 0 && (
              <InteractionWarningPanel
                warnings={interactionWarnings}
                acknowledged={interactionAcknowledged}
                onAcknowledge={() => setInteractionAcknowledged(true)}
              />
            )}

            {/* ─── PREVIEW + ACTIONS ─── */}
            <div className="pt-2 border-t border-gray-100">
              {/* Live preview */}
              {selectedDrug && medicationType && frequency && duration && (
                <div className={`mb-3 p-2.5 rounded-lg text-sm ${
                  interactionWarnings.length > 0 && !interactionAcknowledged && hasDangerousInteraction
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-gray-50 text-gray-700'
                }`}>
                  <span className="font-semibold">{selectedDrug}{selectedStrength && ` ${selectedStrength}`}</span>
                  {' — '}
                  {getFrequencyLabel(medicationType, frequency)}
                  {' لمدة '}
                  {getDurationLabel(duration)}
                  {notes && <span className="text-gray-500"> ({notes})</span>}
                  {interactionWarnings.length > 0 && interactionAcknowledged && (
                    <span className="mr-2 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                      ⚠ تم الإقرار بالتفاعل
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isComplete}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    isComplete
                      ? interactionWarnings.length > 0
                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                        : 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {interactionBlocking
                    ? '⚠ أقر بالتفاعلات للمتابعة'
                    : interactionWarnings.length > 0
                      ? '⚠ إضافة بحذر'
                      : smartDefaultsApplied && isComplete
                        ? 'إضافة بالإعدادات الافتراضية'
                        : 'إضافة دواء'
                  }
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MedicationList({ medications, onChange, patientCurrentMedications }: MedicationListProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  // Track generic names for interaction checking (brand name → generic name)
  const [genericNameMap, setGenericNameMap] = useState<Record<string, string>>({})

  const removeMedication = (index: number) => {
    onChange(medications.filter((_, i) => i !== index))
  }

  // Build existing medications list with generic names for interaction checker
  // Includes both session medications AND patient's pre-existing medications from intake
  const sessionMedications = medications.map(med => ({
    name: med.name,
    genericName: genericNameMap[med.name] || undefined,
  }))
  const existingMedications = [
    ...sessionMedications,
    ...(patientCurrentMedications || []),
  ]

  return (
    <div className="space-y-3">
      {/* Added Medications (compact cards) */}
      {medications.map((med, index) => (
        <MedicationCard
          key={index}
          med={med}
          index={index}
          onRemove={() => removeMedication(index)}
        />
      ))}

      {/* Add Form or Button */}
      {showAddForm ? (
        <AddMedicationForm
          existingMedications={existingMedications}
          onAdd={(med, genericName) => {
            if (genericName) {
              setGenericNameMap(prev => ({ ...prev, [med.name]: genericName }))
            }
            onChange([...medications, med])
            setShowAddForm(false)
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 font-medium transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          إضافة دواء
        </button>
      )}

      {medications.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-400 text-center py-2">
          لم تتم إضافة أدوية بعد
        </p>
      )}
    </div>
  )
}
