'use client'

import { Suspense } from 'react'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'

// ============================================================================
// EGYPTIAN MEDICAL SPECIALTIES
// ============================================================================
const SPECIALTIES = [
  { value: 'general-practitioner', label: 'طبيب عام / باطنة' },
  { value: 'pediatrics', label: 'أطفال' },
  { value: 'cardiology', label: 'قلب وأوعية دموية' },
  { value: 'endocrinology', label: 'غدد صماء وسكر' },
  { value: 'dermatology', label: 'جلدية' },
  { value: 'ophthalmology', label: 'عيون' },
  { value: 'ent', label: 'أنف وأذن وحنجرة' },
  { value: 'orthopedics', label: 'عظام' },
  { value: 'neurology', label: 'مخ وأعصاب' },
  { value: 'psychiatry', label: 'طب نفسي' },
  { value: 'obstetrics-gynecology', label: 'نساء وتوليد' },
  { value: 'general-surgery', label: 'جراحة عامة' },
  { value: 'urology', label: 'مسالك بولية' },
  { value: 'nephrology', label: 'كلى' },
  { value: 'pulmonology', label: 'صدر' },
  { value: 'gastroenterology', label: 'جهاز هضمي' },
  { value: 'rheumatology', label: 'روماتيزم' },
  { value: 'oncology', label: 'أورام' },
  { value: 'hematology', label: 'أمراض دم' },
  { value: 'infectious-disease', label: 'أمراض معدية' },
  { value: 'family-medicine', label: 'طب الأسرة' },
  { value: 'emergency-medicine', label: 'طوارئ' },
  { value: 'anesthesiology', label: 'تخدير' },
  { value: 'radiology', label: 'أشعة' },
  { value: 'pathology', label: 'باثولوجي' },
  { value: 'physical-therapy', label: 'علاج طبيعي' },
  { value: 'plastic-surgery', label: 'جراحة تجميل' },
  { value: 'cardiothoracic-surgery', label: 'جراحة قلب وصدر' },
  { value: 'neurosurgery', label: 'جراحة مخ وأعصاب' },
  { value: 'vascular-surgery', label: 'جراحة أوعية دموية' },
  { value: 'dentistry', label: 'أسنان' },
  { value: 'hepatology', label: 'كبد' },
  { value: 'neonatology', label: 'حديثي الولادة' },
  { value: 'geriatrics', label: 'طب المسنين' },
  { value: 'allergy-immunology', label: 'حساسية ومناعة' },
  { value: 'pain-management', label: 'علاج الألم' },
]

type Tab = 'login' | 'register'
type UserRole = 'doctor' | 'frontdesk' | 'patient'

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const role = (searchParams.get('role') as UserRole) || 'doctor'

  const [activeTab, setActiveTab] = useState<Tab>('login')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [specialtySearch, setSpecialtySearch] = useState('')
  const [showSpecialtyDropdown, setShowSpecialtyDropdown] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const specialtyRef = useRef<HTMLDivElement>(null)

  // Close specialty dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (specialtyRef.current && !specialtyRef.current.contains(e.target as Node)) {
        setShowSpecialtyDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredSpecialties = useMemo(() => {
    if (!specialtySearch) return SPECIALTIES
    return SPECIALTIES.filter(s =>
      s.label.includes(specialtySearch) || s.value.includes(specialtySearch.toLowerCase())
    )
  }, [specialtySearch])

  const getRoleLabelAr = (r: UserRole) => {
    switch (r) {
      case 'doctor': return ar.iAmDoctor
      case 'frontdesk': return ar.iManageClinic
      case 'patient': return ar.iManageHealth
    }
  }

  const formatPhone = (raw: string) => {
    // Ensure +20 prefix for Egyptian numbers
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('20')) return '+' + digits
    if (digits.startsWith('0')) return '+20' + digits.slice(1)
    return '+20' + digits
  }

  // ============ LOGIN ============
  const handleLogin = async () => {
    setError('')
    if (!phone || !password) {
      setError('جميع الحقول مطلوبة')
      return
    }
    setLoading(true)
    try {
      const formattedPhone = formatPhone(phone)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, password, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'فشل تسجيل الدخول')
        return
      }
      // BUG-001 FIX: session cookie timing
      router.refresh()
      await new Promise(r => setTimeout(r, 150))
      const redirects: Record<UserRole, string> = {
        doctor: '/doctor/dashboard',
        patient: '/patient/dashboard',
        frontdesk: '/frontdesk/dashboard',
      }
      router.push(redirects[role])
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  // ============ REGISTER ============
  const handleRegister = async () => {
    setError('')
    if (!phone || !password || !fullName) {
      setError('جميع الحقول مطلوبة')
      return
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون ٦ أحرف على الأقل')
      return
    }
    if (password !== confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }
    if (role === 'doctor' && !specialty) {
      setError('التخصص مطلوب')
      return
    }

    setLoading(true)
    try {
      const formattedPhone = formatPhone(phone)

      // Check if phone already registered BEFORE sending OTP
      const checkRes = await fetch('/api/auth/check-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone }),
      })
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (checkData.exists) {
          setError('رقم الهاتف مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.')
          return
        }
      }

      // Send OTP
      const otpRes = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, purpose: 'registration' }),
      })

      if (!otpRes.ok) {
        const otpData = await otpRes.json()
        setError(otpData.error || 'فشل في إرسال رمز التحقق')
        return
      }

      // Store registration data in sessionStorage for OTP page to complete
      sessionStorage.setItem('pendingRegistration', JSON.stringify({
        phone: formattedPhone,
        password,
        role,
        fullName,
        specialty: role === 'doctor' ? specialty : undefined,
      }))

      router.push(`/otp?phone=${encodeURIComponent(formattedPhone)}&purpose=registration`)

    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-8">
      {/* Logo */}
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="12" y1="10" x2="12" y2="18" />
            <line x1="8" y1="14" x2="16" y2="14" />
          </svg>
        </div>
        <span className="text-xl font-bold text-gray-900">MedAssist</span>
      </div>

      {/* Role badge */}
      <div className="mb-6 px-4 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm font-medium">
        {getRoleLabelAr(role)}
      </div>

      {/* Tabs */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => { setActiveTab('login'); setError('') }}
            className={`flex-1 py-3.5 text-sm font-bold transition-colors ${
              activeTab === 'login'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {ar.login}
          </button>
          <button
            onClick={() => { setActiveTab('register'); setError('') }}
            className={`flex-1 py-3.5 text-sm font-bold transition-colors ${
              activeTab === 'register'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {ar.createAccount}
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
              {error}
            </div>
          )}

          {/* Phone Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.phoneNumber}</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-200">+20</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                dir="ltr"
              />
            </div>
          </div>

          {/* Full Name (register only) */}
          {activeTab === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.fullName}</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="الاسم الكامل"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Specialty (doctor register only) */}
          {activeTab === 'register' && role === 'doctor' && (
            <div ref={specialtyRef} className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.specialty}</label>
              <input
                type="text"
                value={specialtySearch || SPECIALTIES.find(s => s.value === specialty)?.label || ''}
                onChange={(e) => {
                  setSpecialtySearch(e.target.value)
                  setSpecialty('')
                  setShowSpecialtyDropdown(true)
                }}
                onFocus={() => setShowSpecialtyDropdown(true)}
                placeholder={ar.specialtyPlaceholder}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {showSpecialtyDropdown && filteredSpecialties.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredSpecialties.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        setSpecialty(s.value)
                        setSpecialtySearch(s.label)
                        setShowSpecialtyDropdown(false)
                      }}
                      className="w-full text-right px-4 py-2.5 text-sm hover:bg-primary-50 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.password}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              dir="ltr"
            />
          </div>

          {/* Confirm Password (register only) */}
          {activeTab === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.confirmPassword}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                dir="ltr"
              />
            </div>
          )}

          {/* Forgot Password (login only) */}
          {activeTab === 'login' && (
            <div className="text-left">
              <button
                onClick={() => router.push('/reset-password')}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {ar.forgotPassword}
              </button>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={activeTab === 'login' ? handleLogin : handleRegister}
            disabled={loading}
            className="w-full py-3 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? ar.loading : activeTab === 'login' ? ar.login : ar.createAccount}
          </button>
        </div>
      </div>

      {/* Back to role selection */}
      <button
        onClick={() => router.push('/choose-role')}
        className="mt-6 text-sm text-gray-500 hover:text-gray-700"
      >
        ← {ar.chooseYourRole}
      </button>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthContent />
    </Suspense>
  )
}
