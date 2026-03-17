'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { NavItem } from './Navigation'

interface MobileMenuProps {
  role: 'doctor' | 'patient' | 'frontdesk'
  items: NavItem[]
  children?: React.ReactNode
}

export function MobileMenu({ role, items, children }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
        aria-expanded={isOpen}
        aria-label="Toggle navigation menu"
      >
        <span className="text-sm font-medium">Menu</span>
        <svg
          className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          stroke="currentColor"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </button>

      {/* Mobile Menu Items */}
      {isOpen && (
        <nav className="border-t border-gray-100 bg-white pb-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-3 text-sm font-medium text-gray-700 hover:text-primary-700 hover:bg-primary-50 border-l-4 border-transparent hover:border-l-primary-500 transition-colors"
              title={item.arLabel}
              onClick={() => setIsOpen(false)}
            >
              <div className="flex items-center gap-2">
                {item.icon && <span>{item.icon}</span>}
                <div>
                  <div>{item.label}</div>
                  <div className="text-xs text-gray-500">{item.arLabel}</div>
                </div>
              </div>
            </Link>
          ))}

          {/* Extra mobile content */}
          {children && <div className="border-t border-gray-100 px-4 py-3">{children}</div>}
        </nav>
      )}
    </div>
  )
}
