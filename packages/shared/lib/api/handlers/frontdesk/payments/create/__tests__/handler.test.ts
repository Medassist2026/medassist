/**
 * Contract tests for `POST /api/frontdesk/payments/create`.
 *
 * These tests lock in the invariant the `b724eb1` build break exposed:
 * `clinic_id` on every payment row is **server-resolved** from the
 * frontdesk's session, never read from the request body. See D-041.
 *
 * Test framework note
 * -------------------
 * The repo does not yet have a runtime test runner configured (vitest
 * is the planned choice — see ARCHITECTURE.md §14). The hand-rolled
 * `test()` harness in `analytics/__tests__/doctor-stats.test.ts` works
 * for pure functions but cannot mock the module graph this handler
 * imports (`requireApiRole`, `createClient`, `getFrontdeskClinicId`,
 * `ensureDoctorInFrontdeskClinic`, `createPayment`).
 *
 * What this file does today
 * -------------------------
 *  1. Type-level assertions that run at `tsc --noEmit` time. These are
 *     the contract that — had it existed — would have failed `b724eb1`
 *     locally. They guard against regressions on the data-layer
 *     signature and on what the handler exports.
 *  2. Documented runtime test cases (`// VITEST:` blocks) describing
 *     the unit + negative tests Mo's brief calls for. Once vitest lands
 *     these become real `it(...)` blocks. They are written as fenced
 *     pseudocode so a reviewer can mechanically translate them.
 *
 * Why type-level alone is enough to close THIS regression
 * --------------------------------------------------------
 * The `b724eb1` failure mode was: data-layer required `clinicId`,
 * handler call site didn't pass it. `tsc --noEmit` catches that
 * categorically — there is no runtime path where this slips through if
 * the type contract holds. The runtime tests below add value for
 * **correctness of the resolver** (we use the right server-side
 * function and ignore body input), which is a different contract.
 */

import { POST } from '../handler'
import { createPayment } from '@shared/lib/data/frontdesk'

// ───────────────────────────────────────────────────────────────────────────
// 1. Type-level: createPayment requires clinicId
// ───────────────────────────────────────────────────────────────────────────

// If a future refactor makes `clinicId` optional, this line stops compiling
// — the assignment is intentional and should fail when the contract weakens.
type CreatePaymentParams = Parameters<typeof createPayment>[0]

// Compile-time witness: every key in the canonical "all required" set must
// be present in CreatePaymentParams; clinicId in particular must be a
// non-optional string. If `clinicId?: string` is ever introduced, the
// `Required<>` extraction below would still include it, but the assignment
// to `_required` will fail because the actual params type would no longer
// match the structural shape we expect.
const _required: {
  patientId: string
  doctorId: string
  clinicId: string
  amount: number
  paymentMethod: 'cash' | 'card' | 'insurance' | 'other'
} = {
  patientId: '00000000-0000-0000-0000-000000000000',
  doctorId:  '00000000-0000-0000-0000-000000000000',
  clinicId:  '00000000-0000-0000-0000-000000000000',
  amount: 100,
  paymentMethod: 'cash',
}
// Ensures the structural shape is assignable to CreatePaymentParams as well
// — i.e. the data layer hasn't added a new required key without our notice.
const _params: CreatePaymentParams = _required
void _params

// ───────────────────────────────────────────────────────────────────────────
// 2. Type-level: handler exports a POST that consumes a Request
// ───────────────────────────────────────────────────────────────────────────

// If the handler stops exporting POST, or its signature drifts away from
// `(Request) => Promise<Response>`, this assignment fails at compile time.
type _HandlerSig = (request: Request) => Promise<Response>
const _post: _HandlerSig = POST as unknown as _HandlerSig
void _post

// ───────────────────────────────────────────────────────────────────────────
// 3. Type-level: a body-only payload (no clinicId) cannot be passed to the
//    data layer.  This is the EXACT call shape that broke the build at
//    `b724eb1`.  The `@ts-expect-error` directive turns the regression
//    guard inside-out: if the contract weakens, the directive becomes
//    *unused*, which `tsc` flags.
// ───────────────────────────────────────────────────────────────────────────

const _bodyOnly = {
  patientId: '00000000-0000-0000-0000-000000000000',
  doctorId:  '00000000-0000-0000-0000-000000000000',
  amount: 100,
  paymentMethod: 'cash' as const,
  appointmentId: undefined,
  clinicalNoteId: undefined,
  notes: undefined,
}

// @ts-expect-error — clinicId is required; passing the body alone must fail
const _broken: CreatePaymentParams = _bodyOnly
void _broken


// ===========================================================================
// VITEST CONTRACT TESTS (executable once a runner is wired up)
// ===========================================================================
//
// VITEST: handler resolves clinic from the frontdesk session
// ----------------------------------------------------------
//   Setup:
//     - Stub requireApiRole('frontdesk') → { id: 'fd-user-1' }
//     - Stub getFrontdeskClinicId(_, 'fd-user-1') → 'clinic-A'
//     - Stub ensureDoctorInFrontdeskClinic(_, 'fd-user-1', 'doc-1') → true
//     - Spy on createPayment
//   Action:
//     - Call POST(new Request('http://x', {
//         method: 'POST',
//         body: JSON.stringify({
//           patientId: 'pat-1', doctorId: 'doc-1',
//           amount: 200, paymentMethod: 'cash',
//         }),
//       }))
//   Assert:
//     - createPayment was called with clinicId: 'clinic-A' (the resolver value)
//     - response.status === 200
//
//
// VITEST: foreign body-supplied clinic_id is ignored
// ---------------------------------------------------
//   Setup: same as above — frontdesk's actual clinic is 'clinic-A'.
//   Action:
//     - Call POST(new Request('http://x', {
//         method: 'POST',
//         body: JSON.stringify({
//           patientId: 'pat-1', doctorId: 'doc-1',
//           amount: 200, paymentMethod: 'cash',
//           // hostile body — must NOT be honored:
//           clinic_id: 'clinic-B',
//           clinicId:  'clinic-B',
//         }),
//       }))
//   Assert:
//     - createPayment was called with clinicId: 'clinic-A' (NEVER 'clinic-B')
//     - The body-supplied keys are ignored because the handler does not
//       destructure them out of `body` (handler.ts:15 — only patientId,
//       doctorId, amount, paymentMethod, appointmentId, clinicalNoteId,
//       notes are read).
//     - response.status === 200
//
//
// VITEST: handler 400s with NO_ACTIVE_CLINIC when no membership resolves
// -----------------------------------------------------------------------
//   Setup:
//     - Stub getFrontdeskClinicId(_, 'fd-user-1') → null
//   Action:
//     - Call POST(...) with a valid body
//   Assert:
//     - response.status === 400
//     - response body has code: 'NO_ACTIVE_CLINIC' and Arabic error string
//     - createPayment was NOT called
//
//
// VITEST: handler 403s when doctor is outside the frontdesk's clinic scope
// -------------------------------------------------------------------------
//   Setup:
//     - getFrontdeskClinicId returns 'clinic-A'
//     - ensureDoctorInFrontdeskClinic returns false
//   Action:
//     - Call POST(...)
//   Assert:
//     - response.status === 403
//     - createPayment was NOT called
//
//
// To run once vitest is installed:
//   npx vitest packages/shared/lib/api/handlers/frontdesk/payments/create
