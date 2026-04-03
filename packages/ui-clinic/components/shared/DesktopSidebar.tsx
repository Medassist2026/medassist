'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Users,
  Calendar,
  MessageSquare,
  FileText,
  UserCog,
  Settings,
  LogOut,
  UserCheck,
  Banknote,
  BarChart3,
  Stethoscope,
} from 'lucide-react'

export type SidebarRole = 'doctor' | 'frontdesk'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const doctorNav: NavItem[] = [
  { label: 'لوحة التحكم', href: '/doctor/dashboard', icon: LayoutDashboard },
  { label: 'المرضى', href: '/doctor/patients', icon: Users },
  { label: 'المواعيد', href: '/doctor/schedule', icon: Calendar },
  { label: 'الرسائل', href: '/doctor/messages', icon: MessageSquare },
  { label: 'الوصفات', href: '/doctor/prescription', icon: FileText },
  { label: 'الملف الشخصي', href: '/doctor/profile', icon: UserCog },
  { label: 'إعدادات العيادة', href: '/doctor/clinic-settings', icon: Settings },
]

const frontdeskNav: NavItem[] = [
  { label: 'الرئيسية', href: '/frontdesk/dashboard', icon: LayoutDashboard },
  { label: 'تسجيل الوصول', href: '/frontdesk/patients/register', icon: UserCheck },
  { label: 'المواعيد', href: '/frontdesk/appointments', icon: Calendar },
  { label: 'المدفوعات', href: '/frontdesk/payments', icon: Banknote },
  { label: 'التقارير', href: '/frontdesk/reports', icon: BarChart3 },
]

interface DesktopSidebarProps {
  role: SidebarRole
  userName?: string
  clinicName?: string
}

export function DesktopSidebar({ role, userName, clinicName }: DesktopSidebarProps) {
  const pathname = usePathname()
  const navItems = role === 'doctor' ? doctorNav : frontdeskNav
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (role !== 'doctor') return
    let cancelled = false

    async function fetchUnread() {
      try {
        const res = await fetch('/api/doctor/messages/unread-count')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setUnreadCount(data.total_unread || 0)
      } catch { /* silent */ }
    }

    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [role])

  return (
    <aside
      dir="rtl"
      className="hidden lg:flex flex-col fixed right-0 top-0 h-screen w-[260px] bg-white border-l border-[#E5E7EB] z-40"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#E5E7EB]">
        <div className="w-[36px] h-[36px] bg-[#16A34A] rounded-lg flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-[20px] h-[20px] text-white" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-inter text-[16px] font-semibold text-[#030712]">MedAssist</span>
          {clinicName && (
            <span className="font-cairo text-[12px] text-[#6B7280] truncate">{clinicName}</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-[14px] font-cairo font-medium ${
                    isActive
                      ? 'bg-[#F0FDF4] text-[#16A34A]'
                      : 'text-[#4B5563] hover:bg-[#F9FAFB] hover:text-[#030712]'
                  }`}
                >
                  <Icon className="w-[20px] h-[20px] flex-shrink-0" strokeWidth={1.8} />
                  <span className="flex-1">{item.label}</span>
                  {item.href === '/doctor/messages' && unreadCount > 0 && !isActive && (
                    <span className="min-w-[20px] h-[20px] bg-[#EF4444] text-white font-cairo text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User info at bottom */}
      <div className="border-t border-[#E5E7EB] px-4 py-4">
        {userName && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-[36px] h-[36px] rounded-full bg-[#F1F5F9] flex items-center justify-center flex-shrink-0">
              <svg className="w-[18px] h-[18px] text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-cairo text-[13px] font-semibold text-[#030712] truncate">
                {userName}
              </span>
              <span className="font-cairo text-[11px] text-[#6B7280]">
                {role === 'doctor' ? 'طبيب' : 'استقبال'}
              </span>
            </div>
          </div>
        )}
        <Link
          href="/login"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-cairo text-[#DC2626] hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-[16px] h-[16px]" strokeWidth={1.8} />
          <span>تسجيل الخروج</span>
        </Link>
      </div>
    </aside>
  )
}
