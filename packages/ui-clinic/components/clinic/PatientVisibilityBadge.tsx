'use client'

import { useState } from 'react'

type VisibilityMode = 'DOCTOR_SCOPED_OWNER' | 'CLINIC_WIDE' | 'SHARED_BY_CONSENT'

interface PatientVisibilityBadgeProps {
  mode: VisibilityMode
  ownerDoctorName?: string
  sharedWithNames?: string[]
  size?: 'sm' | 'md'
}

const visibilityConfig: Record<VisibilityMode, {
  label: (props: PatientVisibilityBadgeProps) => string
  labelAr: string
  icon: string
  bgColor: string
  textColor: string
  borderColor: string
  tooltip: (props: PatientVisibilityBadgeProps) => string
}> = {
  DOCTOR_SCOPED_OWNER: {
    label: (props) => props.size === 'sm' ? 'Private' : `Private to ${props.ownerDoctorName || 'Doctor'}`,
    labelAr: 'خاص بالطبيب',
    icon: 'lock',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
    tooltip: (props) => `Only ${props.ownerDoctorName || 'the assigned doctor'} can access this patient's records`
  },
  CLINIC_WIDE: {
    label: () => 'Shared in Clinic',
    labelAr: 'مشترك في العيادة',
    icon: 'building',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    tooltip: () => 'All doctors in this clinic can access this patient\'s records'
  },
  SHARED_BY_CONSENT: {
    label: (props) => {
      const names = props.sharedWithNames || []
      if (props.size === 'sm') return `Shared (${names.length})`
      if (names.length === 0) return 'Shared by Consent'
      if (names.length === 1) return `Shared with ${names[0]}`
      return `Shared with ${names.length} doctors`
    },
    labelAr: 'مشترك بموافقة',
    icon: 'share',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    tooltip: (props) => {
      const names = props.sharedWithNames || []
      if (names.length === 0) return 'Patient has consented to share records with specific doctors'
      return `Shared with: ${names.join(', ')}`
    }
  }
}

function LockIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

function BuildingIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}

function ShareIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  )
}

const iconMap = {
  lock: LockIcon,
  building: BuildingIcon,
  share: ShareIcon
}

export default function PatientVisibilityBadge(props: PatientVisibilityBadgeProps) {
  const { mode, size = 'md' } = props
  const [showTooltip, setShowTooltip] = useState(false)
  const config = visibilityConfig[mode]

  if (!config) return null

  const IconComponent = iconMap[config.icon as keyof typeof iconMap]
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'
  const textSize = size === 'sm' ? 'text-xs' : 'text-xs'

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`inline-flex items-center gap-1 ${padding} ${config.bgColor} ${config.textColor} border ${config.borderColor} rounded-full ${textSize} font-medium whitespace-nowrap`}>
        <IconComponent className={iconSize} />
        {config.label(props)}
      </span>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-50 shadow-lg">
          {config.tooltip(props)}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  )
}
