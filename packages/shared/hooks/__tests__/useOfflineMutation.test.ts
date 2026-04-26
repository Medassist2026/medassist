/**
 * Contract tests for the offline-write Phase 1 surface (TD-008).
 *
 * Same pattern as `frontdesk/payments/create/__tests__/handler.test.ts`:
 * compile-time witnesses that lock in the signatures + behavior contracts,
 * and `// VITEST:` blocks that document the runtime tests for when the
 * runner lands.
 *
 * What this file guards against
 * -----------------------------
 *   1. Regression on the useOfflineMutation hook's exported surface (the
 *      hook itself plus the syncOfflineQueue + getOfflineQueueStats helpers
 *      that surfaces like checkin/page.tsx import).
 *   2. Regression on the data-layer's `clientIdempotencyKey` parameter
 *      becoming required (it must stay optional so non-offline callers are
 *      unaffected) or being dropped entirely.
 *   3. Regression on idb-cache treating 409 as success on replay.
 */

import {
  useOfflineMutation,
  syncOfflineQueue,
  getOfflineQueueStats,
} from '../useOfflineMutation'
import {
  addPendingWrite,
  syncPendingWrites,
  getPendingWriteCount,
  type PendingWrite,
} from '@shared/lib/offline/idb-cache'
import { createPayment } from '@shared/lib/data/frontdesk'
import { createClinicalNote } from '@shared/lib/data/clinical-notes'

// ───────────────────────────────────────────────────────────────────────────
// 1. useOfflineMutation hook surface
// ───────────────────────────────────────────────────────────────────────────

// Hook return shape. If any of these fields drop or change type, the
// assignment fails to compile — surfaces like checkin/page.tsx that read
// `pendingCount` and `isOffline` would silently break otherwise.
type HookReturn = ReturnType<typeof useOfflineMutation>
const _hook: {
  mutate: (body: unknown) => Promise<{ data?: any; offline: boolean; offlineId?: string } | null>
  loading: boolean
  error: string | null
  isOffline: boolean
  pendingCount: number
} = {} as HookReturn
void _hook

// syncOfflineQueue is async (was sync pre-TD-008 — we async'd it because
// idb-cache is async). If a future refactor makes it sync again, anything
// awaiting it would need updating.
const _syncReturn: Promise<{ synced: number; failed: number }> = syncOfflineQueue()
void _syncReturn

// getOfflineQueueStats is async too (same reason).
const _statsReturn: Promise<{ pending: number; failed: number; total: number }> =
  getOfflineQueueStats()
void _statsReturn

// ───────────────────────────────────────────────────────────────────────────
// 2. idb-cache primitives the hook depends on
// ───────────────────────────────────────────────────────────────────────────

// addPendingWrite signature. The hook + 3 client surfaces (check-in,
// payments/new, SessionForm) all call this — if the signature breaks the
// runtime queue stops working invisibly because the call sites swallow IDB
// errors.
const _addReturn: Promise<string> = addPendingWrite(
  '/api/frontdesk/checkin',
  'POST',
  { example: 'body' }
)
void _addReturn

// syncPendingWrites contract: returns counts. Treats 409 as success — that
// invariant is asserted at runtime in the VITEST block below.
const _syncPendingReturn: Promise<{ synced: number; failed: number }> = syncPendingWrites()
void _syncPendingReturn

// getPendingWriteCount: used by OfflineIndicator for the badge.
const _countReturn: Promise<number> = getPendingWriteCount()
void _countReturn

// PendingWrite shape used by getOfflineQueueStats internally — locked here
// so a status enum change doesn't silently break the stats math.
const _pendingWrite: PendingWrite = {
  id: 'pw_1',
  url: '/api/frontdesk/checkin',
  method: 'POST',
  body: '{}',
  createdAt: 0,
  retries: 0,
  status: 'pending',
}
void _pendingWrite

// ───────────────────────────────────────────────────────────────────────────
// 3. Data-layer: clientIdempotencyKey is OPTIONAL
// ───────────────────────────────────────────────────────────────────────────

// createPayment must accept clientIdempotencyKey and it must be optional.
// If it ever becomes required, every non-offline caller would break.
type CreatePaymentParams = Parameters<typeof createPayment>[0]

const _paymentWithKey: CreatePaymentParams = {
  patientId: 'p1',
  doctorId: 'd1',
  clinicId: 'c1',
  amount: 100,
  paymentMethod: 'cash',
  clientIdempotencyKey: 'idem_xyz',  // present
}
void _paymentWithKey

const _paymentWithoutKey: CreatePaymentParams = {
  patientId: 'p1',
  doctorId: 'd1',
  clinicId: 'c1',
  amount: 100,
  paymentMethod: 'cash',
  // clientIdempotencyKey omitted — must compile (optional)
}
void _paymentWithoutKey

// createClinicalNote: same contract.
type CreateClinicalNoteParams = Parameters<typeof createClinicalNote>[0]

const _noteWithKey: CreateClinicalNoteParams = {
  doctorId: 'd1',
  patientId: 'p1',
  clinicId: 'c1',
  noteData: {
    chief_complaint: ['headache'],
    diagnosis: 'tension',
    medications: [],
    plan: '',
  },
  keystrokeCount: 0,
  durationSeconds: 0,
  syncToPatient: false,
  clientIdempotencyKey: 'idem_abc',
}
void _noteWithKey

const _noteWithoutKey: CreateClinicalNoteParams = {
  doctorId: 'd1',
  patientId: 'p1',
  clinicId: 'c1',
  noteData: {
    chief_complaint: ['headache'],
    diagnosis: 'tension',
    medications: [],
    plan: '',
  },
  keystrokeCount: 0,
  durationSeconds: 0,
  syncToPatient: false,
  // clientIdempotencyKey omitted — must compile
}
void _noteWithoutKey

// ───────────────────────────────────────────────────────────────────────────
// 4. Runtime tests — Vitest blocks for when the runner is wired up
// ───────────────────────────────────────────────────────────────────────────

// VITEST: useOfflineMutation queues on offline
//   describe('useOfflineMutation', () => {
//     beforeEach(() => {
//       Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
//       // Reset fake-indexeddb between tests
//     })
//     it('enqueues to idb-cache when navigator.onLine is false', async () => {
//       const { result } = renderHook(() => useOfflineMutation('/api/frontdesk/checkin'))
//       const ret = await result.current.mutate({ patientId: 'p1', doctorId: 'd1', queueType: 'walkin' })
//       expect(ret?.offline).toBe(true)
//       expect(ret?.offlineId).toMatch(/^pw_/)
//       const count = await getPendingWriteCount()
//       expect(count).toBe(1)
//     })
//   })

// VITEST: syncPendingWrites treats 409 as success (TD-008)
//   it('removes queued entry when server returns 409 on replay', async () => {
//     await addPendingWrite('/api/frontdesk/checkin', 'POST', { patientId: 'p1', doctorId: 'd1' })
//     fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }))
//     const { synced, failed } = await syncPendingWrites()
//     expect(synced).toBe(1)
//     expect(failed).toBe(0)
//     expect(await getPendingWriteCount()).toBe(0)
//   })

// VITEST: legacy localStorage queue is drained on first hook mount
//   it('migrates legacy medassist_offline_queue items into idb-cache', async () => {
//     localStorage.setItem('medassist_offline_queue', JSON.stringify([
//       { url: '/api/frontdesk/checkin', body: { patientId: 'legacy_p1' }, method: 'POST' },
//       { url: '/api/frontdesk/checkin', body: { patientId: 'legacy_p2' }, method: 'POST' },
//     ]))
//     renderHook(() => useOfflineMutation('/api/frontdesk/checkin'))
//     await waitFor(async () => expect(await getPendingWriteCount()).toBe(2))
//     expect(localStorage.getItem('medassist_offline_queue')).toBeNull()
//   })

// VITEST: server-side dedupe — payments handler short-circuits on key
//   it('returns existing payment when clientIdempotencyKey matches', async () => {
//     // seed: one payment with key 'k1' already in the test DB
//     const res = await POST(new Request('http://x/api/frontdesk/payments/create', {
//       method: 'POST',
//       body: JSON.stringify({
//         patientId: 'p1', doctorId: 'd1', amount: 100, paymentMethod: 'cash',
//         clientIdempotencyKey: 'k1',
//       }),
//     }))
//     const json = await res.json()
//     expect(res.status).toBe(200)
//     expect(json.deduped).toBe(true)
//     expect(json.payment).toBeDefined()
//   })

// VITEST: server-side dedupe — clinical notes handler short-circuits on key
//   it('returns existing noteId when clientIdempotencyKey matches and same doctor', async () => {
//     // seed: one note with key 'n1' for doctor d1
//     const res = await POST(buildAuthedRequest('d1', { clientIdempotencyKey: 'n1', /* ... */ }))
//     expect(res.status).toBe(200)
//     const json = await res.json()
//     expect(json.deduped).toBe(true)
//   })

// VITEST: cross-doctor key collision is impossible
//   it('does NOT match a clinical note with same key for a different doctor', async () => {
//     // seed: note with key 'n1' for doctor d1
//     const res = await POST(buildAuthedRequest('d2', { clientIdempotencyKey: 'n1', /* ... */ }))
//     // Should not dedupe — should attempt insert and either succeed (different
//     // unique constraint scope) or fail loudly. Either way, no cross-doctor leak.
//     expect(res.status).not.toBe(200)
//   })

export {}
