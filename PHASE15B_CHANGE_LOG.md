# Phase 15B Change Log

## Scope
- Fix Phase 15 smoke auth-boundary failures in API routes.
- Retest full Phase 15 suite to confirm closure and regression safety.

## Root Cause
- API handlers in:
  - `/Users/Suzy/Desktop/medassist/app/api/doctors/list/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/frontdesk/slots/route.ts`
- used `requireRole(...)` (page redirect semantics) with generic `500` catch blocks.
- Unauthenticated/wrong-role calls surfaced as `NEXT_REDIRECT` and produced `500` instead of expected `401/403`.

## Changes Applied

1. Updated `/Users/Suzy/Desktop/medassist/app/api/doctors/list/route.ts`
- Import switch:
  - `requireRole` -> `requireApiRole`
  - add `toApiErrorResponse`
- Auth check:
  - `requireRole(['doctor', 'frontdesk'])` -> `requireApiRole(['doctor', 'frontdesk'])`
- Catch handling:
  - generic `500` -> `toApiErrorResponse(error, 'Failed to load doctors')`

2. Updated `/Users/Suzy/Desktop/medassist/app/api/frontdesk/slots/route.ts`
- Import switch:
  - `requireRole` -> `requireApiRole`
  - add `toApiErrorResponse`
- Auth check:
  - `requireRole('frontdesk')` -> `requireApiRole('frontdesk')`
- Catch handling:
  - generic `500` -> `toApiErrorResponse(error, 'Failed to load slots')`

## Reasoning
- API routes should return stable auth status semantics:
  - unauthenticated -> `401`
  - authenticated but wrong role -> `403`
- These changes align routes with existing hardening pattern used in prior phases.

## Retest Evidence

1. Pre-fix Phase 15 smoke
- Artifacts: `/tmp/phase15_multi_clinic_20260216_083029`
- Result: `38/42` pass, `4` fail (`P15_28`-`P15_31`)

2. Post-fix Phase 15B smoke
- Artifacts: `/tmp/phase15_multi_clinic_20260216_083251`
- Result: `42/42` pass, `0` fail

## Static Validation
- `npm run type-check`: PASS
- `npm run lint`: PASS

## Final Status
- Phase 15B auth-boundary defects are resolved.
- Phase 15 smoke suite is fully green.
