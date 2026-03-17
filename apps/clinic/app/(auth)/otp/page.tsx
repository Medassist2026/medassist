'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Stethoscope, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'

/**
 * OTP Verification Page — Matches Figma design
 * - Back arrow top-right
 * - Stethoscope logo + MedAssist
 * - "التحقق من الرمز" heading
 * - "أدخل رمز التحقق المرسل إلى [phone]"
 * - 4 digit inputs (LTR)
 * - Confirm button: green when filled, gray #E5E7EB when empty
 * - Timer: "00:30 | إعادة الإرسال"
 */

export default function OTPVerificationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#16A34A] border-t-transparent rounded-full" /></div>}>
      <OTPVerificationPageInner />
    </Suspense>
  )
}

function OTPVerificationPageInner() {
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

  const isComplete = otp.every(d => d !== '')

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
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode, purpose }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'رمز التحقق غير صحيح')
        return
      }

      if (purpose === 'registration') {
        // Registration OTP verified — user was already created in login/page.tsx
        // Auto-login: try logging in with stored credentials
        const pendingData = sessionStorage.getItem('pendingRegistration')
        if (pendingData) {
          const regData = JSON.parse(pendingData)
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: regData.phone,
              password: regData.password,
              role: regData.role,
            }),
          })

          sessionStorage.removeItem('pendingRegistration')

          if (loginRes.ok) {
            router.refresh()
            await new Promise(r => setTimeout(r, 150))
            // Route to root — it auto-redirects to /setup (new user) or role dashboard
            router.push('/')
            return
          }
        }
        // Fallback — go to login
        router.push('/login')
      } else if (purpose === 'password_reset') {
        // Server returns a reset token after OTP verification
        // Pass it to reset-password page (token is single-use, 10 min expiry)
        const resetToken = data.resetToken
        if (resetToken) {
          router.push(`/reset-password?phone=${encodeURIComponent(phone)}&token=${encodeURIComponent(resetToken)}`)
        } else {
          router.push(`/reset-password?phone=${encodeURIComponent(phone)}`)
        }
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

  // Format timer — Figma shows "00:30"
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div dir="rtl" className="min-h-screen bg-white flex flex-col">
      {/* Back button — same as login page */}
      <div className="px-4 pt-12 pb-2">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border-[1.2px] border-[#E2EEE6] flex items-center justify-center"
        >
          <ChevronRight className="w-[18px] h-[18px] text-[#888888]" />
        </button>
      </div>

      {/* Logo — Figma: stethoscope 32x32 + MedAssist 18px */}
      <div className="flex flex-col items-center mt-4">
        <div className="w-[32px] h-[32px] bg-[#16A34A] rounded-lg flex items-center justify-center">
          <Stethoscope className="w-[17px] h-[17px] text-white" strokeWidth={1.5} />
        </div>
        <span className="mt-3 font-inter text-[18px] leading-[22px] font-semibold text-[#030712]">
          MedAssist
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center px-6 mt-8">
        {/* Heading — Figma: Cairo 22px weight 700 #030712 */}
        <h1 className="font-cairo text-[22px] leading-[33px] font-bold text-[#030712] text-center">
          التحقق من الرمز
        </h1>

        {/* Subtitle — Figma: Cairo 14px #4B5563 */}
        <p className="mt-2 font-cairo text-[14px] leading-[21px] text-[#4B5563] text-center">
          أدخل رمز التحقق المرسل إلى
        </p>
        <span className="font-inter text-[14px] leading-[21px] font-medium text-[#030712] mt-1" dir="ltr">
          {phone}
        </span>

        {/* Error message */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 font-cairo text-[14px] text-red-500 text-center"
          >
            {error}
          </motion.p>
        )}

        {/* OTP Inputs — 4 boxes, LTR, Figma: 56x56, border 1.5px #E5E7EB, rounded-12px */}
        <div className="flex justify-center gap-3 mt-8" dir="ltr">
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
              className={`w-[56px] h-[56px] text-center font-inter text-[24px] font-bold border-[1.5px] rounded-xl outline-none transition-colors ${
                digit
                  ? 'border-[#16A34A] text-[#030712]'
                  : 'border-[#E5E7EB] text-[#030712]'
              } focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20`}
            />
          ))}
        </div>

        {/* Confirm button — Figma: green when filled, gray when empty */}
        <button
          onClick={() => handleVerify()}
          disabled={loading || !isComplete}
          className={`w-full max-w-[348px] h-[48px] rounded-lg font-cairo font-semibold text-[16px] leading-[24px] transition-all mt-8 ${
            isComplete
              ? 'bg-[#22C55E] text-[#F9FAFB] active:scale-[0.98]'
              : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
          }`}
        >
          {loading ? '...' : 'تأكيد'}
        </button>

        {/* Timer + Resend — Figma: "00:30 | إعادة الإرسال" */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {canResend ? (
            <button
              onClick={handleResend}
              className="font-cairo text-[14px] font-semibold text-[#16A34A]"
            >
              إعادة الإرسال
            </button>
          ) : (
            <>
              <span className="font-inter text-[14px] font-medium text-[#4B5563]" dir="ltr">
                {formatTime(countdown)}
              </span>
              <span className="text-[#E5E7EB]">|</span>
              <span className="font-cairo text-[14px] text-[#9CA3AF]">
                إعادة الإرسال
              </span>
            </>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  )
}
