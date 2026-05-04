/**
 * Hand-rolled tests for the admin global-patients lookup handler.
 *
 * These tests exercise the input-validation and shape-of-response
 * paths. They mock the auth gate and the data-layer call so the
 * handler can run in isolation. Live DB integration is verified by
 * Mo on staging via `scripts/validate-mig-071-072-073.sql` (B14).
 *
 * Auth contract (post Build-02 follow-up Fix 5):
 *   The handler now uses `requireServiceRole(request)`. Calls without a
 *   valid `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` header
 *   return 401 — INCLUDING calls authenticated as a regular user
 *   (doctor / patient / frontdesk). This is enforced via a header
 *   check; the test mock for `requireServiceRole` reads the same
 *   header so the test harness exercises the real header path.
 *
 * Run with:
 *   npx tsx packages/shared/lib/api/handlers/admin/global-patients-lookup/__tests__/handler.test.ts
 */

import { Module } from 'node:module'

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<boolean> | boolean): Promise<void> {
  let ok = false
  let threw: unknown = null
  try {
    ok = await fn()
  } catch (err) {
    threw = err
  }
  if (threw !== null) {
    console.log(`  ✗ ${name} (threw: ${(threw as Error)?.message ?? threw})`)
    failed += 1
    return
  }
  if (ok) {
    console.log(`  ✓ ${name}`)
    passed += 1
  } else {
    console.log(`  ✗ ${name}`)
    failed += 1
  }
}

// --- Mock module overrides ---------------------------------------------
// Stash the original loader and intercept imports for `@shared/lib/auth/session`
// and `@shared/lib/data/global-patients`. We replace them with stubs whose
// behavior the test toggles via shared state.

interface StubState {
  // Bearer that the handler reads from the Request header. The mock
  // `requireServiceRole` checks this against the configured expected token
  // — same shape as the real function, just without the Buffer compare.
  expectedServiceToken: string
  lookupResult: { id: string; normalized_phone: string; claimed_user_id: string | null; claimed: boolean; claimed_at: string | null; account_status: string; display_name: string | null; created_at: string } | null
}

const stubState: StubState = {
  expectedServiceToken: 'test-service-role-key',
  lookupResult: null,
}

const originalResolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load

;(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (...args: unknown[]) {
  const req = args[0] as string
  if (req === '@shared/lib/auth/session') {
    class ApiAuthError extends Error {
      status: 401 | 403
      constructor(m: string, s: 401 | 403) {
        super(m)
        this.name = 'ApiAuthError'
        this.status = s
      }
    }
    return {
      ApiAuthError,
      requireServiceRole: (request: Request) => {
        // Mirror the real contract: read Authorization header, expect
        // `Bearer <expected>`, throw ApiAuthError(401) on any mismatch.
        const header =
          request.headers.get('authorization') ??
          request.headers.get('Authorization') ??
          ''
        const match = header.match(/^Bearer\s+(.+)$/i)
        const token = match?.[1]
        if (!token || token !== stubState.expectedServiceToken) {
          throw new ApiAuthError('Unauthorized', 401)
        }
      },
      toApiErrorResponse: (err: unknown, fallback: string) => {
        const e = err as { status?: number; message?: string }
        const status = e?.status ?? 500
        return new Response(JSON.stringify({ error: e?.message ?? fallback }), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      },
    }
  }
  if (req === '@shared/lib/data/global-patients') {
    return {
      findGlobalPatientByPhone: async () => stubState.lookupResult,
    }
  }
  if (req === '@shared/lib/utils/phone-normalize') {
    return require('../../../../../utils/phone-normalize')
  }
  return originalLoad.call(this, ...args)
}
;(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename = function (...args: unknown[]) {
  const req = args[0] as string
  if (req === '@shared/lib/auth/session' || req === '@shared/lib/data/global-patients' || req === '@shared/lib/utils/phone-normalize') {
    return req
  }
  return originalResolve.call(this, ...args)
}

// Helper: build a request that already carries the correct service-role
// bearer. Tests that need to exercise the auth-fail path call the bare
// `new Request(url)` form (no header) instead.
function authedRequest(url: string): Request {
  return new Request(url, {
    headers: { Authorization: `Bearer ${stubState.expectedServiceToken}` },
  })
}

// Now safe to import the handler. Everything below runs inside main()
// because Node + tsx compile to CJS where top-level await is unavailable.
async function main(): Promise<void> {
const handlerMod = await import('../handler')
const GET = handlerMod.GET as (req: Request) => Promise<Response>

console.log('\n=== admin/global-patients-lookup handler ===\n')

// Auth-passing input-validation tests use a service-role bearer so the
// 400 paths fire before the lookup is consulted.

await test('400 when phone query param missing', async () => {
  stubState.lookupResult = null
  const res = await GET(authedRequest('http://x/api/admin/global-patients/lookup'))
  if (res.status !== 400) return false
  const j = await res.json()
  return j.error === 'phone query param required'
})

await test('400 when phone is empty', async () => {
  stubState.lookupResult = null
  const res = await GET(authedRequest('http://x/api/admin/global-patients/lookup?phone='))
  return res.status === 400
})

await test('400 when phone cannot be normalized', async () => {
  stubState.lookupResult = null
  const res = await GET(
    authedRequest('http://x/api/admin/global-patients/lookup?phone=hello'),
  )
  if (res.status !== 400) return false
  const j = await res.json()
  return j.error === 'phone could not be normalized to E.164' && j.input === 'hello'
})

await test('401 when no service-role bearer present', async () => {
  // No Authorization header → real `requireServiceRole` and our mock both
  // fail with 401. This replaces the previous "401 when not logged in"
  // case; semantically the same shape, different mechanism.
  stubState.lookupResult = null
  const res = await GET(
    new Request('http://x/api/admin/global-patients/lookup?phone=01012345678'),
  )
  return res.status === 401
})

await test('401 when authenticated as a regular user (doctor token, not service-role)', async () => {
  // Auth contract change (Fix 5): a doctor token MUST NOT pass this gate.
  // Sending an arbitrary non-service token in the bearer = 401.
  stubState.lookupResult = null
  const res = await GET(
    new Request('http://x/api/admin/global-patients/lookup?phone=01012345678', {
      headers: { Authorization: 'Bearer doctor-jwt-token-not-service-role' },
    }),
  )
  return res.status === 401
})

await test('404 when phone normalizes but no global_patients row exists', async () => {
  stubState.lookupResult = null
  const res = await GET(
    authedRequest('http://x/api/admin/global-patients/lookup?phone=01012345678'),
  )
  if (res.status !== 404) return false
  const j = await res.json()
  return j.error === 'Not Found' && j.normalized_phone === '+201012345678'
})

await test('200 returns mapped shape on hit (with service-role bearer)', async () => {
  stubState.lookupResult = {
    id: 'gp-1',
    normalized_phone: '+201012345678',
    claimed_user_id: 'user-7',
    claimed: true,
    claimed_at: '2026-04-28T00:00:00Z',
    account_status: 'active',
    display_name: 'Mo',
    created_at: '2026-04-01T00:00:00Z',
  }
  const res = await GET(
    authedRequest('http://x/api/admin/global-patients/lookup?phone=01012345678'),
  )
  if (res.status !== 200) return false
  const j = await res.json()
  return (
    j.id === 'gp-1' &&
    j.normalized_phone === '+201012345678' &&
    j.claimed_by_user_id === 'user-7' &&
    j.claimed === true &&
    j.account_status === 'active'
  )
})

await test('200 returns null claimed_by_user_id when unclaimed', async () => {
  stubState.lookupResult = {
    id: 'gp-2',
    normalized_phone: '+201112345678',
    claimed_user_id: null,
    claimed: false,
    claimed_at: null,
    account_status: 'active',
    display_name: null,
    created_at: '2026-04-01T00:00:00Z',
  }
  const res = await GET(
    authedRequest('http://x/api/admin/global-patients/lookup?phone=+201112345678'),
  )
  if (res.status !== 200) return false
  const j = await res.json()
  return (
    j.claimed === false && j.claimed_by_user_id === null && j.claimed_at === null
  )
})

await test('phone normalization happens server-side (raw 10-digit accepted)', async () => {
  stubState.lookupResult = {
    id: 'gp-3',
    normalized_phone: '+201212345678',
    claimed_user_id: null,
    claimed: false,
    claimed_at: null,
    account_status: 'active',
    display_name: null,
    created_at: '2026-04-01T00:00:00Z',
  }
  const res = await GET(
    authedRequest('http://x/api/admin/global-patients/lookup?phone=1212345678'),
  )
  return res.status === 200
})

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`)
process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Test harness crashed:', e)
  process.exit(1)
})
