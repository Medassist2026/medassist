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

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn('Sentry DSN not configured. Error tracking disabled.')
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Environment
    environment: process.env.NODE_ENV,
    
    // Release tracking
    release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Session Replay (optional)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Integrations
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    
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
    beforeSend(event, hint) {
      // Don't send errors in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Sentry would capture:', event)
        return null
      }
      
      // Sanitize sensitive data
      if (event.request?.headers) {
        delete event.request.headers['Authorization']
        delete event.request.headers['Cookie']
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
// PERFORMANCE TRACKING
// ============================================================================

/**
 * Start a performance transaction
 */
export function startTransaction(
  name: string,
  op: string
) {
  const startTransactionFn = (Sentry as any).startTransaction

  if (typeof startTransactionFn === 'function') {
    return startTransactionFn({
      name,
      op,
    })
  }

  return {
    setStatus: () => undefined,
    finish: () => undefined,
  }
}

/**
 * Measure a specific operation
 */
export async function measureAsync<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const transaction = startTransaction(name, 'function')
  
  try {
    const result = await operation()
    transaction.setStatus('ok')
    return result
  } catch (error) {
    transaction.setStatus('internal_error')
    throw error
  } finally {
    transaction.finish()
  }
}

// ============================================================================
// REACT ERROR BOUNDARY
// ============================================================================

export { ErrorBoundary } from '@sentry/nextjs'

// Custom fallback component
export function ErrorFallback({ 
  error, 
  resetError 
}: { 
  error: Error
  resetError: () => void 
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Something went wrong
        </h2>
        
        <p className="text-gray-600 mb-6">
          We've been notified and are working on a fix. Please try again.
        </p>
        
        {process.env.NODE_ENV === 'development' && (
          <pre className="text-left text-xs bg-gray-100 p-3 rounded-lg mb-4 overflow-auto max-h-32">
            {error.message}
          </pre>
        )}
        
        <div className="flex gap-3 justify-center">
          <button
            onClick={resetError}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Go Home
          </button>
        </div>
        
        <p className="text-xs text-gray-400 mt-6">
          Error ID: {Math.random().toString(36).substring(7)}
        </p>
      </div>
    </div>
  )
}

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
