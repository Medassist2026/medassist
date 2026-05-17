/**
 * Next.js instrumentation hook — runs once per server runtime boot
 * (Node and Edge separately). Initializes Sentry server-side. Mirrors
 * apps/clinic/instrumentation.ts.
 *
 * Phase L Bundle 6 (L-4, 2026-05-16). @see DECISIONS_LOG.md D-091.
 */

import { initSentry } from '@shared/lib/sentry'

export async function register(): Promise<void> {
  initSentry()
}
