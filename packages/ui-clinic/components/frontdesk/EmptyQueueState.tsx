'use client'

import { Stethoscope, CheckCircle2 } from 'lucide-react'

type EmptyVariant = 'no_doctors' | 'no_patients' | 'loading'

interface EmptyQueueStateProps {
  variant: EmptyVariant
  onCheckIn?: () => void
}

export function EmptyQueueState({ variant, onCheckIn }: EmptyQueueStateProps) {
  if (variant === 'loading') {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[88px] rounded-[12px] bg-[#E5E7EB] animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (variant === 'no_doctors') {
    return (
      <div className="text-center py-10">
        <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center mx-auto mb-3">
          <Stethoscope className="w-12 h-12 text-[#9CA3AF]" />
        </div>
        <p className="font-cairo text-[16px] font-bold text-[#030712] mb-1">
          العيادة لسه فاتحة
        </p>
        <p className="font-cairo text-[13px] text-[#9CA3AF] mb-4">
          ابدأ بتسجيل وصول أول مريض
        </p>
        {onCheckIn && (
          <button
            onClick={onCheckIn}
            className="w-full h-[44px] rounded-[12px] bg-[#16A34A] text-white font-cairo text-[15px] font-bold"
          >
            تسجيل وصول مريض
          </button>
        )}
      </div>
    )
  }

  // no_patients
  return (
    <div className="text-center py-10">
      <div className="w-16 h-16 rounded-full bg-[#F0FDF4] flex items-center justify-center mx-auto mb-3">
        <CheckCircle2 className="w-12 h-12 text-[#16A34A]" />
      </div>
      <p className="font-cairo text-[16px] font-bold text-[#030712] mb-1">
        مفيش مرضى في الانتظار
      </p>
      <p className="font-cairo text-[13px] text-[#9CA3AF]">
        قائمة الانتظار فاضية دلوقتي
      </p>
    </div>
  )
}
