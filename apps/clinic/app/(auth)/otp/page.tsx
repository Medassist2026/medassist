'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Stethoscope, ChevronRight, ShieldCheck, MessageSquare, Clock, Lock } from 'lucide-react'
import { motion } from 'framer-motion'

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

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResend(true)
    }
  }, [countdown])

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

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }
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
            router.push('/')
            return
          }
        }
        router.push('/login')
      } else if (purpose === 'password_reset') {
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

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const trustPoints = [
    { icon: MessageSquare, text: 'الرمز يُرسل عبر رسالة SMS فورية', sub: 'تصل خلال ثوانٍ' },
    { icon: Clock,         text: 'صالح لمدة ٣٠ دقيقة فقط', sub: 'لحماية حسابك' },
    { icon: Lock,          text: 'لا يمكن استخدامه أكثر من مرة', sub: 'كل رمز للاستخدام مرة واحدة' },
  ]

  return (
    <div dir="rtl" className="min-h-screen bg-white flex flex-col lg:flex-row overflow-hidden">

      {/* ─── RIGHT PANEL — form (first child = RIGHT in RTL) ─── */}
      <div className="flex-1 lg:w-[52%] flex flex-col min-h-screen lg:min-h-0">

        {/* Back button */}
        <div className="px-4 pt-10 lg:pt-8 lg:px-10 pb-2">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border-[1.2px] border-[#E2EEE6] flex items-center justify-center hover:bg-[#F0FDF4] transition-colors"
          >
            <ChevronRight className="w-[18px] h-[18px] text-[#888888]" />
          </button>
        </div>

        {/* Scrollable form area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 lg:px-16 py-6">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-[44px] h-[44px] bg-[#16A34A] rounded-xl flex items-center justify-center shadow-md shadow-green-200">
              <Stethoscope className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
            </div>
            <span className="mt-3 font-inter text-[20px] leading-[24px] font-semibold text-[#030712]">
              MedAssist
            </span>
          </div>

          {/* Heading */}
          <h1 className="font-cairo text-[24px] leading-[36px] font-bold text-[#030712] text-center">
            التحقق من الرمز
          </h1>
          <p className="mt-2 font-cairo text-[14px] leading-[22px] text-[#4B5563] text-center">
            أدخل رمز التحقق المرسل إلى
          </p>
          <span className="font-inter text-[14px] leading-[21px] font-semibold text-[#030712] mt-1 dir-ltr" dir="ltr">
            {phone}
          </span>

          {/* Dev bypass hint — visible when DEV_BYPASS_OTP is active (any 4-digit code works) */}
          {process.env.NEXT_PUBLIC_OTP_BYPASS_HINT === 'true' && (
            <div className="mt-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-center">
              <p className="font-mono text-[13px] text-amber-700">
                🔧 وضع التطوير — أي رمز مكون من 4 أرقام يعمل (مثال:{' '}
                <button
                  type="button"
                  className="font-bold underline cursor-pointer"
                  onClick={() => setOtp(['1','2','3','4'])}
                >
                  1234
                </button>
                )
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 font-cairo text-[14px] text-red-500 text-center"
            >
              {error}
            </motion.p>
          )}

          {/* OTP inputs */}
          <div className="flex justify-center gap-3 mt-8" dir="ltr">
            {otp.map((digit, i) => (
              <motion.input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOTPChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, type: 'spring', stiffness: 300, damping: 24 }}
                className={`w-[60px] h-[60px] text-center font-inter text-[26px] font-bold border-[1.5px] rounded-xl outline-none transition-all ${
                  digit
                    ? 'border-[#16A34A] bg-[#F0FDF4] text-[#030712]'
                    : 'border-[#E5E7EB] bg-white text-[#030712]'
                } focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20`}
              />
            ))}
          </div>

          {/* Confirm button */}
          <motion.button
            onClick={() => handleVerify()}
            disabled={loading || !isComplete}
            whileTap={isComplete ? { scale: 0.97 } : {}}
            className={`w-full max-w-[360px] h-[52px] rounded-xl font-cairo font-semibold text-[16px] leading-[24px] transition-all mt-8 ${
              isComplete
                ? 'bg-[#22C55E] text-white shadow-md shadow-green-200 hover:bg-[#16A34A]'
                : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                جاري التحقق...
              </span>
            ) : 'تأكيد'}
          </motion.button>

          {/* Timer / Resend */}
          <div className="flex items-center justify-center gap-2 mt-5">
            {canResend ? (
              <button
                onClick={handleResend}
                className="font-cairo text-[14px] font-semibold text-[#16A34A] hover:underline"
              >
                إعادة الإرسال
              </button>
            ) : (
              <>
                <span className="font-inter text-[14px] font-medium text-[#4B5563]" dir="ltr">
                  {formatTime(countdown)}
                </span>
                <span className="text-[#E5E7EB]">|</span>
                <span className="font-cairo text-[14px] text-[#9CA3AF]">إعادة الإرسال</span>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ─── LEFT PANEL — trust / security (second child = LEFT in RTL) ─── */}
      <div className="hidden lg:flex lg:w-[48%] bg-gradient-to-br from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0] flex-col items-center justify-center px-14 relative overflow-hidden">

        {/* Background rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[280, 380, 480].map((size, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-[#22C55E]/20"
              style={{ width: size, height: size }}
              animate={{ scale: [1, 1.04, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4 + i * 0.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
            />
          ))}
        </div>

        {/* Shield icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="w-[88px] h-[88px] bg-white rounded-3xl shadow-xl shadow-green-200 flex items-center justify-center mb-8 relative z-10"
        >
          <ShieldCheck className="w-[44px] h-[44px] text-[#16A34A]" strokeWidth={1.5} />
        </motion.div>

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-cairo text-[26px] font-bold text-[#064E3B] text-center mb-2 relative z-10"
        >
          رمزك في أمان تام
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-cairo text-[14px] text-[#166534] text-center mb-10 relative z-10 max-w-[280px]"
        >
          نستخدم التحقق بخطوتين لحماية بياناتك الطبية الحساسة
        </motion.p>

        {/* Trust points */}
        <div className="flex flex-col gap-4 w-full max-w-[320px] relative z-10">
          {trustPoints.map(({ icon: Icon, text, sub }, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.1, type: 'spring', stiffness: 260, damping: 22 }}
              className="flex items-start gap-3 bg-white/70 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-sm"
            >
              <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
                <Icon className="w-[18px] h-[18px] text-[#16A34A]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-cairo text-[13px] font-semibold text-[#064E3B]">{text}</p>
                <p className="font-cairo text-[12px] text-[#166534] mt-0.5">{sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

    </div>
  )
}
