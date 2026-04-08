'use client'

import { Suspense } from 'react'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'

function OTPVerificationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') || ''
  const purpose = searchParams.get('purpose') || 'registration'

  const [otp, setOtp] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const [canResend, setCanResend] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResend(true)
    }
  }, [countdown])

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleOTPChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1)
    if (!/^\d*$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError('')

    // Auto-advance to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 4 digits filled
    if (value && index === 3 && newOtp.every(d => d)) {
      handleVerify(newOtp.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp.join('')
    if (otpCode.length !== 4) {
      setError('أدخل الرمز المكون من ٤ أرقام')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Verify OTP
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode, purpose }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || ar.otpInvalid)
        return
      }

      // If registration, complete it
      if (purpose === 'registration') {
        const pendingData = sessionStorage.getItem('pendingRegistration')
        if (!pendingData) {
          setError('بيانات التسجيل غير موجودة. حاول مرة أخرى')
          return
        }

        const regData = JSON.parse(pendingData)
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(regData),
        })
        const regResult = await regRes.json()

        if (!regRes.ok) {
          // Catch duplicate phone error with friendly Arabic message
          const errMsg = regResult.error || ''
          if (errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('already')) {
            setError('رقم الهاتف مسجل بالفعل. يرجى تسجيل الدخول بدلاً من إنشاء حساب جديد.')
          } else {
            setError(errMsg || 'فشل في إنشاء الحساب')
          }
          return
        }

        sessionStorage.removeItem('pendingRegistration')

        // Auto-login after registration
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: regData.phone,
            password: regData.password,
            role: regData.role,
          }),
        })

        if (loginRes.ok) {
          router.refresh()
          await new Promise(r => setTimeout(r, 150))
          const redirects: Record<string, string> = {
            doctor: '/doctor/dashboard',
            patient: '/patient/dashboard',
            frontdesk: '/frontdesk/dashboard',
          }
          router.push(redirects[regData.role] || '/doctor/dashboard')
        } else {
          // Fallback to login page
          router.push(`/auth?role=${regData.role}`)
        }
      } else if (purpose === 'password_reset') {
        // Pass the single-use resetToken to the reset-password page so the
        // API can validate that OTP was genuinely verified server-side.
        const resetToken = data.resetToken || ''
        router.push(
          `/reset-password?phone=${encodeURIComponent(phone)}&resetToken=${encodeURIComponent(resetToken)}`
        )
      }

    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!canResend) return
    setCanResend(false)
    setCountdown(30)
    setError('')

    try {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose }),
      })
    } catch {
      setError('فشل في إعادة إرسال الرمز')
    }
  }

  // Format timer
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="12" y1="10" x2="12" y2="18" />
            <line x1="8" y1="14" x2="16" y2="14" />
          </svg>
        </div>
        <span className="text-xl font-bold text-gray-900">MedAssist</span>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{ar.otpVerification}</h1>
        <p className="text-sm text-gray-500 mb-6">
          {ar.enterOtpCode}<br />
          <span className="font-medium text-gray-700" dir="ltr">{phone}</span>
        </p>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* OTP Inputs */}
        <div className="flex justify-center gap-3 mb-6" dir="ltr">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOTPChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:outline-none transition-colors"
            />
          ))}
        </div>

        {/* Verify Button */}
        <button
          onClick={() => handleVerify()}
          disabled={loading || otp.some(d => !d)}
          className="w-full py-3 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? ar.loading : ar.verifyCode}
        </button>

        {/* Countdown / Resend */}
        <div className="text-sm text-gray-500">
          {canResend ? (
            <button
              onClick={handleResend}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              {ar.otpResend}
            </button>
          ) : (
            <span>
              {ar.otpResendIn} <span className="font-mono font-medium text-gray-700">{formatTime(countdown)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OTPVerificationPage() {
  return (
    <Suspense fallback={
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OTPVerificationContent />
    </Suspense>
  )
}
