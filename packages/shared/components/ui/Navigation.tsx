import Link from 'next/link'
import { MobileMenu } from './MobileMenu'
import { Logo } from './Logo'

export interface NavItem {
  href: string
  label: string
  arLabel: string
  icon?: React.ReactNode
}

export interface NavigationProps {
  role: 'doctor' | 'patient' | 'frontdesk'
  items: NavItem[]
  userName?: string
  userSubtitle?: string
  rightContent?: React.ReactNode
  children?: React.ReactNode
}

const roleDashboards = {
  doctor: '/doctor/dashboard',
  patient: '/patient/dashboard',
  frontdesk: '/frontdesk/dashboard',
}

export async function Navigation({
  role,
  items,
  userName,
  userSubtitle,
  rightContent,
  children,
}: NavigationProps) {
  const dashboardHref = roleDashboards[role]

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Desktop Nav */}
          <div className="flex items-center gap-8">
            <Logo href={dashboardHref} size="sm" />

            {/* Desktop Navigation */}
            <nav className="hidden md:flex gap-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-gray-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-2 rounded-lg transition-colors group relative"
                  title={item.arLabel}
                >
                  {item.icon ? (
                    <span className="flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </span>
                  ) : (
                    item.label
                  )}
                  <span className="absolute -bottom-8 left-0 invisible group-hover:visible bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50">
                    {item.arLabel}
                  </span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side: Right Content, User Info, Logout */}
          <div className="flex items-center gap-3">

            {/* Right Content (e.g., Clinic Selector) */}
            {rightContent && <div className="hidden sm:block">{rightContent}</div>}

            {/* User Info */}
            {(userName || userSubtitle) && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {userName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                </div>
                <div className="text-right">
                  {userName && <p className="text-sm font-medium text-gray-900 leading-tight">{userName}</p>}
                  {userSubtitle && <p className="text-xs text-gray-500 capitalize">{userSubtitle}</p>}
                </div>
              </div>
            )}

            {/* Logout Form */}
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
                title="Sign Out"
              >
                Logout
              </button>
            </form>
          </div>
        </div>

        {/* Mobile Menu - only render on mobile */}
        <MobileMenu role={role} items={items}>
          {children}
        </MobileMenu>
      </div>
    </header>
  )
}
