'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'

type UserRole = 'doctor' | 'frontdesk' | 'patient'

const roles: { key: UserRole; label: string; desc: string; icon: string }[] = [
  {
    key: 'doctor',
    label: ar.iAmDoctor,
    desc: ar.doctorRoleDesc,
    icon: '🩺',
  },
  {
    key: 'frontdesk',
    label: ar.iManageClinic,
    desc: ar.clinicRoleDesc,
    icon: '🏥',
  },
  {
    key: 'patient',
    label: ar.iManageHealth,
    desc: ar.healthRoleDesc,
    icon: '❤️',
  },
]

export default function RoleSelectionPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)

  const handleContinue = () => {
    if (selectedRole) {
      router.push('/login')
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center">
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="12" y1="10" x2="12" y2="18" />
            <line x1="8" y1="14" x2="16" y2="14" />
          </svg>
        </div>
        <span className="text-2xl font-bold text-gray-900">MedAssist</span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{ar.chooseYourRole}</h1>
      <p className="text-gray-500 mb-8 text-center text-sm">اختر الدور المناسب لك للمتابعة</p>

      {/* Role Cards */}
      <div className="w-full max-w-sm space-y-4">
        {roles.map((role) => (
          <button
            key={role.key}
            onClick={() => setSelectedRole(role.key)}
            className={`w-full p-5 rounded-2xl border-2 transition-all text-right flex items-center gap-4 ${
              selectedRole === role.key
                ? 'border-primary-600 bg-primary-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="text-3xl flex-shrink-0">{role.icon}</span>
            <div className="flex-1">
              <div className={`font-bold text-lg ${selectedRole === role.key ? 'text-primary-700' : 'text-gray-900'}`}>
                {role.label}
              </div>
              <div className="text-sm text-gray-500 mt-1">{role.desc}</div>
            </div>
            {/* Check indicator */}
            {selectedRole === role.key && (
              <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Continue Button */}
      <button
        onClick={handleContinue}
        disabled={!selectedRole}
        className={`w-full max-w-sm mt-8 py-4 rounded-2xl font-bold text-lg transition-all ${
          selectedRole
            ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {ar.continueBtn}
      </button>
    </div>
  )
}
