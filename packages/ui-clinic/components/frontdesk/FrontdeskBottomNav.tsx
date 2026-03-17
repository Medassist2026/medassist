'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, UserCheck, Calendar, Banknote, BarChart3 } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/frontdesk/dashboard', label: 'الرئيسية', icon: Home },
  { href: '/frontdesk/checkin', label: 'الوصول', icon: UserCheck },
  { href: '/frontdesk/appointments', label: 'المواعيد', icon: Calendar },
  { href: '/frontdesk/payments', label: 'المدفوعات', icon: Banknote },
  { href: '/frontdesk/reports', label: 'التقارير', icon: BarChart3 },
]

export function FrontdeskBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-[0.8px] border-[#E5E7EB] safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-14 rounded-xl transition-colors ${
                isActive
                  ? 'text-[#16A34A]'
                  : 'text-[#9CA3AF] hover:text-[#4B5563]'
              }`}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={`font-cairo text-[10px] leading-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
