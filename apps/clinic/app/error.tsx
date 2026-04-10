'use client'

/**
 * Route-level Error Boundary (Next.js App Router)
 * -------------------------------------------------
 * Catches rendering, lifecycle, and data-fetch errors within any nested
 * route segment under apps/clinic/app/*. Renders an Arabic-RTL fallback
 * and lets the user retry via `reset()`.
 *
 * This MUST be a Client Component — Next.js requires it.
 */

import { useEffect } from 'react'
import { captureError } from '@shared/lib/sentry'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Report to Sentry (no-op when Sentry is disabled)
  useEffect(() => {
    try {
      captureError(error, {
        digest: error.digest,
        scope: 'route-error-boundary',
      })
    } catch {
      // swallow — we never want the boundary itself to crash
    }
  }, [error])

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-[#F9FAFB] px-4 py-8"
    >
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-6 text-center">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FEF2F2] flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[#DC2626]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="font-cairo text-[18px] font-bold text-[#030712] mb-2">
          حدث خطأ غير متوقع
        </h1>
        <p className="font-cairo text-[14px] text-[#4B5563] mb-5 leading-[22px]">
          عذراً، واجهنا مشكلة أثناء عرض هذه الصفحة. يمكنك المحاولة مرة أخرى
          أو العودة إلى الصفحة الرئيسية.
        </p>

        {/* Error digest (dev/debug aid) */}
        {error.digest && (
          <p className="font-mono text-[11px] text-[#9CA3AF] mb-4 break-all" dir="ltr">
            #{error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => reset()}
            className="w-full h-[44px] rounded-[12px] bg-[#16A34A] hover:bg-[#15803D] text-white font-cairo text-[14px] font-semibold transition-colors"
          >
            إعادة المحاولة
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/'
              }
            }}
            className="w-full h-[44px] rounded-[12px] border border-[#E5E7EB] bg-white text-[#4B5563] font-cairo text-[14px] font-medium hover:bg-[#F9FAFB] transition-colors"
          >
            العودة إلى الرئيسية
          </button>
        </div>
      </div>
    </div>
  )
}
