'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ar } from '@shared/lib/i18n/ar'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  userName?: string
  userSpecialty?: string
  clinicName?: string
}

export function SettingsDrawer({ isOpen, onClose, userName, userSpecialty, clinicName }: SettingsDrawerProps) {
  const router = useRouter()
  const [darkMode, setDarkMode] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [stats, setStats] = useState<{ totalPatients: number; totalSessions: number; totalFees: number } | null>(null)

  // Fetch stats when drawer opens
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/doctor/stats').then(r => r.json()).then(data => {
      if (data.success) setStats(data.stats)
    }).catch(() => {})
  }, [isOpen])

  const menuItems = [
    {
      label: ar.profileSettings,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
      action: () => router.push('/doctor/profile'),
    },
    {
      label: ar.myClinic,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
        </svg>
      ),
      action: () => router.push('/doctor/clinics'),
    },
    {
      label: ar.assistants,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
      action: () => router.push('/doctor/clinic-settings/staff'),
    },
  ]

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    } catch {
      // Fallback
      window.location.href = '/'
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        dir="rtl"
        className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-white z-50 shadow-2xl animate-slide-in-right"
      >
        {/* Header */}
        <div className="p-5 bg-[#16A34A] text-white">
          <button onClick={onClose} className="absolute top-4 left-4 text-white/80 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-3 mt-2">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center font-cairo text-[20px] font-bold">
              {userName?.charAt(0) || 'د'}
            </div>
            <div>
              <div className="font-cairo font-bold text-[16px]">د. {userName || 'طبيب'}</div>
              {userSpecialty && <div className="font-cairo text-[13px] text-white/80">{userSpecialty}</div>}
              {clinicName && <div className="font-cairo text-[11px] text-white/60 mt-0.5">{clinicName}</div>}
            </div>
          </div>

          {/* Stats row */}
          {stats && (
            <div className="flex gap-3 mt-4">
              <div className="flex-1 bg-white/15 rounded-[10px] px-3 py-2 text-center">
                <div className="font-cairo text-[18px] font-bold">{stats.totalPatients}</div>
                <div className="font-cairo text-[10px] text-white/70">مريض</div>
              </div>
              <div className="flex-1 bg-white/15 rounded-[10px] px-3 py-2 text-center">
                <div className="font-cairo text-[18px] font-bold">{stats.totalSessions}</div>
                <div className="font-cairo text-[10px] text-white/70">جلسة</div>
              </div>
              {stats.totalFees > 0 && (
                <div className="flex-1 bg-white/15 rounded-[10px] px-3 py-2 text-center">
                  <div className="font-cairo text-[16px] font-bold">{stats.totalFees.toLocaleString('ar-EG')}</div>
                  <div className="font-cairo text-[10px] text-white/70">ج.م</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Menu Items */}
        <div className="p-4 space-y-1">
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                onClose()
                item.action()
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors text-right"
            >
              <span className="text-gray-400">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}

          {/* Divider */}
          <div className="border-t border-gray-100 my-3" />

          {/* Language */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{ar.languageLabel}</span>
            </div>
            <span className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-lg font-medium">عربي</span>
          </div>

          {/* Dark Mode */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{ar.darkMode}</span>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-11 h-6 rounded-full transition-colors ${darkMode ? 'bg-primary-600' : 'bg-gray-200'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${darkMode ? '-translate-x-5' : '-translate-x-0.5'}`} />
            </button>
          </div>

          {/* Privacy Policy */}
          <Link href="/privacy" className="w-full flex items-center gap-3 px-4 py-3.5 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors text-right">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <span className="text-sm font-medium">{ar.privacyPolicy}</span>
          </Link>

          {/* Terms of Service */}
          <Link href="/terms" className="w-full flex items-center gap-3 px-4 py-3.5 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors text-right">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-sm font-medium">شروط الاستخدام</span>
          </Link>

          {/* Divider */}
          <div className="border-t border-gray-100 my-3" />

          {/* Logout */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors text-right"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            <span className="text-sm font-medium">{ar.signOut}</span>
          </button>
        </div>

        {/* Logout Confirmation Dialog */}
        {showLogoutConfirm && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center p-6">
            <div className="bg-white rounded-[16px] shadow-xl p-5 w-full max-w-[280px]" dir="rtl">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </div>
              <h3 className="font-cairo text-[16px] font-bold text-[#030712] text-center mb-1">
                تسجيل الخروج
              </h3>
              <p className="font-cairo text-[13px] text-[#6B7280] text-center mb-1">
                هل أنت متأكد من تسجيل الخروج؟
              </p>
              {userName && (
                <p className="font-cairo text-[13px] font-semibold text-[#16A34A] text-center mb-4">
                  د. {userName}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleLogout}
                  className="flex-1 h-[40px] bg-[#DC2626] hover:bg-[#B91C1C] text-white font-cairo text-[13px] font-semibold rounded-[10px] transition-colors"
                >
                  تسجيل الخروج
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 h-[40px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-cairo text-[13px] font-medium rounded-[10px] transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
