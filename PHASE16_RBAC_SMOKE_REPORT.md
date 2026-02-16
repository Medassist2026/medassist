# Phase 16 RBAC Smoke Report

## Run Summary

### Initial Phase 16 smoke
- Script: `/Users/Suzy/Desktop/medassist/scripts/phase16_rbac_smoke.sh`
- Timestamp: `2026-02-16 08:39:37 PST`
- Artifacts: `/tmp/phase16_rbac_20260216_083859`
- Total: `60`
- Passed: `48`
- Failed: `12`
- Status: `FAIL`

### Assertion-aligned rerun (latest)
- Script: `/Users/Suzy/Desktop/medassist/scripts/phase16_rbac_smoke.sh`
- Timestamp: `2026-02-16 08:40:35 PST`
- Artifacts: `/tmp/phase16_rbac_20260216_084001`
- Total: `60`
- Passed: `49`
- Failed: `11`
- Status: `FAIL`

### Phase 16B retest (latest)
- Script: `/Users/Suzy/Desktop/medassist/scripts/phase16_rbac_smoke.sh`
- Timestamp: `2026-02-16 08:43:48 PST`
- Artifacts: `/tmp/phase16_rbac_20260216_084312`
- Total: `60`
- Passed: `60`
- Failed: `0`
- Status: `PASS`

## Notes on Test Harness
- `P16_08` in initial run failed due an assertion mismatch (`.labOrders` expected while endpoint returns `.orders`).
- Harness was corrected and rerun; this issue is not an app defect.

## Failing Checks (Latest Run)
- `P16_32_unauth_frontdesk_checkin_guard` (`expected 401`, got `500`)
- `P16_33_doctor_frontdesk_checkin_forbidden` (`expected 403`, got `500`)
- `P16_34_unauth_frontdesk_queue_guard` (`expected 401`, got `500`)
- `P16_35_doctor_frontdesk_queue_forbidden` (`expected 403`, got `500`)
- `P16_36_unauth_doctor_availability_guard` (`expected 401`, got `500`)
- `P16_37_patient_doctor_availability_forbidden` (`expected 403`, got `500`)
- `P16_38_frontdesk_doctor_availability_forbidden` (`expected 403`, got `500`)
- `P16_39_unauth_my_patients_guard` (`expected 401`, got `500`)
- `P16_40_frontdesk_my_patients_forbidden` (`expected 403`, got `500`)
- `P16_41_frontdesk_templates_forbidden` (`expected 403`, got `401`)
- `P16_43_frontdesk_clinical_notes_forbidden` (`expected 403`, got `401`)

## Root Cause Mapping

### 1) Redirect-style auth leakage in API routes (`500` + `NEXT_REDIRECT`)
Affected routes:
- `/Users/Suzy/Desktop/medassist/app/api/frontdesk/checkin/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/frontdesk/queue/update/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/doctor/availability/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patients/my-patients/route.ts`

Cause:
- Uses `requireRole(...)` in API handlers and generic `500` catches.
- Redirect exceptions are surfaced as `{"error":"NEXT_REDIRECT"}`.

### 2) Wrong-role semantics collapse into `401` instead of `403`
Affected routes:
- `/Users/Suzy/Desktop/medassist/app/api/templates/current/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/clinical/notes/route.ts`

Cause:
- Manual guard combines unauthenticated and wrong-role checks:
  - `if (!user || user.role !== 'doctor') return 401`

## Passing Coverage Highlights
- Login role mismatch guard works (`403` on wrong declared role).
- Hardened APIs continue to enforce strict boundaries correctly:
  - `/api/doctor/lab-orders`
  - `/api/patient/health-summary`
  - `/api/frontdesk/appointments`
  - `/api/doctors/list`
  - `/api/patients/search`
- Page-level role redirects work as expected for doctor/patient/frontdesk layouts.
- Planned RBAC module/admin endpoints/pages remain explicit roadmap gaps and correctly return expected `404` in smoke.

## Phase 16B Fixes Applied

Updated routes:
- `/Users/Suzy/Desktop/medassist/app/api/frontdesk/checkin/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/frontdesk/queue/update/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/doctor/availability/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patients/my-patients/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/templates/current/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/clinical/notes/route.ts`

Remediation pattern:
- `requireRole(...)` (or manual role checks) -> `requireApiRole(...)`
- Generic catch handlers -> `toApiErrorResponse(...)`

Result:
- All previously failing RBAC/API-contract checks now pass.

## Static Validation
- `npm run type-check`: `PASS`
- `npm run lint`: `PASS`

## Current Status
- Phase 16 smoke suite is operational and reproducible.
- Phase 16B remediation complete.
- Phase 16 RBAC smoke is fully green.
