'use client'

/**
 * useApiPath — B07 Phase F.5.
 *
 * Returns a memoized function that appends `?gpId=<id>` to an API path
 * when the active AccountContext is non-self (guardian or delegated).
 * For self context, returns the path unchanged.
 *
 * Pairs with `resolvePatientContext` on the server: the helper reads
 * `?gpId=` and routes the request to the cross-context resolution path;
 * its absence means self.
 *
 * Usage:
 *   const apiPath = useApiPath()
 *   const res = await fetch(apiPath('/api/patient/health-summary'))
 *   // self        → '/api/patient/health-summary'
 *   // cross-ctx   → '/api/patient/health-summary?gpId=<uuid>'
 *
 * Existing query strings are respected:
 *   apiPath('/api/patient/sharing?include_expired=true')
 *   // → '/api/patient/sharing?include_expired=true&gpId=<uuid>'
 *
 * The returned function is stable across re-renders whenever the active
 * context's identity hasn't changed — safe to include in `useCallback`
 * dependency arrays.
 */

import { useCallback } from 'react'
import { useAccountSwitcher } from '@patient/lib/contexts/account-context'

export function useApiPath(): (path: string) => string {
  const { active } = useAccountSwitcher()

  const activeGpId =
    active.kind !== 'self' && 'gpId' in active ? active.gpId : null

  return useCallback(
    (path: string): string => {
      if (!activeGpId) return path
      const separator = path.includes('?') ? '&' : '?'
      return `${path}${separator}gpId=${activeGpId}`
    },
    [activeGpId]
  )
}
