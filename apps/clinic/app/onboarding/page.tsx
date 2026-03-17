'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  FolderOpen,
  FileText,
  Stethoscope,
  Calendar,
  ClipboardList,
  Shield,
  Clock,
  Users,
} from 'lucide-react'

/**
 * Onboarding Slides — 3 feature highlight slides
 * Matches Figma onboarding screens with:
 * - Floating icon compositions
 * - Bold stat numbers (أسرع 3x, ١ مكان, ٠ ورق)
 * - Headline + subtitle
 * - Pagination dots + navigation
 */

interface Slide {
  stat: string
  statLabel: string
  headline: string
  subtitle: string
  accentColor: string
  // Icon composition config
  mainIcon: React.ElementType
  topIcon: React.ElementType
  bottomIcon: React.ElementType
  badgeIcon: React.ElementType
}

const slides: Slide[] = [
  {
    stat: '3x',
    statLabel: 'أسرع',
    headline: 'في إدارة المواعيد',
    subtitle: 'نظّم جدولك، استقبل مرضاك، وتابع حالاتهم بسرعة غير مسبوقة',
    accentColor: '#2DBE5C',
    mainIcon: Zap,
    topIcon: Clock,
    bottomIcon: Calendar,
    badgeIcon: Zap,
  },
  {
    stat: '1',
    statLabel: 'مكان',
    headline: 'كل بيانات مرضاك في مكان واحد',
    subtitle: 'ملفات، مواعيد، وسجلات صحية — كلها تحت إيدك في ثاني',
    accentColor: '#2DBE5C',
    mainIcon: FolderOpen,
    topIcon: Users,
    bottomIcon: ClipboardList,
    badgeIcon: Shield,
  },
  {
    stat: '0',
    statLabel: 'ورق',
    headline: 'روشتات رقمية آمنة',
    subtitle: 'كل حاجة ديجيتال — من الكشف للروشتة للتحاليل',
    accentColor: '#2DBE5C',
    mainIcon: FileText,
    topIcon: Stethoscope,
    bottomIcon: Shield,
    badgeIcon: FileText,
  },
]

function IconComposition({ slide, isActive }: { slide: Slide; isActive: boolean }) {
  const MainIcon = slide.mainIcon
  const TopIcon = slide.topIcon
  const BottomIcon = slide.bottomIcon
  const BadgeIcon = slide.badgeIcon

  return (
    <div className="relative w-[220px] h-[210px]">
      {/* Radial gradient background */}
      <div
        className="absolute inset-0 opacity-[0.88]"
        style={{
          background: `radial-gradient(69% 72% at 50% 50%, rgba(45, 190, 92, 0.15) 0%, rgba(0, 0, 0, 0) 70%)`,
        }}
      />

      {/* Main large icon card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: isActive ? 1 : 0.5, scale: isActive ? 1 : 0.9, rotate: 1.15 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[104px] h-[104px] bg-[#F8FBF9] border-[1.2px] border-[#E2EEE6] rounded-[22px] flex items-center justify-center"
        style={{ boxShadow: '0px 8px 28px rgba(45, 190, 92, 0.15)' }}
      >
        <MainIcon className="w-[42px] h-[42px] text-[#2DBE5C]" strokeWidth={1.4} />
      </motion.div>

      {/* Top small icon */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 20, rotate: -0.99 }}
        transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
        className="absolute left-1/2 -translate-x-1/2 top-0 w-[56px] h-[56px] bg-[#F8FBF9] border-[1.2px] border-[#E2EEE6] rounded-[16px] flex items-center justify-center"
        style={{ boxShadow: '0px 8px 28px rgba(45, 190, 92, 0.15)' }}
      >
        <TopIcon className="w-[24px] h-[24px] text-[#2DBE5C]" strokeWidth={1.4} />
      </motion.div>

      {/* Bottom-left small icon */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: isActive ? 1 : 0, x: isActive ? 0 : -20, rotate: 0.16 }}
        transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
        className="absolute left-0 bottom-[10px] w-[56px] h-[56px] bg-[#F8FBF9] border-[1.2px] border-[#E2EEE6] rounded-[16px] flex items-center justify-center"
        style={{ boxShadow: '0px 8px 28px rgba(45, 190, 92, 0.15)' }}
      >
        <BottomIcon className="w-[24px] h-[24px] text-[#2DBE5C]" strokeWidth={1.4} />
      </motion.div>

      {/* Badge icon (top-left of main card) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 0.5 }}
        transition={{ duration: 0.3, delay: 0.4, ease: 'easeOut' }}
        className="absolute left-[calc(50%-52px-7px)] top-[calc(50%-52px-9px)] w-[34px] h-[34px] bg-[#2DBE5C] rounded-lg flex items-center justify-center"
        style={{ boxShadow: '0px 4px 12px rgba(45, 190, 92, 0.3)' }}
      >
        <BadgeIcon className="w-[17px] h-[17px] text-white" strokeWidth={1.4} />
      </motion.div>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentSlide, setCurrentSlide] = useState(0)

  const goToNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    } else {
      router.push('/login')
    }
  }, [currentSlide, router])

  const goToSkip = useCallback(() => {
    router.push('/login')
  }, [router])

  const slide = slides[currentSlide]

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-white flex flex-col items-center relative overflow-hidden"
    >
      {/* Top bar — back arrow (faded) + "تخطي" skip + forward arrow */}
      <div className="w-full flex items-center justify-between px-5 pt-12 pb-4">
        {/* Back arrow */}
        <button
          onClick={() => currentSlide > 0 ? setCurrentSlide(currentSlide - 1) : router.back()}
          className={`w-9 h-9 rounded-full border-[1.2px] border-[#E2EEE6] flex items-center justify-center ${
            currentSlide === 0 ? 'opacity-30' : 'opacity-100'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6.75 4.5L11.25 9L6.75 13.5" stroke="#888888" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Skip button */}
        <button
          onClick={goToSkip}
          className="font-cairo text-[13px] leading-[20px] font-medium text-[#888888]"
        >
          تخطي
        </button>

        {/* Mode icon placeholder */}
        <div className="w-9 h-9 rounded-full border-[1.2px] border-[#E2EEE6] flex items-center justify-center">
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <rect x="2" y="2" width="13" height="13" rx="2" stroke="#888888" strokeWidth="1.275" />
          </svg>
        </div>
      </div>

      {/* MedAssist logo */}
      <div className="flex flex-col items-center mt-4">
        <div className="w-[32px] h-[32px] bg-[#16A34A] rounded-lg flex items-center justify-center">
          <Stethoscope className="w-[17px] h-[17px] text-white" strokeWidth={1.5} />
        </div>
        <span className="mt-3 font-inter text-[24px] leading-[36px] font-semibold text-[#0F172A]">
          MedAssist
        </span>
      </div>

      {/* Icon Composition */}
      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.3 }}
          >
            <IconComposition slide={slide} isActive={true} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Stat number — Figma: Cairo 58px/64px weight 900 #2DBE5C */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`stat-${currentSlide}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="mt-6 text-center"
        >
          <h2 className="font-cairo text-[58px] leading-[64px] font-black text-[#2DBE5C]">
            {slide.statLabel} {slide.stat}
          </h2>
        </motion.div>
      </AnimatePresence>

      {/* Headline — Figma: Cairo 22px/31px weight 800 #1A1A1A */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`headline-${currentSlide}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mt-2 px-10"
        >
          <h3 className="font-cairo text-[22px] leading-[31px] font-extrabold text-[#1A1A1A] text-center">
            {slide.headline}
          </h3>
        </motion.div>
      </AnimatePresence>

      {/* Subtitle — Figma: Cairo 15px/26px weight 400 #888888 */}
      <AnimatePresence mode="wait">
        <motion.p
          key={`subtitle-${currentSlide}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-2 px-16 font-cairo text-[15px] leading-[26px] text-[#888888] text-center"
        >
          {slide.subtitle}
        </motion.p>
      </AnimatePresence>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Pagination dots — Figma: 7px dots, active is 22px wide pill */}
      <div className="flex items-center justify-center gap-2 mt-5">
        {slides.map((_, i) => (
          <div
            key={i}
            className={`h-[7px] rounded-full transition-all duration-300 ${
              i === currentSlide
                ? 'w-[22px] bg-[#2DBE5C]'
                : 'w-[7px] bg-[#E0E0E0]'
            }`}
          />
        ))}
      </div>

      {/* CTA Button — Figma: #2DBE5C, rounded-full (100px), shadow-green */}
      <div className="w-full px-6 mt-5 mb-4">
        <button
          onClick={goToNext}
          className="w-full h-[54px] rounded-full font-cairo font-bold text-[17px] leading-[26px] bg-[#2DBE5C] text-white active:scale-[0.98] transition-all"
          style={{ boxShadow: '0px 6px 24px rgba(45, 190, 92, 0.3)' }}
        >
          {currentSlide < slides.length - 1 ? 'التالي' : 'ابدأ الآن'}
        </button>
      </div>

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  )
}
