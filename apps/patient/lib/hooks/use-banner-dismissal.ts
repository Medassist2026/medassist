'use client'

/**
 * use-banner-dismissal — B07 Phase F (Section 2, Mo ruling 22).
 *
 * Per-context "don't show again" state for the CaregiverBanner. Uses
 * sessionStorage (NOT localStorage) per Mo ruling 22: dismissal is a
 * per-session courtesy, not a permanent preference. The banner reappears on
 * next sign-in / new tab. This is intentional — a recurring reminder when
 * acting on someone else's account is a safety affordance.
 *
 * Storage key: `medassist:banner-dismissed:<gpId>`. Logout clears
 * sessionStorage automatically (browser session boundary).
 */

import { useCallback, useEffect, useState } from 'react'

const KEY_PREFIX = 'medassist:banner-dismissed:'

export function useBannerDismissal(contextKey: string | null): {
  dismissed: boolean
  dismiss: () => void
} {
  const storageKey = contextKey ? `${KEY_PREFIX}${contextKey}` : null
  const [dismissed, setDismissed] = useState(false)

  // Hydration: check sessionStorage on mount (avoids SSR/CSR mismatch)
  useEffect(() => {
    if (!storageKey) {
      setDismissed(false)
      return
    }
    if (typeof window === 'undefined') return
    try {
      const v = window.sessionStorage.getItem(storageKey)
      setDismissed(v === '1')
    } catch {
      // Private mode / disabled storage — silently treat as not-dismissed
      setDismissed(false)
    }
  }, [storageKey])

  const dismiss = useCallback(() => {
    setDismissed(true)
    if (!storageKey) return
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
  }, [storageKey])

  return { dismissed, dismiss }
}
