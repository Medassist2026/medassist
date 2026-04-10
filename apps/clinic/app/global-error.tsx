'use client'

/**
 * Root-level Global Error Boundary (Next.js App Router)
 * ------------------------------------------------------
 * Catches errors that propagate out of the root layout itself — i.e.
 * cases that `error.tsx` cannot recover from because the layout
 * rendered incorrectly. This component MUST render its own <html> and
 * <body> tags because it replaces the root layout entirely.
 *
 * Keep it dependency-light: no shared layouts, no providers, no
 * client-side data fetching. Inline styles are used so we don't depend
 * on global CSS being available at this point.
 */

import { useEffect } from 'react'
import { captureError } from '@shared/lib/sentry'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    try {
      captureError(error, {
        digest: error.digest,
        scope: 'global-error-boundary',
      })
    } catch {
      // boundary must never throw
    }
  }, [error])

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F9FAFB',
          fontFamily: 'Cairo, "Noto Sans Arabic", system-ui, sans-serif',
          padding: '16px',
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 16px',
              borderRadius: '9999px',
              backgroundColor: '#FEF2F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              color: '#DC2626',
            }}
          >
            ⚠️
          </div>

          <h1
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#030712',
              margin: '0 0 8px',
            }}
          >
            حدث خطأ في التطبيق
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#4B5563',
              margin: '0 0 20px',
              lineHeight: '22px',
            }}
          >
            عذراً، حدث خطأ غير متوقع. يرجى إعادة تحميل الصفحة أو المحاولة لاحقاً.
          </p>

          {error.digest && (
            <p
              dir="ltr"
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#9CA3AF',
                margin: '0 0 16px',
                wordBreak: 'break-all',
              }}
            >
              #{error.digest}
            </p>
          )}

          <button
            onClick={() => reset()}
            style={{
              width: '100%',
              height: '44px',
              border: 'none',
              borderRadius: '12px',
              backgroundColor: '#16A34A',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            إعادة المحاولة
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/'
              }
            }}
            style={{
              width: '100%',
              height: '44px',
              border: '1px solid #E5E7EB',
              borderRadius: '12px',
              backgroundColor: '#FFFFFF',
              color: '#4B5563',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            العودة إلى الرئيسية
          </button>
        </div>
      </body>
    </html>
  )
}
