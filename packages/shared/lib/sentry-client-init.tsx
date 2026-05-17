'use client'

/**
 * Client-side Sentry initialization (L-4 / Bundle 6, 2026-05-16).
 *
 * Renders nothing. Drop one instance into each app's root layout so
 * Sentry init runs once on the browser side. Server-side init runs from
 * the per-app `instrumentation.ts` `register()` hook.
 *
 * Safe to mount even when NEXT_PUBLIC_SENTRY_DSN is unset — initSentry()
 * no-ops cleanly in that case (see packages/shared/lib/sentry.tsx).
 *
 * @see DECISIONS_LOG.md D-091
 */

import { useEffect } from 'react'
import { initSentry } from './sentry'

export function SentryInit() {
  useEffect(() => {
    initSentry()
  }, [])
  return null
}
