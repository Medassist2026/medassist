'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

// ─── Icons ───────────────────────────────────────────────────────────────────

function StethoscopeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.8 2.62a2 2 0 0 1 1.4-.58h0a2 2 0 0 1 2 2v4.47a4.15 4.15 0 0 1-1.17 2.89l-.13.13A4.15 4.15 0 0 0 5.73 14.4v.1a3.5 3.5 0 0 0 7 0v-.1a4.15 4.15 0 0 0-1.17-2.87l-.13-.13A4.15 4.15 0 0 1 10.26 8.51V4.04a2 2 0 0 1 2-2h0a2 2 0 0 1 1.4.58" />
      <circle cx="18" cy="16" r="3" />
      <path d="M15 16v-2a4 4 0 0 0-4-4" />
      <path d="M9.23 10a4 4 0 0 1-4-4V4" />
    </svg>
  )
}

function PrescriptionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="9 16 11 18 15 14" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

// ─── Floating card (left panel illustration) ─────────────────────────────────

function FloatingCard({
  icon,
  delay,
  className,
}: {
  icon: React.ReactNode
  delay: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={`absolute bg-white rounded-2xl shadow-md border border-[#E5E7EB] flex items-center justify-center ${className}`}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{
          duration: 3.5,
          delay: delay + 0.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {icon}
      </motion.div>
    </motion.div>
  )
}

// ─── Feature rows ─────────────────────────────────────────────────────────────

const features = [
  {
    title: 'ورق لا يضيع',
    subtitle: 'روشتة رقمية — اكتبها وأرسلها للمريض مباشرة بدون طباعة',
    icon: <PrescriptionIcon className="w-5 h-5 text-[#16A34A]" />,
  },
  {
    title: '١ مكان لكل شيء',
    subtitle: 'ملفات مرضى، مواعيد، وسجلات صحية — كلها تحت إيدك',
    icon: <CalendarIcon className="w-5 h-5 text-[#16A34A]" />,
  },
  {
    title: 'أسرع ٣ مرات',
    subtitle: 'جدولة، متابعة، وتقارير — بسرعة ضعف ما اعتدت عليه',
    icon: <ChartIcon className="w-5 h-5 text-[#16A34A]" />,
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SplashPage() {
  const router = useRouter()

  return (
    <div dir="rtl" className="min-h-screen bg-white flex flex-col lg:flex-row overflow-hidden">

      {/* ══════════════════════════════════════════
          RIGHT PANEL — Brand + Features + CTA
          First child in RTL flex = renders on the RIGHT side ✓
      ══════════════════════════════════════════ */}
      <div className="flex-1 lg:w-[48%] flex flex-col items-center justify-center px-6 py-12 lg:px-14 xl:px-20 min-h-screen lg:min-h-0">

        {/* Mobile top spacer */}
        <div className="flex-1 min-h-[80px] lg:hidden" />

        {/* Brand mark */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center lg:items-start w-full max-w-sm lg:max-w-none"
        >
          <div className="w-10 h-10 bg-[#16A34A] rounded-xl flex items-center justify-center shadow-sm">
            <StethoscopeIcon className="w-5 h-5 text-white" />
          </div>
          <span className="mt-2.5 font-inter text-[20px] font-semibold text-[#0F172A]">
            MedAssist
          </span>
        </motion.div>

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2 }}
          className="mt-8 lg:mt-10 w-full max-w-sm lg:max-w-none"
        >
          <h1 className="font-cairo text-[30px] lg:text-[38px] font-bold text-[#030712] text-center lg:text-right leading-snug">
            نظّم. تابع. واطمّن.
          </h1>
          <p className="mt-3 font-cairo text-[15px] lg:text-[16px] text-[#6B7280] text-center lg:text-right leading-relaxed">
            من متابعة مرضاك إلى إدارة العيادة — كل شيء في مكان واحد.
          </p>
        </motion.div>

        {/* Feature list — desktop only */}
        <div className="hidden lg:flex flex-col gap-3 mt-10 w-full">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.4 + i * 0.12 }}
              className="flex items-start gap-4 p-4 rounded-2xl border border-[#F3F4F6] hover:border-[#DCFCE7] hover:bg-[#F9FAFB] transition-all group cursor-default"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F0FDF4] group-hover:bg-[#DCFCE7] flex items-center justify-center flex-shrink-0 transition-colors">
                {f.icon}
              </div>
              <div className="text-right">
                <p className="font-cairo font-semibold text-[#0F172A] text-[14px] leading-5">
                  {f.title}
                </p>
                <p className="font-cairo text-[13px] text-[#9CA3AF] mt-0.5 leading-5">
                  {f.subtitle}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mobile spacer */}
        <div className="flex-1 min-h-[80px] lg:hidden" />

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="w-full max-w-[360px] lg:max-w-none mt-10"
        >
          <button
            onClick={() => router.push('/login')}
            className="w-full py-[14px] rounded-[14px] font-cairo font-semibold text-[16px] bg-[#22C55E] hover:bg-[#16A34A] text-white active:scale-[0.98] transition-all shadow-sm"
          >
            ابدأ الآن
          </button>

          <div className="flex items-center justify-center gap-[5px] mt-4">
            <span className="font-cairo text-[13px] text-[#4B5563]">لديك حساب؟</span>
            <button
              onClick={() => router.push('/login')}
              className="font-cairo text-[13px] font-semibold text-[#16A34A] hover:underline"
            >
              سجّل دخولك
            </button>
          </div>
        </motion.div>

        {/* Pagination dots — mobile only */}
        <div className="flex lg:hidden items-center justify-center gap-2 mt-6 mb-2">
          <div className="w-[8px] h-[8px] rounded-full bg-[#22C55E]" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-[6px] h-[6px] rounded-full bg-[#0F172A]/15" />
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          LEFT PANEL — Animated illustration (desktop only)
          Second child in RTL flex = renders on the LEFT side ✓
      ══════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[52%] bg-gradient-to-br from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0] items-center justify-center relative overflow-hidden">

        {/* Soft background rings */}
        <div className="absolute w-[480px] h-[480px] rounded-full border border-[#16A34A]/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-[320px] h-[320px] rounded-full border border-[#16A34A]/15 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-[160px] h-[160px] rounded-full bg-[#16A34A]/8 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

        {/* Center stethoscope */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-24 h-24 bg-[#16A34A] rounded-3xl flex items-center justify-center shadow-2xl z-10"
        >
          <StethoscopeIcon className="w-12 h-12 text-white" />
        </motion.div>

        {/* Floating feature icons */}
        <FloatingCard
          delay={0.4}
          className="top-[22%] right-[18%] w-14 h-14"
          icon={<PrescriptionIcon className="w-7 h-7 text-[#16A34A]" />}
        />
        <FloatingCard
          delay={0.65}
          className="top-[18%] left-[22%] w-12 h-12"
          icon={<CalendarIcon className="w-6 h-6 text-[#16A34A]" />}
        />
        <FloatingCard
          delay={0.85}
          className="bottom-[26%] right-[12%] w-14 h-14"
          icon={<ChartIcon className="w-7 h-7 text-[#16A34A]" />}
        />
        <FloatingCard
          delay={1.05}
          className="bottom-[22%] left-[18%] w-12 h-12"
          icon={<UsersIcon className="w-6 h-6 text-[#16A34A]" />}
        />
        <FloatingCard
          delay={1.25}
          className="top-[46%] right-[6%] w-10 h-10"
          icon={<ShieldIcon className="w-5 h-5 text-[#16A34A]" />}
        />
        <FloatingCard
          delay={1.4}
          className="top-[48%] left-[6%] w-10 h-10"
          icon={<PrescriptionIcon className="w-5 h-5 text-[#16A34A]" />}
        />

        {/* Bottom label */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8, duration: 0.8 }}
          className="absolute bottom-8 text-[#15803D] font-cairo text-sm font-medium tracking-wide"
        >
          نظام إدارة عيادة متكامل
        </motion.p>
      </div>
    </div>
  )
}
