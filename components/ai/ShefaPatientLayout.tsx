'use client'

import { ReactNode } from 'react'
import { 
  ShefaProvider, 
  ShefaFloatingButton, 
  ShefaChatDrawer 
} from '@/components/ai/ShefaChat'

// ============================================================================
// SHEFA PATIENT LAYOUT
// Wraps patient pages with Shefa AI assistant
// ============================================================================

interface ShefaPatientLayoutProps {
  children: ReactNode
  patientData?: {
    name?: string
    medications?: any[]
    conditions?: any[]
    recentLabs?: any[]
  }
}

export function ShefaPatientLayout({ children, patientData }: ShefaPatientLayoutProps) {
  return (
    <ShefaProvider patientData={patientData}>
      {children}
      <ShefaFloatingButton />
      <ShefaChatDrawer />
    </ShefaProvider>
  )
}

// ============================================================================
// EXAMPLE USAGE IN PATIENT LAYOUT
// ============================================================================

/*
// app/(patient)/layout.tsx

import { ShefaPatientLayout } from '@/components/ai/ShefaPatientLayout'

export default function PatientLayout({ children }) {
  // Optionally fetch patient data here
  const patientData = {
    name: 'Ahmed',
    medications: [...],
    conditions: [...],
    recentLabs: [...]
  }

  return (
    <ShefaPatientLayout patientData={patientData}>
      <div className="min-h-screen bg-gray-50">
        <PatientNavbar />
        <main className="container mx-auto px-4 py-6">
          {children}
        </main>
      </div>
    </ShefaPatientLayout>
  )
}
*/

// ============================================================================
// SHEFA NAVIGATION ITEMS
// Add these to patient sidebar/navigation
// ============================================================================

export const SHEFA_NAV_ITEMS = [
  {
    href: '/patient/ai/symptoms',
    label: 'Symptom Checker',
    icon: '🩺',
    description: 'Check your symptoms with AI guidance'
  },
  {
    href: '/patient/ai/summary',
    label: 'Health Summary',
    icon: '📊',
    description: 'AI-powered health insights'
  },
  {
    href: '/patient/ai/medications',
    label: 'Medication Assistant',
    icon: '💊',
    description: 'Drug info and interactions'
  }
]

// ============================================================================
// SHEFA DASHBOARD WIDGET
// Add to patient dashboard
// ============================================================================

import Link from 'next/link'
import { useShefa } from '@/components/ai/ShefaChat'

export function ShefaDashboardWidget() {
  return (
    <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl p-6 text-white">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🌟</span>
            <h3 className="font-semibold text-lg">Shefa AI</h3>
          </div>
          <p className="text-primary-100 text-sm">Your personal health assistant</p>
        </div>
        <span className="px-2 py-1 bg-white/20 rounded-full text-xs">AI Powered</span>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Link
          href="/patient/ai/symptoms"
          className="bg-white/10 hover:bg-white/20 rounded-xl p-3 text-center transition-colors"
        >
          <div className="text-2xl mb-1">🩺</div>
          <div className="text-xs">Symptoms</div>
        </Link>
        <Link
          href="/patient/ai/summary"
          className="bg-white/10 hover:bg-white/20 rounded-xl p-3 text-center transition-colors"
        >
          <div className="text-2xl mb-1">📊</div>
          <div className="text-xs">Summary</div>
        </Link>
        <Link
          href="/patient/ai/medications"
          className="bg-white/10 hover:bg-white/20 rounded-xl p-3 text-center transition-colors"
        >
          <div className="text-2xl mb-1">💊</div>
          <div className="text-xs">Medications</div>
        </Link>
      </div>
      
      <ShefaChatButton />
    </div>
  )
}

function ShefaChatButton() {
  const { openChat } = useShefa()
  
  return (
    <button
      onClick={openChat}
      className="w-full py-2 bg-white text-primary-700 rounded-lg font-medium hover:bg-primary-50 transition-colors flex items-center justify-center gap-2"
    >
      <span>💬</span>
      Chat with Shefa
    </button>
  )
}

// ============================================================================
// QUICK SYMPTOM CHECK CARD
// Standalone card for quick access
// ============================================================================

export function QuickSymptomCheckCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
          <span className="text-xl">🩺</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Not feeling well?</h3>
          <p className="text-sm text-gray-500">Check your symptoms with AI</p>
        </div>
      </div>
      <Link
        href="/patient/ai/symptoms"
        className="block w-full py-2 text-center bg-primary-600 text-white rounded-lg hover:bg-primary-700"
      >
        Start Symptom Check
      </Link>
    </div>
  )
}

// ============================================================================
// CSS ANIMATIONS (Add to globals.css)
// ============================================================================

/*
Add these to your globals.css:

@keyframes slide-left {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-slide-left {
  animation: slide-left 0.3s ease-out;
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
*/

export default ShefaPatientLayout
