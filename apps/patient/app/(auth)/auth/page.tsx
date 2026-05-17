'use client'

/**
 * Patient-only auth page (K-3b, 2026-05-15, D-085).
 *
 * Pre-K-3b this page accepted a `?role=` query parameter and rendered
 * doctor / frontdesk / patient variants (with a specialty selector for
 * the doctor case). When the param was absent, role defaulted to
 * `'doctor'` — a patient navigating directly to `/auth` landed on the
 * doctor login UI (Finding I-9). This was a copy-paste from the
 * clinic-app routing era; clinic-app actually uses `/login` + `/role-
 * select` and does NOT have an `/auth` route, so there was never a
 * legitimate caller for the doctor / frontdesk branches inside the
 * patient app.
 *
 * Phase J Mo ratification (2026-05-15) ruled option (2) — split auth
 * surfaces. The patient app now exposes a patient-only `/auth`; doctor
 * + frontdesk auth lives ONLY in the clinic-app's `/login` and
 * `/role-select` routes. See D-085 for the architectural rationale.
 *
 * Future patient-app enrichments (password reset per D-082, OAuth,
 * biometric, magic-link) ship into this surface without leak risk into
 * doctor/frontdesk flows.
 *
 * The page accepts `?tab=login` (default) or `?tab=register` so the
 * `/intro` splash CTAs can deep-link directly to the right tab.
 */

import { Suspense } from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'
import {
  isValidEgyptianLocalPhone,
  getEgyptianPhoneError,
  normalizeEgyptianDigits,
} from '@shared/lib/utils/phone-validation'

type Tab = 'login' | 'register'

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: Tab = tabParam === 'register' ? 'register' : 'login'

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // If the URL `?tab=` param changes (e.g., user clicks the other CTA
  // on /intro), sync the active tab without remounting the form.
  useEffect(() => {
    if (tabParam === 'register' && activeTab !== 'register') {
      setActiveTab('register')
      setError('')
    } else if (tabParam !== 'register' && activeTab !== 'login') {
      // tab=login or unset both mean "login"
      setActiveTab('login')
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam])

  const formatPhone = (raw: string) => {
    // Ensure +20 prefix for Egyptian numbers (consumed by the login /
    // register handlers + the shared phone validator).
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
    if (!isValidEgyptianLocalPhone(phone)) {
      setPhoneTouched(true)
      setError(getEgyptianPhoneError(phone) || 'رقم الهاتف غير صحيح')
      return
    }
    setLoading(true)
    try {
      const formattedPhone = formatPhone(phone)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedPhone,
          password,
          // Patient-only surface — role hardcoded per D-085. The login
          // handler still requires a role in the body for shared
          // multi-role API contract; we always pass 'patient' here.
          role: 'patient',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'فشل تسجيل الدخول')
        return
      }
      // BUG-001 session cookie timing — preserved from pre-K-3b version.
      router.refresh()
      await new Promise(r => setTimeout(r, 150))
      router.push('/patient/dashboard')
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
    if (!isValidEgyptianLocalPhone(phone)) {
      setPhoneTouched(true)
      setError(getEgyptianPhoneError(phone) || 'رقم الهاتف غير صحيح')
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

    setLoading(true)
    try {
      const formattedPhone = formatPhone(phone)

      // Check if phone already registered BEFORE sending OTP. This
      // surfaces "already registered → sign in" UX up-front rather than
      // burning an SMS first.
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

      // Send OTP for registration verification.
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

      // Store registration data in sessionStorage for the /otp page to
      // complete after verification. Role hardcoded 'patient' per D-085.
      sessionStorage.setItem('pendingRegistration', JSON.stringify({
        phone: formattedPhone,
        password,
        role: 'patient',
        fullName,
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
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="12" y1="10" x2="12" y2="18" />
            <line x1="8" y1="14" x2="16" y2="14" />
          </svg>
        </div>
        <span className="text-xl font-bold text-gray-900">MedAssist</span>
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
                onChange={(e) => setPhone(normalizeEgyptianDigits(e.target.value))}
                onBlur={() => setPhoneTouched(true)}
                placeholder="01XXXXXXXXX"
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                dir="ltr"
                inputMode="numeric"
              />
            </div>
            {phoneTouched && getEgyptianPhoneError(phone) && (
              <p className="mt-1.5 text-xs text-red-600">{getEgyptianPhoneError(phone)}</p>
            )}
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

          {/* Forgot Password (login only) — patient app links to /reset-password
              per D-082 (password-only sign-in spec); SMS-OTP becomes the
              recovery channel when password-reset ships (Prompt 10 territory). */}
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

      {/* Back to /intro (K-3c, 2026-05-15) — was `/choose-role` (404, I-12)
          pre-fix; now points at the canonical first-time landing the
          patient app actually has. */}
      <Link
        href="/intro"
        className="mt-6 text-sm text-gray-500 hover:text-gray-700"
      >
        ← العودة
      </Link>
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
