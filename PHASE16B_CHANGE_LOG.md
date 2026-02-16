# Phase 16B Change Log

## Scope
- Fix Phase 16 RBAC/API-contract failures.
- Retest full Phase 16 smoke suite for closure and regression safety.

## Root Cause
- Multiple API handlers used page-auth helpers (`requireRole`) or manual role checks, causing:
  - `500` + `NEXT_REDIRECT` for unauth/wrong-role calls.
  - `401` used for authenticated wrong-role calls that should be `403`.

## Changes Applied

1. Updated `/Users/Suzy/Desktop/medassist/app/api/frontdesk/checkin/route.ts`
- `requireRole('frontdesk')` -> `requireApiRole('frontdesk')`
- catch -> `toApiErrorResponse(error, 'Check-in failed')`

2. Updated `/Users/Suzy/Desktop/medassist/app/api/frontdesk/queue/update/route.ts`
- `requireRole('frontdesk')` -> `requireApiRole('frontdesk')`
- catch -> `toApiErrorResponse(error, 'Update failed')`

3. Updated `/Users/Suzy/Desktop/medassist/app/api/doctor/availability/route.ts`
- `GET`/`POST`: `requireRole('doctor')` -> `requireApiRole('doctor')`
- top-level catches -> `toApiErrorResponse(...)`

4. Updated `/Users/Suzy/Desktop/medassist/app/api/patients/my-patients/route.ts`
- `requireRole('doctor')` -> `requireApiRole('doctor')`
- catch -> `toApiErrorResponse(error, 'Failed to get patients')`

5. Updated `/Users/Suzy/Desktop/medassist/app/api/templates/current/route.ts`
- `getCurrentUser` + manual doctor check -> `requireApiRole('doctor')`
- catch -> `toApiErrorResponse(error, 'Failed to load template')`

6. Updated `/Users/Suzy/Desktop/medassist/app/api/clinical/notes/route.ts`
- `getCurrentUser` + manual doctor check -> `requireApiRole('doctor')`
- catch -> `toApiErrorResponse(error, 'Failed to save note')`

## Test Harness Alignment
- Updated `/Users/Suzy/Desktop/medassist/scripts/phase16_rbac_smoke.sh`
  - `P16_08` assertion aligned from `.labOrders` to `.orders`.
  - This removed a harness-only false negative before Phase 16B app fix validation.

## Retest Evidence

1. Pre-fix (assertion-aligned) run
- Artifacts: `/tmp/phase16_rbac_20260216_084001`
- Result: `49/60` pass, `11` fail.

2. Post-fix Phase 16B run
- Artifacts: `/tmp/phase16_rbac_20260216_084312`
- Result: `60/60` pass, `0` fail.

## Static Validation
- `npm run type-check`: PASS
- `npm run lint`: PASS

## Final Status
- Phase 16B RBAC/API-contract defects are closed.
- Phase 16 smoke suite is fully green.
