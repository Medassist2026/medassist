'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, UserPlus, Calendar, CreditCard, BarChart2 } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/frontdesk/dashboard', label: 'الرئيسية', icon: Home },
  { href: '/frontdesk/checkin', label: 'تسجيل وصول', icon: UserPlus },
  { href: '/frontdesk/appointments', label: 'المواعيد', icon: Calendar },
  { href: '/frontdesk/payments', label: 'المدفوعات', icon: CreditCard },
  { href: '/frontdesk/reports', label: 'التقارير', icon: BarChart2 },
]

export function FrontdeskBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#E5E7EB] h-[60px]">
      <div className="flex items-center justify-around h-full max-w-md mx-auto pb-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] ${
                isActive ? 'text-[#16A34A]' : 'text-[#9CA3AF]'
              }`}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span
                className={`font-cairo text-[10px] leading-tight ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
