'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Clinic Splash Screen — matches Figma design
 *
 * Animated entrance:
 * 1. Stethoscope icon fades in + scales
 * 2. "MedAssist" brand text slides up
 * 3. Arabic tagline "نظّم. تابع. واطمّن." reveals
 * 4. Subtext fades in (3 lines)
 * 5. CTA button appears
 */

function StethoscopeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.8 2.62a2 2 0 0 1 1.4-.58h0a2 2 0 0 1 2 2v4.47a4.15 4.15 0 0 1-1.17 2.89l-.13.13A4.15 4.15 0 0 0 5.73 14.4v.1a3.5 3.5 0 0 0 7 0v-.1a4.15 4.15 0 0 0-1.17-2.87l-.13-.13A4.15 4.15 0 0 1 10.26 8.51V4.04a2 2 0 0 1 2-2h0a2 2 0 0 1 1.4.58" />
      <circle cx="18" cy="16" r="3" />
      <path d="M15 16v-2a4 4 0 0 0-4-4" />
      <path d="M9.23 10a4 4 0 0 1-4-4V4" />
    </svg>
  )
}

export default function SplashPage() {
  const router = useRouter()
  const [showCTA, setShowCTA] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowCTA(true), 2200)
    return () => clearTimeout(timer)
  }, [])

  const handleContinue = () => {
    router.push('/login')
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-white flex flex-col items-center justify-center px-6 relative overflow-hidden max-w-md mx-auto"
    >
      {/* Top spacer */}
      <div className="flex-1 min-h-[120px]" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Stethoscope Icon — Figma: 32x32 bg #16A34A rounded-lg */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="w-[32px] h-[32px] bg-[#16A34A] rounded-lg flex items-center justify-center"
        >
          <StethoscopeIcon className="w-[17px] h-[17px] text-white" />
        </motion.div>

        {/* App Name — Figma: Inter 24px/36px weight 600 */}
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
          className="mt-3 font-inter text-[24px] leading-[36px] font-semibold text-[#0F172A]"
        >
          MedAssist
        </motion.span>

        {/* Spacer — Figma: 58px gap between logo group and tagline */}
        <div className="h-[58px]" />

        {/* Arabic Tagline — Figma: Cairo 28px/36px weight 600 */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8, ease: 'easeOut' }}
          className="font-cairo text-[28px] leading-[36px] font-semibold text-[#030712] text-center"
        >
          نظّم. تابع. واطمّن.
        </motion.h1>

        {/* Subtext — Figma: Cairo 16px/24px weight 400, 3 separate lines */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.2, ease: 'easeOut' }}
          className="mt-4 flex flex-col items-center gap-0"
        >
          <p className="font-cairo text-[16px] leading-[24px] text-[#6B7280] text-center">
            من متابعة صحتك
          </p>
          <p className="font-cairo text-[16px] leading-[24px] text-[#6B7280] text-center">
            إلى إدارة العيادة...
          </p>
          <p className="font-cairo text-[16px] leading-[24px] text-[#6B7280] text-center">
            كل شيء في مكان واحد.
          </p>
        </motion.div>
      </div>

      {/* Bottom spacer + CTA */}
      <div className="flex-1 min-h-[120px]" />

      {/* CTA Button — Figma: #22C55E, border-radius 14px, Cairo 16px/24px weight 600 */}
      <AnimatePresence>
        {showCTA && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-[348px] mb-12"
          >
            <button
              onClick={handleContinue}
              className="w-full py-4 rounded-[14px] font-cairo font-semibold text-[16px] leading-[24px] bg-[#22C55E] text-white active:scale-[0.98] transition-all"
            >
              ابدأ الآن
            </button>

            {/* Pagination dots placeholder — shows we're on splash (page 5 of 5 in Figma) */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[6px] h-[6px] rounded-full bg-[#0F172A]/15"
                />
              ))}
              <div className="w-[8px] h-[8px] rounded-full bg-[#22C55E]" />
            </div>

            {/* Footer link */}
            <div className="flex items-center justify-center gap-[5px] mt-4">
              <span className="font-cairo text-[13px] leading-[20px] text-[#4B5563]">
                لديك حساب؟
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  router.push('/login')
                }}
                className="font-cairo text-[13px] leading-[20px] font-semibold text-[#16A34A]"
              >
                سجّل دخولك
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
