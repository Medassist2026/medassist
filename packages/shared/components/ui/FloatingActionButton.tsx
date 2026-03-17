'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, CalendarPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * FloatingActionButton — Matches Figma FAB design.
 *
 * Figma specs:
 * - FAB: 56x56, bg #16A34A, shadow 0px 4px 12px rgba(0,0,0,0.15), rounded-full
 * - Plus icon: 28x28, white, 2.9px stroke
 *
 * Expanded actions (Figma right screen):
 * - Each action: green circular icon (48x48, #16A34A, shadow, rounded-24px) + label chip
 * - Label chip: bg #F3F4F6, border 0.8px #E5E7EB, shadow, rounded-8px, Cairo 14px/21px #030712
 * - "جلسة جديدة" with FileText icon
 * - "إضافة موعد" with CalendarPlus icon
 */

export function FloatingActionButton() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const actions = [
    {
      label: 'جلسة جديدة',
      icon: <FileText className="w-5 h-5 text-white" strokeWidth={1.67} />,
      action: () => router.push('/doctor/session'),
    },
    {
      label: 'إضافة موعد',
      icon: <CalendarPlus className="w-5 h-5 text-white" strokeWidth={1.67} />,
      action: () => router.push('/doctor/appointments/new'),
    },
  ]

  return (
    <div className="relative">
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Action items — Figma: green circle + label chip, right-aligned */}
      <AnimatePresence>
        {isOpen && (
          <div className="absolute bottom-16 left-1/2 z-50 flex flex-col gap-4 items-end mb-4" style={{ transform: 'translateX(-50%)' }}>
            {actions.map((action, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.8 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
                dir="rtl"
              >
                {/* Green circular icon — 48x48, #16A34A, shadow */}
                <button
                  onClick={() => { setIsOpen(false); action.action() }}
                  className="w-12 h-12 rounded-3xl bg-[#16A34A] flex items-center justify-center flex-shrink-0"
                  style={{ boxShadow: '0px 4px 12px rgba(22, 163, 74, 0.3)' }}
                >
                  {action.icon}
                </button>

                {/* Label chip — Figma: bg #F3F4F6, border #E5E7EB, shadow, rounded-8px */}
                <button
                  onClick={() => { setIsOpen(false); action.action() }}
                  className="bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg px-4 py-2.5 whitespace-nowrap"
                  style={{ boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)' }}
                >
                  <span className="font-cairo text-[14px] leading-[21px] font-medium text-[#030712]">
                    {action.label}
                  </span>
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* FAB Button — Figma: 56x56, #16A34A, shadow, Plus 28px */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-[#16A34A] text-white flex items-center justify-center transition-all -mt-6"
        style={{ boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)' }}
      >
        <Plus
          className={`w-7 h-7 transition-transform ${isOpen ? 'rotate-45' : ''}`}
          strokeWidth={2.9}
        />
      </button>
    </div>
  )
}
