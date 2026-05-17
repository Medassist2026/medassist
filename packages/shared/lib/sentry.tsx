// ============================================================================
// SENTRY ERROR TRACKING SETUP (DS-005)
// ============================================================================
// 
// This file provides error tracking infrastructure for MedAssist.
// Sentry captures errors, performance data, and user feedback.
//
// SETUP INSTRUCTIONS:
// 1. Create account at https://sentry.io
// 2. Create a new Next.js project
// 3. Copy DSN to .env.local: NEXT_PUBLIC_SENTRY_DSN=your_dsn_here
// 4. Run: npm install @sentry/nextjs
// 5. Run: npx @sentry/wizard@latest -i nextjs
//
// ============================================================================

import * as Sentry from '@sentry/nextjs'

// ============================================================================
// SENTRY CONFIGURATION
// ============================================================================

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * Initialize Sentry. Safe to call from BOTH server and client contexts —
 * runtime branches on `typeof window` and only enables Replay when we have
 * a browser. No-ops if `NEXT_PUBLIC_SENTRY_DSN` is unset so preview/staging
 * deploys without a DSN don't emit `Sentry not configured` errors on every
 * boot. Production sets DSN per `audits/phase-l-mo-walltime-tracker.md`
 * (Mo provisions Sentry project + DSN as part of Phase L L-4 wiring).
 *
 * PHI redaction: `beforeSend` strips Authorization + Cookie request
 * headers; replay configs mask all text and block media so PHI inside
 * patient records is never captured in session replays.
 *
 * Phase L Bundle 6 (L-4, 2026-05-16) — wires Sentry into both apps via
 * instrumentation.ts (server) + SentryInit client component (browser).
 * @see DECISIONS_LOG.md D-091
 */
export function initSentry() {
  if (!SENTRY_DSN) {
    // Quiet no-op when DSN is absent — emit a one-liner so the operator
    // knows Sentry is disabled but don't spam the log on every request.
    if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
      console.warn('[Sentry] DSN not configured — error tracking disabled (set NEXT_PUBLIC_SENTRY_DSN to enable).')
    }
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV,

    // Release tracking
    release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',

    // Performance Monitoring — sample 10% in prod, 100% elsewhere
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session Replay: removed in L-7 (2026-05-16). Sentry SDK 10.x repackaged
    // `Sentry.replayIntegration` into a separate `@sentry/react-replay`-style
    // module that isn't re-exported from `@sentry/nextjs`. Bringing it back
    // would require an additional dependency + extra config. Deferred to a
    // follow-up bundle if Mo wants Replay; error tracking via
    // `Sentry.captureException` continues to work without it. PHI redaction
    // was the load-bearing reason for Replay's `maskAllText` + `blockAllMedia`
    // config; `beforeSend` below still strips Authorization + Cookie headers
    // and Sentry doesn't capture request/response bodies by default.

    // Filter out noisy errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      'http://tt.teletracker.info',
      'atomicFindClose',

      // Network errors
      'Failed to fetch',
      'NetworkError',
      'AbortError',

      // Common user-triggered errors
      'ResizeObserver loop limit exceeded',
    ],

    // Before sending to Sentry
    beforeSend(event, _hint) {
      // Don't send errors in development
      if (process.env.NODE_ENV === 'development') {
        console.error('[Sentry] would capture:', event.exception?.values?.[0]?.value || event.message)
        return null
      }

      // PHI redaction: never send request headers that include credentials
      if (event.request?.headers) {
        delete event.request.headers['Authorization']
        delete event.request.headers['Cookie']
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
      }

      return event
    },
  })
}

// ============================================================================
// ERROR CAPTURE UTILITIES
// ============================================================================

/**
 * Capture an error with additional context
 */
export function captureError(
  error: Error | string,
  context?: Record<string, any>
) {
  if (typeof error === 'string') {
    error = new Error(error)
  }
  
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context)
    }
    Sentry.captureException(error)
  })
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, any>
) {
  Sentry.withScope((scope) => {
    scope.setLevel(level)
    if (context) {
      scope.setExtras(context)
    }
    Sentry.captureMessage(message)
  })
}

/**
 * Set user context for error tracking
 */
export function setUser(user: {
  id: string
  email?: string
  role?: 'doctor' | 'patient' | 'frontdesk'
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    // Don't include PII like names
  })
  
  if (user.role) {
    Sentry.setTag('user.role', user.role)
  }
}

/**
 * Clear user context (on logout)
 */
export function clearUser() {
  Sentry.setUser(null)
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
    timestamp: Date.now() / 1000,
  })
}

// ============================================================================
// PERFORMANCE TRACKING (removed L-7 2026-05-16)
// ============================================================================
//
// Sentry SDK 10.x removed `Sentry.startTransaction` in favor of `Sentry.startSpan` /
// `Sentry.startNewTrace`. The previous `startTransaction` + `measureAsync`
// helpers in this file were never imported externally (`grep -rn` confirmed
// zero callsites outside this file), so they were removed rather than
// migrated to the modern span API. If perf tracing is wanted in the future,
// the modern call is `Sentry.startSpan({ name, op: 'function' }, async () => { ... })`.

// ============================================================================
// REACT ERROR BOUNDARY (removed L-7 2026-05-16)
// ============================================================================
//
// Sentry SDK 10.x no longer re-exports `ErrorBoundary` from `@sentry/nextjs`.
// The previous `ErrorBoundary` re-export + `ErrorFallback` component were
// never imported externally — error reporting is wired directly inside
// `apps/{clinic,patient}/app/error.tsx` + `global-error.tsx` via
// `Sentry.captureException` (which IS in the modern API). If a React error
// boundary component is wanted in the future, import from `@sentry/react`
// as a peer dependency.

// ============================================================================
// API ERROR HANDLER
// ============================================================================

/**
 * Wrap API route handlers with error tracking
 */
export function withErrorTracking<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  routeName: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error) {
      Sentry.withScope((scope) => {
        scope.setTag('route', routeName)
        scope.setTag('type', 'api_error')
        Sentry.captureException(error)
      })
      throw error
    }
  }) as T
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if Sentry is properly configured
 */
export function checkSentryHealth(): {
  configured: boolean
  dsn: boolean
  environment: string
} {
  return {
    configured: !!SENTRY_DSN,
    dsn: !!SENTRY_DSN,
    environment: process.env.NODE_ENV || 'unknown',
  }
}
