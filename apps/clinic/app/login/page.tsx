'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Stethoscope, Eye, EyeOff, ChevronRight, Building2, Users } from 'lucide-react'

/**
 * Clinic Auth Page — Tabbed login/register (single page)
 * Matches Figma registration screens exactly:
 * - Registration: role selector (doctor/frontdesk) + fullName, phone (+20), password, confirmPassword, terms
 * - Login: phone (+20), password, forgot password link (auto-detects role from backend)
 * - Shared: back arrow, stethoscope logo, tab switcher, footer toggle
 */

type AuthTab = 'login' | 'register'
type RegisterRole = 'doctor' | 'frontdesk'

export default function AuthPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<AuthTab>('login')

  // Shared fields
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Register-only fields
  const [fullName, setFullName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [registerRole, setRegisterRole] = useState<RegisterRole>('doctor')

  // State
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Form validity
  const isLoginValid = phone.length >= 10 && password.length >= 8
  const isRegisterValid =
    fullName.trim().length >= 2 &&
    phone.length >= 10 &&
    password.length >= 8 &&
    /\d/.test(password) &&
    confirmPassword.length >= 8 &&
    password === confirmPassword

  const isFormValid = activeTab === 'login' ? isLoginValid : isRegisterValid

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid) return

    setIsLoading(true)
    setError('')

    try {
      if (activeTab === 'register') {
        // Step 1: Check if phone already exists
        const checkRes = await fetch('/api/auth/check-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: `+20${phone}` }),
        })
        const checkData = await checkRes.json()
        if (checkData.exists) {
          throw new Error('رقم الهاتف مسجل بالفعل')
        }

        // Step 2: Register with selected role
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: `+20${phone}`,
            password,
            fullName: fullName.trim(),
            role: registerRole,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'حدث خطأ. حاول مرة أخرى.')
        }

        // Step 3: Store pending registration for auto-login after OTP
        try {
          sessionStorage.setItem('pendingRegistration', JSON.stringify({
            phone: `+20${phone}`,
            password,
            role: registerRole,
          }))
        } catch {
          // sessionStorage not available — OTP will fall back to login page
        }

        // Step 4: Send OTP for verification
        await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: `+20${phone}`, purpose: 'registration' }),
        })

        // Navigate to OTP page
        router.push(`/otp?phone=${encodeURIComponent(`+20${phone}`)}&purpose=registration`)
      } else {
        // Login flow — try doctor first, then frontdesk
        let loginSuccess = false

        for (const role of ['doctor', 'frontdesk'] as const) {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: `+20${phone}`,
              password,
              role,
            }),
          })

          if (res.ok) {
            loginSuccess = true
            router.push('/')
            router.refresh()
            break
          }

          // If 401 with role mismatch, try next role
          // If other error, show it
          if (res.status !== 401) {
            const data = await res.json()
            throw new Error(data.error || 'حدث خطأ. حاول مرة أخرى.')
          }
        }

        if (!loginSuccess) {
          throw new Error('بيانات الدخول غير صحيحة')
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-white flex flex-col max-w-md mx-auto"
    >
      {/* Back button — Figma: 36x36 circle, border 1.2px #E2EEE6 */}
      <div className="px-4 pt-12 pb-2">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border-[1.2px] border-[#E2EEE6] flex items-center justify-center"
        >
          <ChevronRight className="w-[18px] h-[18px] text-[#888888]" />
        </button>
      </div>

      {/* Logo — Figma: 32x32 #16A34A rounded-8px + Inter 18px/22px #030712 */}
      <div className="flex flex-col items-center mt-4">
        <div className="w-[32px] h-[32px] bg-[#16A34A] rounded-lg flex items-center justify-center">
          <Stethoscope className="w-[17px] h-[17px] text-white" strokeWidth={1.5} />
        </div>
        <span className="mt-3 font-inter text-[18px] leading-[22px] font-semibold text-[#030712]">
          MedAssist
        </span>
      </div>

      {/* Tab switcher — Figma: bg #F3F4F6, border 0.8px #E5E7EB, h-44px, rounded-8px */}
      <div className="mx-4 mt-6 flex bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg overflow-hidden">
        <button
          onClick={() => { setActiveTab('register'); setError('') }}
          className={`flex-1 h-[44px] font-cairo text-[14px] leading-[21px] transition-all ${
            activeTab === 'register'
              ? 'font-semibold text-[#16A34A] border-b-2 border-[#16A34A]'
              : 'font-normal text-[#4B5563]'
          }`}
        >
          إنشاء حساب
        </button>
        <button
          onClick={() => { setActiveTab('login'); setError('') }}
          className={`flex-1 h-[44px] font-cairo text-[14px] leading-[21px] transition-all ${
            activeTab === 'login'
              ? 'font-semibold text-[#16A34A] border-b-2 border-[#16A34A]'
              : 'font-normal text-[#4B5563]'
          }`}
        >
          تسجيل الدخول
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col px-4 mt-6 gap-5">
        {/* Role selector — Register only */}
        {activeTab === 'register' && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRegisterRole('doctor')}
              className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-[1.5px] transition-all ${
                registerRole === 'doctor'
                  ? 'border-[#16A34A] bg-[#F0FDF4]'
                  : 'border-[#E5E7EB] bg-[#F9FAFB]'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                registerRole === 'doctor' ? 'bg-[#DCFCE7]' : 'bg-[#F3F4F6]'
              }`}>
                <Building2 className={`w-[18px] h-[18px] ${
                  registerRole === 'doctor' ? 'text-[#16A34A]' : 'text-[#9CA3AF]'
                }`} />
              </div>
              <div className="text-right">
                <p className={`font-cairo text-[13px] font-semibold ${
                  registerRole === 'doctor' ? 'text-[#030712]' : 'text-[#4B5563]'
                }`}>طبيب</p>
                <p className={`font-cairo text-[10px] mt-0.5 ${
                  registerRole === 'doctor' ? 'text-[#4B5563]' : 'text-[#9CA3AF]'
                }`}>كتابة الروشتة والتشخيص</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setRegisterRole('frontdesk')}
              className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-[1.5px] transition-all ${
                registerRole === 'frontdesk'
                  ? 'border-[#2563EB] bg-[#EFF6FF]'
                  : 'border-[#E5E7EB] bg-[#F9FAFB]'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                registerRole === 'frontdesk' ? 'bg-[#DBEAFE]' : 'bg-[#F3F4F6]'
              }`}>
                <Users className={`w-[18px] h-[18px] ${
                  registerRole === 'frontdesk' ? 'text-[#2563EB]' : 'text-[#9CA3AF]'
                }`} />
              </div>
              <div className="text-right">
                <p className={`font-cairo text-[13px] font-semibold ${
                  registerRole === 'frontdesk' ? 'text-[#030712]' : 'text-[#4B5563]'
                }`}>استقبال</p>
                <p className={`font-cairo text-[10px] mt-0.5 ${
                  registerRole === 'frontdesk' ? 'text-[#4B5563]' : 'text-[#9CA3AF]'
                }`}>تسجيل المرضى وإدارة المواعيد</p>
              </div>
            </button>
          </div>
        )}

        {/* Full Name — Register only */}
        {activeTab === 'register' && (
          <div className="flex flex-col gap-2">
            <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
              الاسم الكامل
            </label>
            <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="أدخل اسمك الكامل"
                className="flex-1 bg-transparent font-cairo text-[14px] leading-[26px] text-[#030712] placeholder:text-[#9CA3AF] outline-none text-right"
              />
            </div>
          </div>
        )}

        {/* Phone number — Figma: +20 prefix, separator, input */}
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
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="01XXXXXXXXX"
              className="flex-1 bg-transparent font-cairo text-[14px] leading-[26px] text-[#030712] placeholder:text-[#9CA3AF] outline-none text-right"
              dir="ltr"
            />
          </div>
        </div>

        {/* Password — Figma: eye toggle left, input right, h-48px */}
        <div className="flex flex-col gap-2">
          <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
            كلمة المرور
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="flex-1 bg-transparent font-cairo text-[14px] leading-[26px] text-[#030712] placeholder:text-[#4B5563] outline-none text-right"
            />
          </div>
          {/* Password hint — Register only, Figma: Cairo 12px #4B5563 */}
          {activeTab === 'register' && (
            <span className="font-cairo text-[12px] leading-[18px] text-[#4B5563]">
              على الأقل ٨ أحرف
            </span>
          )}
        </div>

        {/* Confirm Password — Register only */}
        {activeTab === 'register' && (
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
              />
            </div>
            {/* Mismatch warning */}
            {confirmPassword && password !== confirmPassword && (
              <span className="font-cairo text-[12px] leading-[18px] text-red-500">
                كلمات المرور غير متطابقة
              </span>
            )}
          </div>
        )}

        {/* Forgot password link — Login only, Figma: Cairo 14px #16A34A */}
        {activeTab === 'login' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => router.push('/reset-password')}
              className="font-cairo text-[14px] text-[#16A34A] font-medium"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-cairo text-[14px] text-red-500 text-center"
          >
            {error}
          </motion.p>
        )}

        {/* Submit button — Figma:
            Enabled: bg #22C55E, text #F9FAFB
            Disabled: bg #E5E7EB, text #9CA3AF
            h-48px, rounded-8px, Cairo 16px/24px weight 600 */}
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className={`w-full h-[48px] rounded-lg font-cairo font-semibold text-[16px] leading-[24px] transition-all mt-1 ${
            isFormValid && !isLoading
              ? 'bg-[#22C55E] text-[#F9FAFB] active:scale-[0.98]'
              : isLoading
                ? 'bg-[#22C55E]/70 text-[#F9FAFB] cursor-wait'
                : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
          }`}
        >
          {isLoading
            ? (activeTab === 'login' ? 'جاري الدخول...' : 'جاري التسجيل...')
            : activeTab === 'login'
              ? 'تسجيل الدخول'
              : 'إنشاء حساب'
          }
        </button>

        {/* Helper text — Figma: Cairo 12px #9CA3AF, only when form incomplete */}
        {!isFormValid && !isLoading && (
          <p className="font-cairo text-[12px] leading-[18px] text-[#9CA3AF] text-center">
            أكمل جميع الحقول للمتابعة
          </p>
        )}

        {/* Terms — Register only, Figma: Cairo 12px #4B5563, links #15803D underlined */}
        {activeTab === 'register' && (
          <p className="font-cairo text-[12px] leading-[18px] text-[#4B5563] text-center mt-1">
            بإنشاء حساب، أنت توافق على{' '}
            <Link href="/terms" className="underline text-[#15803D] font-medium">
              الشروط
            </Link>
            {' '}و{' '}
            <Link href="/privacy" className="underline text-[#15803D] font-medium">
              سياسة الخصوصية
            </Link>
          </p>
        )}
      </form>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer — Figma: Cairo 12px, toggle between login/register */}
      <div className="flex items-center justify-center gap-1 pb-10">
        <span className="font-cairo text-[12px] leading-[18px] text-[#4B5563]">
          {activeTab === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
        </span>
        <button
          onClick={() => { setActiveTab(activeTab === 'login' ? 'register' : 'login'); setError('') }}
          className="font-cairo text-[12px] leading-[18px] font-semibold text-[#16A34A]"
        >
          {activeTab === 'login' ? 'أنشئ واحد' : 'سجل دخولك'}
        </button>
      </div>
    </div>
  )
}
