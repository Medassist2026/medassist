# Phase 15 Multi-Clinic Smoke Report

## Run Summary

### Initial Phase 15 smoke
- Script: `/Users/Suzy/Desktop/medassist/scripts/phase15_multi_clinic_smoke.sh`
- Timestamp: `2026-02-16 08:30:58 PST`
- Artifacts: `/tmp/phase15_multi_clinic_20260216_083029`
- Total: `42`
- Passed: `38`
- Failed: `4`
- Status: `FAIL`

### Phase 15B retest (latest)
- Script: `/Users/Suzy/Desktop/medassist/scripts/phase15_multi_clinic_smoke.sh`
- Timestamp: `2026-02-16 08:33:20 PST`
- Artifacts: `/tmp/phase15_multi_clinic_20260216_083251`
- Total: `42`
- Passed: `42`
- Failed: `0`
- Status: `PASS`

## Passing Coverage

### Current baseline flows (implemented today)
- Frontdesk can load doctor list for scheduling (`P15_09`).
- Doctor-scoped doctor list behavior remains intact (`P15_10`).
- Frontdesk slots validation and retrieval works (`P15_11`, `P15_12`).
- Frontdesk can create/list appointments and normalize follow-up alias (`P15_13` to `P15_16`).
- Frontdesk check-in and queue status progression works (`P15_17` to `P15_19`).
- Frontdesk payment creation works (`P15_20`).
- Frontdesk onboarding path enforces explicit doctor assignment and succeeds when supplied (`P15_21`, `P15_22`).
- Frontdesk appointment APIs enforce `401/403` boundaries correctly (`P15_23` to `P15_27`).
- Frontdesk pages are reachable (`P15_32`, `P15_33`).

### Multi-clinic roadmap gap tracking (expected `404`, currently PASS)
- `/api/clinics`
- `/api/clinics/current`
- `/api/clinics/switch`
- `/api/clinics/transfer-patient`
- `/api/clinics/analytics`
- `/api/clinic-doctors`
- `/doctor/clinics`
- `/frontdesk/clinics`
- `/patient/clinics`

## Failing Checks

1. `P15_28_unauth_doctors_list_guard`
- Expected `401`, got `500`
- Evidence: `/tmp/phase15_multi_clinic_20260216_083029/P15_28_unauth_doctors_list_guard.json`
- Body: `{"error":"NEXT_REDIRECT"}`

2. `P15_29_patient_doctors_list_forbidden`
- Expected `403`, got `500`
- Evidence: `/tmp/phase15_multi_clinic_20260216_083029/P15_29_patient_doctors_list_forbidden.json`
- Body: `{"error":"NEXT_REDIRECT"}`

3. `P15_30_unauth_slots_guard`
- Expected `401`, got `500`
- Evidence: `/tmp/phase15_multi_clinic_20260216_083029/P15_30_unauth_slots_guard.json`
- Body: `{"error":"NEXT_REDIRECT"}`

4. `P15_31_doctor_slots_forbidden`
- Expected `403`, got `500`
- Evidence: `/tmp/phase15_multi_clinic_20260216_083029/P15_31_doctor_slots_forbidden.json`
- Body: `{"error":"NEXT_REDIRECT"}`

## Root Cause
- API routes still use page-auth helper `requireRole(...)` instead of API-auth helper `requireApiRole(...)`.
- Catch blocks in these routes return generic `500`, so redirect exceptions are not translated to `401/403`.

Affected files:
- `/Users/Suzy/Desktop/medassist/app/api/doctors/list/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/frontdesk/slots/route.ts`

## Phase 15B Fix Applied
- `/Users/Suzy/Desktop/medassist/app/api/doctors/list/route.ts`
  - `requireRole(['doctor', 'frontdesk'])` -> `requireApiRole(['doctor', 'frontdesk'])`
  - Catch handling -> `toApiErrorResponse(error, 'Failed to load doctors')`
- `/Users/Suzy/Desktop/medassist/app/api/frontdesk/slots/route.ts`
  - `requireRole('frontdesk')` -> `requireApiRole('frontdesk')`
  - Catch handling -> `toApiErrorResponse(error, 'Failed to load slots')`

## Static Validation
- `npm run type-check`: `PASS`
- `npm run lint`: `PASS`

## Current Status
- Phase 15 smoke suite established and running.
- Multi-clinic roadmap gaps remain unimplemented by design (tracked).
- Phase 15B auth-contract defects are closed.
- Phase 15 multi-clinic smoke is fully green on current baseline.
