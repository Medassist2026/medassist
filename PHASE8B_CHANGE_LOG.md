# Phase 8B Change Log

- Date: 2026-02-15 (PST)
- Scope: Remediate Phase 8 smoke failures for patient empowerment APIs and rerun full suite.

## Baseline

- Initial run:
  - Script: `/Users/Suzy/Desktop/medassist/scripts/phase8_patient_empowerment_smoke.sh`
  - Artifacts: `/tmp/phase8_patient_empowerment_20260215_232122`
  - Result: 20 pass / 13 fail

Failure clusters:
1. 12 routes returned `500` with `NEXT_REDIRECT` for unauth/wrong-role boundary tests.
2. `/api/medications/update-status` returned `401` for authenticated non-patient role (expected `403`).
3. `/api/patient/lab-results` used invalid column `patients.user_id`.

## Changes Implemented

### 1) API-safe auth semantics for patient empowerment routes

Updated routes:
- `/Users/Suzy/Desktop/medassist/app/api/patient/health-summary/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/medication-reminders/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/medications/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/notes/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/diary/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/lab-results/route.ts`

Edits:
- Replaced `requireRole('patient')` with `requireApiRole('patient')`.
- Replaced generic error handlers with `toApiErrorResponse(error, fallbackMessage)`.
- In diary route, DB query errors now throw into unified handler (instead of hardcoded generic `500` body), preserving auth semantics.

Reasoning:
- API routes must emit HTTP auth semantics (`401/403`) instead of redirect exceptions mapped to `500`.
- Keeps response contracts consistent with Phase 6/7B hardening pattern.

### 2) Correct role semantics in medication reminder status update

Updated route:
- `/Users/Suzy/Desktop/medassist/app/api/medications/update-status/route.ts`

Edits:
- Replaced `getCurrentUser()` check with `requireApiAuth()`.
- Added explicit role gate:
  - non-patient authenticated users -> `403 Forbidden`
- Switched catch block to `toApiErrorResponse(...)`.

Reasoning:
- Distinguish unauthenticated (`401`) from authenticated-but-forbidden (`403`) for cleaner security semantics.

### 3) Fix patient lookup key in lab results route

Updated route:
- `/Users/Suzy/Desktop/medassist/app/api/patient/lab-results/route.ts`

Edits:
- Changed patient lookup from `.eq('user_id', user.id)` to `.eq('id', user.id)`.
- Added `patientError` handling (`throw` on query error).

Reasoning:
- `patients.user_id` does not exist in project schema.
- `patients.id` maps to auth user id by design; this prevents silent data masking and invalid SQL errors.

## Retest Results

- Retest run:
  - Script: `/Users/Suzy/Desktop/medassist/scripts/phase8_patient_empowerment_smoke.sh`
  - Artifacts: `/tmp/phase8_patient_empowerment_20260215_232457`
  - Total: 33
  - Passed: 33
  - Failed: 0
  - Status: PASS

Boundary checks now correct:
- Unauthenticated patient endpoints -> `401`
- Wrong-role endpoints -> `403`

## Static Validation

- `npm run type-check` -> PASS
- `npm run lint` -> PASS (warnings only, no new blocking issues)

## Files Changed

- `/Users/Suzy/Desktop/medassist/app/api/patient/health-summary/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/medication-reminders/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/medications/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/notes/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/diary/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/patient/lab-results/route.ts`
- `/Users/Suzy/Desktop/medassist/app/api/medications/update-status/route.ts`
- `/Users/Suzy/Desktop/medassist/PHASE8_PATIENT_EMPOWERMENT_SMOKE_REPORT.md`
- `/Users/Suzy/Desktop/medassist/PHASE8B_CHANGE_LOG.md`
