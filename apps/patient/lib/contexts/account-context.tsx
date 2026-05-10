'use client'

/**
 * AccountContext — B07 Phase F (Section 1: account switcher infrastructure).
 *
 * Tracks the active patient context for the patient-app shell. Three context
 * shapes:
 *   - 'self'              : the authenticated user's own gp
 *   - 'guardian_of_minor' : a minor the user is guardian of (Pattern A)
 *   - 'delegated'         : an adult who delegated authority to the user
 *                           (Pattern B, accepted only — pending grants are
 *                           NOT switchable contexts)
 *
 * Active context is sourced from the URL query param `?as=<gpId>` (Phase F
 * decision: URL-as-source-of-truth so refresh + share-link preserve context).
 * Missing/invalid `?as=` defaults to 'self'.
 *
 * Mo ruling 21 (UI ruling 1): switcher is a persistent header element. This
 * provider feeds it; the AccountSwitcher component reads it.
 *
 * Architecture note: existing patient-app API endpoints resolve subject via
 * auth.uid() only and IGNORE any `?as=` param. Phase F UI threads the param
 * through to the URL and provider, but cross-context data fetching is
 * deferred to Phase F.5 (Phase F finding #1: API extensions).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the Phase E API response shapes
// ──────────────────────────────────────────────────────────────────────────

interface MinorGpRow {
  id: string
  display_name: string | null
  date_of_birth: string | null
  sex: string | null
  preferred_language: string
  is_minor: boolean
  guardian_global_patient_id: string | null
}

interface ReceivedDelegationRow {
  id: string
  principal_global_patient_id: string
  principal_display_name: string | null
  capabilities: string[]
  expires_at: string | null
  accepted_at: string | null
  revoked_at: string | null
}

export type AccountKind = 'self' | 'guardian_of_minor' | 'delegated'

export interface AccountSelfContext {
  kind: 'self'
  /** Display name from server-side getPatientProfile or fallback. */
  displayName: string
}

export interface AccountGuardianContext {
  kind: 'guardian_of_minor'
  gpId: string
  displayName: string
  dateOfBirth: string | null
  sex: string | null
}

export interface AccountDelegatedContext {
  kind: 'delegated'
  gpId: string
  displayName: string
  delegationId: string
  capabilities: string[]
  expiresAt: string | null
}

export type AccountContext =
  | AccountSelfContext
  | AccountGuardianContext
  | AccountDelegatedContext

// ──────────────────────────────────────────────────────────────────────────
// Context value
// ──────────────────────────────────────────────────────────────────────────

interface AccountContextValue {
  /** Currently active context per `?as=` URL param. Defaults to 'self'. */
  active: AccountContext
  /** All contexts the user has authority over. Always includes 'self'. */
  available: AccountContext[]
  /** True while initial fetch in flight. UI shows skeleton. */
  loading: boolean
  /** Last fetch error (network etc.). Falsy if all good. */
  error: string | null
  /** Pending received delegations (count > 0 surfaces a notification). */
  pendingReceivedCount: number
  /** Switch active context. `null` switches to self (drops `?as` param). */
  switchTo: (gpId: string | null) => void
  /** Force a refetch — used after registering a dependent etc. */
  refetch: () => Promise<void>
}

const Ctx = createContext<AccountContextValue | null>(null)

// ──────────────────────────────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────────────────────────────

export function useActiveAccount(): AccountContext {
  const v = useContext(Ctx)
  if (!v) {
    // Defensive default — pages outside the provider get 'self' with empty
    // name. Keeps server-side renders + non-patient pages from crashing.
    return { kind: 'self', displayName: '' }
  }
  return v.active
}

export function useAvailableAccounts(): AccountContext[] {
  const v = useContext(Ctx)
  return v?.available ?? []
}

export function useAccountSwitcher(): {
  active: AccountContext
  available: AccountContext[]
  loading: boolean
  error: string | null
  pendingReceivedCount: number
  switchTo: (gpId: string | null) => void
  refetch: () => Promise<void>
} {
  const v = useContext(Ctx)
  if (!v) {
    return {
      active: { kind: 'self', displayName: '' },
      available: [],
      loading: false,
      error: null,
      pendingReceivedCount: 0,
      switchTo: () => {},
      refetch: async () => {},
    }
  }
  return v
}

// ──────────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────────

interface AccountProviderProps {
  /**
   * Display name for the self context — sourced server-side from
   * getPatientProfile's full_name, with phone as fallback.
   */
  selfDisplayName: string
  children: React.ReactNode
}

export function AccountProvider({
  selfDisplayName,
  children,
}: AccountProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [dependents, setDependents] = useState<MinorGpRow[]>([])
  const [received, setReceived] = useState<ReceivedDelegationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setError(null)
    try {
      const [depRes, recRes] = await Promise.all([
        fetch('/api/patient/dependents', { cache: 'no-store' }),
        fetch('/api/patient/delegations/received', { cache: 'no-store' }),
      ])

      if (depRes.ok) {
        const json = await depRes.json()
        setDependents(Array.isArray(json?.dependents) ? json.dependents : [])
      }

      if (recRes.ok) {
        const json = await recRes.json()
        setReceived(Array.isArray(json?.delegations) ? json.delegations : [])
      }
    } catch (err) {
      console.error('[AccountProvider] fetch failed:', err)
      setError('فشل تحميل قائمة الحسابات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  // ───────────────────────────────────────────────────────────────────────
  // Compute available + active contexts
  // ───────────────────────────────────────────────────────────────────────

  const available: AccountContext[] = useMemo(() => {
    const list: AccountContext[] = [
      { kind: 'self', displayName: selfDisplayName },
    ]
    for (const dep of dependents) {
      list.push({
        kind: 'guardian_of_minor',
        gpId: dep.id,
        displayName: dep.display_name ?? 'بدون اسم',
        dateOfBirth: dep.date_of_birth,
        sex: dep.sex,
      })
    }
    for (const rec of received) {
      // Only ACCEPTED + non-revoked + non-expired delegations grant a
      // switchable context. Pending grants surface as a notification, not
      // as a switchable account.
      if (!rec.accepted_at) continue
      if (rec.revoked_at) continue
      if (rec.expires_at && new Date(rec.expires_at).getTime() < Date.now()) {
        continue
      }
      list.push({
        kind: 'delegated',
        gpId: rec.principal_global_patient_id,
        displayName: rec.principal_display_name ?? 'بدون اسم',
        delegationId: rec.id,
        capabilities: Array.isArray(rec.capabilities) ? rec.capabilities : [],
        expiresAt: rec.expires_at,
      })
    }
    return list
  }, [dependents, received, selfDisplayName])

  const asParam = searchParams.get('as')
  const active: AccountContext = useMemo(() => {
    if (!asParam) {
      return { kind: 'self', displayName: selfDisplayName }
    }
    const found = available.find(
      (acc) => acc.kind !== 'self' && 'gpId' in acc && acc.gpId === asParam
    )
    if (found) return found
    // Stale `?as=<gpId>` (revoked delegation, deleted dependent, etc.)
    // — fall back to self. The switcher consumer can show a toast.
    return { kind: 'self', displayName: selfDisplayName }
  }, [asParam, available, selfDisplayName])

  // If `?as=` is present but doesn't match any available account AND we
  // already finished loading, drop the param to clean up the URL. Avoid
  // doing this during initial load (race with fetch).
  useEffect(() => {
    if (loading) return
    if (!asParam) return
    const stillValid = available.some(
      (acc) => acc.kind !== 'self' && 'gpId' in acc && acc.gpId === asParam
    )
    if (!stillValid) {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      params.delete('as')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }
  }, [asParam, available, loading, pathname, router, searchParams])

  const pendingReceivedCount = useMemo(
    () =>
      received.filter(
        (r) => !r.accepted_at && !r.revoked_at &&
          (!r.expires_at || new Date(r.expires_at).getTime() > Date.now())
      ).length,
    [received]
  )

  const switchTo = useCallback(
    (gpId: string | null) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      if (gpId === null) {
        params.delete('as')
      } else {
        params.set('as', gpId)
      }
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams]
  )

  const value: AccountContextValue = useMemo(
    () => ({
      active,
      available,
      loading,
      error,
      pendingReceivedCount,
      switchTo,
      refetch: fetchAll,
    }),
    [active, available, loading, error, pendingReceivedCount, switchTo, fetchAll]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
