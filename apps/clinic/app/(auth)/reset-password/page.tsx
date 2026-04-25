'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Stethoscope, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  isValidEgyptianLocalPhone,
  getEgyptianPhoneError,
  normalizeEgyptianDigits,
} from '@shared/lib/utils/phone-validation'

/**
 * Reset Password Page — Matches Figma design
 * Two modes:
 * 1. No token: Enter phone → send OTP → navigate to /otp
 * 2. With token (from OTP verification): Enter new password + confirm
 *
 * Security: password reset requires a server-generated token from verified OTP
 * (not a spoofable client-side `verified=true` param)
 */

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#16A34A] border-t-transparent rounded-full" /></div>}>
      <ResetPasswordPageInner />
    </Suspense>
  )
}

function ResetPasswordPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phoneParam = searchParams.get('phone') || ''
  const resetToken = searchParams.get('token') || ''
  const hasToken = !!resetToken

  // Step 1: Phone entry
  const [phone, setPhone] = useState(phoneParam.replace('+20', ''))
  const [phoneTouched, setPhoneTouched] = useState(false)

  // Step 2: New password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('20')) return '+' + digits
    if (digits.startsWith('0')) return '+20' + digits.slice(1)
    return '+20' + digits
  }

  // Step 1: Send OTP for password reset
  const handleSendOTP = async () => {
    setError('')
    if (!phone || phone.length < 10) {
      setError('أدخل رقم هاتف صحيح')
      return
    }

    setLoading(true)
    try {
      const formattedPhone = formatPhone(phone)
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, purpose: 'password_reset' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'فشل في إرسال رمز التحقق')
        return
      }

      router.push(`/otp?phone=${encodeURIComponent(formattedPhone)}&purpose=password_reset`)
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Set new password (requires valid reset token)
  const handleResetPassword = async () => {
    setError('')
    if (!newPassword || !confirmPassword) {
      setError('جميع الحقول مطلوبة')
      return
    }
    if (newPassword.length < 8) {
      setError('كلمة المرور يجب أن تكون ٨ أحرف على الأقل')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneParam || formatPhone(phone),
          newPassword,
          resetToken, // Server-verified token from OTP flow
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'فشل في تغيير كلمة المرور')
        return
      }

      setSuccess(true)
      // Auto-redirect to login after 2 seconds
      setTimeout(() => router.push('/login'), 2000)
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  const isStep2Valid = newPassword.length >= 8 && confirmPassword.length >= 8 && newPassword === confirmPassword
  const isStep1Valid = isValidEgyptianLocalPhone(phone)
  const phoneError = phoneTouched ? getEgyptianPhoneError(phone) : null

  // Success state
  if (success) {
    return (
      <div dir="rtl" className="min-h-screen bg-white flex flex-col items-center justify-center px-6 max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-[#DCFCE7] rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-cairo text-[20px] font-bold text-[#030712] mb-2">تم تغيير كلمة المرور بنجاح</h2>
          <p className="font-cairo text-[14px] text-[#4B5563]">جاري تحويلك لتسجيل الدخول...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-white flex flex-col max-w-md mx-auto">
      {/* Back button */}
      <div className="px-4 pt-12 pb-2">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border-[1.2px] border-[#E2EEE6] flex items-center justify-center"
        >
          <ChevronRight className="w-[18px] h-[18px] text-[#888888]" />
        </button>
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center mt-4">
        <div className="w-[32px] h-[32px] bg-[#16A34A] rounded-lg flex items-center justify-center">
          <Stethoscope className="w-[17px] h-[17px] text-white" strokeWidth={1.5} />
        </div>
        <span className="mt-3 font-inter text-[18px] leading-[22px] font-semibold text-[#030712]">
          MedAssist
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col px-4 mt-8">
        {/* Heading */}
        <h1 className="font-cairo text-[22px] leading-[33px] font-bold text-[#030712] text-center">
          {hasToken ? 'كلمة مرور جديدة' : 'نسيت كلمة المرور؟'}
        </h1>
        <p className="mt-2 font-cairo text-[14px] leading-[21px] text-[#4B5563] text-center">
          {hasToken
            ? 'أدخل كلمة المرور الجديدة'
            : 'أدخل رقم الموبايل وسنرسل لك رمز التحقق'
          }
        </p>

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 font-cairo text-[14px] text-red-500 text-center"
          >
            {error}
          </motion.p>
        )}

        {hasToken ? (
          // Step 2: New password form
          <div className="flex flex-col gap-5 mt-6">
            {/* New Password */}
            <div className="flex flex-col gap-2">
              <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
                كلمة المرور الجديدة
              </label>
              <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1"
                >
                  {showPassword ? (
                    <EyeOff className="w-[18px] h-[18px] text-[#4B5563]" />
                  ) : (
                    <Eye className="w-[18px] h-[18px] text-[#4B5563]" />
                  )}
                </button>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent font-cairo text-[14px] leading-[26px] text-[#030712] placeholder:text-[#4B5563] outline-none text-right"
                  dir="ltr"
                />
              </div>
              <span className="font-cairo text-[12px] leading-[18px] text-[#4B5563]">
                على الأقل ٨ أحرف
              </span>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-2">
              <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
                تأكيد كلمة المرور
              </label>
              <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="p-1"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-[18px] h-[18px] text-[#4B5563]" />
                  ) : (
                    <Eye className="w-[18px] h-[18px] text-[#4B5563]" />
                  )}
                </button>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent font-cairo text-[14px] leading-[26px] text-[#030712] placeholder:text-[#4B5563] outline-none text-right"
                  dir="ltr"
                />
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <span className="font-cairo text-[12px] leading-[18px] text-red-500">
                  كلمات المرور غير متطابقة
                </span>
              )}
            </div>

            {/* Save button */}
            <button
              onClick={handleResetPassword}
              disabled={loading || !isStep2Valid}
              className={`w-full h-[48px] rounded-lg font-cairo font-semibold text-[16px] leading-[24px] transition-all mt-2 ${
                isStep2Valid
                  ? 'bg-[#22C55E] text-[#F9FAFB] active:scale-[0.98]'
                  : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              {loading ? '...' : 'حفظ كلمة المرور'}
            </button>

            {/* Footer note — Figma */}
            <p className="font-cairo text-[12px] leading-[18px] text-[#9CA3AF] text-center">
              بعد الحفظ سيتم تسجيل دخولك تلقائياً
            </p>
          </div>
        ) : (
          // Step 1: Phone entry
          <div className="flex flex-col gap-5 mt-6">
            <div className="flex flex-col gap-2">
              <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
                رقم الموبايل
              </label>
              <div className="flex items-center gap-2 bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <span className="font-inter text-[14px] leading-[21px] text-[#4B5563]">+20</span>
                <div className="w-px h-5 bg-[#E5E7EB]" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(normalizeEgyptianDigits(e.target.value))}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="01XXXXXXXXX"
                  className="flex-1 bg-transparent font-cairo text-[14px] leading-[26px] text-[#030712] placeholder:text-[#9CA3AF] outline-none text-right"
                  dir="ltr"
                  inputMode="numeric"
                />
              </div>
              {phoneError && (
                <span className="font-cairo text-[12px] text-red-500">{phoneError}</span>
              )}
            </div>

            <button
              onClick={handleSendOTP}
              disabled={loading || !isStep1Valid}
              className={`w-full h-[48px] rounded-lg font-cairo font-semibold text-[16px] leading-[24px] transition-all mt-2 ${
                isStep1Valid
                  ? 'bg-[#22C55E] text-[#F9FAFB] active:scale-[0.98]'
                  : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              {loading ? '...' : 'إرسال رمز التحقق'}
            </button>
          </div>
        )}

        {/* Back to login */}
        <button
          onClick={() => router.push('/login')}
          className="mt-6 font-cairo text-[14px] text-[#16A34A] font-medium text-center"
        >
          العودة لتسجيل الدخول
        </button>
      </div>

      <div className="flex-1" />
    </div>
  )
}
