# Phase 6 Remediation Change Log

- Date: 2026-02-15 (PST)
- Request scope: Implement fixes for 3 approved root causes from Phase 6 hardening, then retest.
- Constraints followed:
  - No schema/database migration changes.
  - No broad refactors outside root-cause scope.
  - Keep page-route redirect behavior intact; change API behavior only.

## Root Cause 1: API auth used redirect semantics and produced `500` in route handlers

### Problem
API route handlers were calling redirect-based auth guards. In API `try/catch` blocks, `NEXT_REDIRECT` exceptions were converted into generic `500` responses instead of `401/403`.

### Changes
1. Added API-safe auth primitives in `/Users/Suzy/Desktop/medassist/lib/auth/session.ts`:
  - `ApiAuthError` (`401 | 403`)
  - `requireApiAuth()`
  - `requireApiRole()`
  - `toApiErrorResponse(error, fallbackMessage)`
2. Updated affected API routes to use API-safe auth and unified error mapping:
  - `/Users/Suzy/Desktop/medassist/app/api/doctor/appointments/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/patients/search/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/doctor/messages/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/frontdesk/appointments/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/patient/records/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/frontdesk/payments/create/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/clinical/prescription/route.ts`

### Reasoning
- API routes should return HTTP auth codes, not navigation redirects.
- Keeping page-level `requireAuth/requireRole` unchanged avoids regression in dashboard navigation behavior.
- Centralizing `toApiErrorResponse` removes repeated per-route auth error handling and preserves consistent response contracts.

### Outcome
Cross-role and unauth checks that previously returned `500` now return expected `401/403` (see retest section).

## Root Cause 2: Session instability due to SSR cookie adapter mismatch

### Problem
Auth cookies were being read/written with older adapter signatures (`get/set/remove`) instead of current Supabase SSR cookie patterns (`getAll/setAll`). This can break session propagation across middleware/server contexts and role-switch test sequences.

### Changes
1. Updated `/Users/Suzy/Desktop/medassist/lib/supabase/server.ts`:
  - Replaced cookie adapter with `getAll()` and `setAll(...)`.
2. Updated `/Users/Suzy/Desktop/medassist/middleware.ts`:
  - Replaced cookie adapter with `getAll()` and `setAll(...)`.
  - Ensured cookies set in request context are mirrored into response cookies.

### Reasoning
- Aligning middleware/server adapters with Supabase SSR expected APIs reduces serialization and chunking mismatch risk.
- This is the minimal safe change that targets auth-state transport without changing application business logic.

### Outcome
- Major `500` auth leakage is fixed, but intermittent doctor-session false negatives remain in multi-role sequence (still `401` on some doctor-authenticated checks). Further isolation work is required.

## Root Cause 3: Appointment type contract mismatch (`follow_up` vs `followup`)

### Problem
API accepted raw `appointmentType` and passed it directly to DB, where enum/check constraints rejected unsupported values with `500`.

### Changes
Updated `/Users/Suzy/Desktop/medassist/app/api/frontdesk/appointments/create/route.ts`:
- Added `ALLOWED_APPOINTMENT_TYPES` guard:
  - `regular`, `followup`, `emergency`, `consultation`
- Added normalization map:
  - `follow-up` -> `followup`
  - `follow_up` -> `followup`
- Invalid values now return `400` with clear message.

### Reasoning
- Normalize common alias formats at API boundary to prevent avoidable DB exceptions.
- Keep contract strict for unsupported values while providing compatibility for likely client spelling variants.

### Outcome
- `follow_up` no longer triggers DB constraint `500`; it now normalizes and succeeds.
- Existing Phase 6 test case expecting `400` for `follow_up` must be updated to new intended behavior (`200` for normalized alias, `400` for truly invalid values).

## Verification Log

### Static checks
- Command: `npm run type-check` -> PASS
- Command: `npm run lint` -> PASS (warnings only, no blocking errors)

### Phase 6 retest
- Command: `/tmp/phase6_hardening_smoke.sh`
- Latest run:
  - Timestamp: 2026-02-15 22:41:16 PST
  - Artifacts: `/tmp/phase6_hardening_20260215_224055`
  - Total: 39
  - Passed: 30
  - Failed: 9
  - Status: FAIL

### Confirmed fixed checks
- `H6_34` unauth doctor API -> `401` PASS
- `H6_35` patient -> doctor API -> `403` PASS
- `H6_37` frontdesk -> patient API -> `403` PASS
- `H6_38` frontdesk -> doctor messages API -> `403` PASS
- `H6_39` patient -> frontdesk payment API -> `403` PASS

### Known remaining failures
- `H6_12`, `H6_20`, `H6_26`, `H6_27`, `H6_28`, `H6_29`, `H6_30`, `H6_36`
  - Current actual: `401`
  - Expected in test matrix: `200/400/403` depending on case
  - Common factor: doctor session not consistently accepted after multi-role flow.
- `H6_31`
  - Current actual: `200` (intended due to alias normalization)
  - Matrix expectation still `400` and should be revised.

## Next Proposed Work (Historical Pre-Phase 6B)

1. Add a deterministic auth canary in the smoke harness that validates doctor session immediately after login and refreshes cookie if invalid.
2. Capture and compare raw `Set-Cookie` variants for passing vs failing doctor sessions to isolate chunking/serialization divergence.
3. Add one explicit invalid appointment type test (example: `followupx`) expecting `400` to preserve strict validation coverage after alias normalization.

---

## Phase 6B Addendum (Executed)

- Date: 2026-02-15 (PST)
- Goal: Resolve remaining 9 failures from Phase 6 retest.

### Root Cause Confirmed

- `/Users/Suzy/Desktop/medassist/app/api/auth/login/route.ts` used `supabase.auth.signOut()` in the role-mismatch path.
- In the `H6_11` role-mismatch check, this revoked active doctor sessions for that user.
- Result was cascading `401` on subsequent doctor-authenticated checks (`H6_12`, `H6_20`, `H6_26`-`H6_30`, `H6_36`).

Repro proof captured before fix:
- Sequence: valid doctor login (`200`) -> role mismatch login (`403`) -> doctor appointments became `401`.
- After fix: same sequence ends with doctor appointments `200`.

### Phase 6B Code Change

Updated `/Users/Suzy/Desktop/medassist/app/api/auth/login/route.ts`:
- Changed cleanup sign-out calls to local scope:
  - `supabase.auth.signOut({ scope: 'local' })`
- Applied in:
  1. Missing profile branch (`404`)
  2. Role mismatch branch (`403`)

Reasoning:
- Preserve expected error behavior while preventing global revocation of unrelated active sessions.
- This is minimal and directly targets session invalidation side effect.

### Phase 6B Harness Alignment

Updated smoke harness contract in `/tmp/phase6_hardening_smoke.sh`:
- Changed alias test:
  - `H6_31_appt_type_alias_accepted` expects `2xx` for `follow_up`.
- Added strict invalid test:
  - `H6_31b_appt_type_invalid_contract` expects `400` for `followupx`.

### Phase 6B Retest Outcome

- Artifacts: `/tmp/phase6_hardening_20260215_225346`
- Total: 40
- Passed: 40
- Failed: 0
- Status: PASS

### Post-Change Verification

- `npm run type-check` -> PASS
- `npm run lint` -> PASS (warnings only)
