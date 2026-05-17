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
 *
 * Mirrors apps/clinic/app/global-error.tsx. Phase L Bundle 6 (L-4,
 * 2026-05-16).
 */

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // L-4 / Bundle 6 (2026-05-16): forward to Sentry alongside console logging.
  // captureException is a no-op when Sentry was never initialized (DSN unset).
  // global-error replaces the root layout itself so the SentryInit component
  // is not mounted — initSentry runs via instrumentation.ts on the server
  // and via the layout-bound SentryInit on every other route; this boundary
  // only fires when the layout itself failed, so the server-side init is
  // the load-bearing path here.
  useEffect(() => {
    console.error('[GlobalError]', error.message, error.digest)
    Sentry.withScope((scope) => {
      scope.setTag('error_boundary', 'global')
      scope.setTag('app', 'patient')
      if (error.digest) scope.setExtra('next_digest', error.digest)
      Sentry.captureException(error)
    })
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
              backgroundColor: '#2DBE5C',
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
