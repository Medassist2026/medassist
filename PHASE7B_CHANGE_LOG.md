# Phase 7B Change Log

- Date: 2026-02-15 (PST)
- Scope: Fix Phase 7 doctor-clinical smoke failures and close contract gap in prescription print-mark API.

## Baseline

- Baseline smoke run:
  - Script: `/Users/Suzy/Desktop/medassist/scripts/phase7_clinical_smoke.sh`
  - Artifacts: `/tmp/phase7_clinical_smoke_20260215_225856`
  - Result: 20 pass / 2 fail
- Failing checks:
  - `P7_21_unauth_mark_printed_guard` expected `401`, got `500`
  - `P7_22_patient_mark_printed_forbidden` expected `403`, got `500`
- Failure body in both cases: `{"error":"NEXT_REDIRECT"}`

## Root Cause

File: `/Users/Suzy/Desktop/medassist/app/api/clinical/prescription/mark-printed/route.ts`

1. Route used `requireRole('doctor')` (page redirect helper) in API context.
- Redirect exception propagated to catch and was returned as `500`.

2. Route returned `200 success` even when zero rows were updated.
- Cross-doctor update attempts were filtered by `doctor_id`, but response still claimed success.

## Changes Implemented

### 1) API-safe auth semantics for mark-printed route

Updated `/Users/Suzy/Desktop/medassist/app/api/clinical/prescription/mark-printed/route.ts`:
- Import changed:
  - from `requireRole`
  - to `requireApiRole` + `toApiErrorResponse`
- Auth call changed:
  - from `await requireRole('doctor')`
  - to `await requireApiRole('doctor')`
- Catch response changed:
  - from fixed `500` JSON
  - to `toApiErrorResponse(error, 'Failed to mark prescription as printed')`

Reasoning:
- Aligns this endpoint with the API auth contract already hardened in Phase 6.
- Produces correct boundary status codes (`401/403`) instead of redirect leakage.

### 2) Correct update outcome semantics

Updated same file:
- Update query now returns affected row:
  - `.select('id').maybeSingle()`
- Added explicit not-found response:
  - if no row updated -> `404` with `Prescription not found`

Reasoning:
- Prevents false-positive `200 success` for non-owned or nonexistent notes.
- Makes response contract explicit and auditable.

### 3) Smoke suite hardening

Updated `/Users/Suzy/Desktop/medassist/scripts/phase7_clinical_smoke.sh`:
- Added `P7_23_other_doctor_mark_printed_isolated`
  - Scenario: Doctor 2 attempts to mark Doctor 1 note as printed.
  - Expected: `404`.

Reasoning:
- Encodes ownership isolation into repeatable regression coverage.

## Retest Results

- Retest run:
  - Script: `/Users/Suzy/Desktop/medassist/scripts/phase7_clinical_smoke.sh`
  - Artifacts: `/tmp/phase7_clinical_smoke_20260215_231337`
  - Total: 23
  - Passed: 23
  - Failed: 0
  - Status: PASS

Key fixed checks:
- `P7_21_unauth_mark_printed_guard` -> `401` PASS
- `P7_22_patient_mark_printed_forbidden` -> `403` PASS
- `P7_23_other_doctor_mark_printed_isolated` -> `404` PASS

## Static Validation

- `npm run type-check` -> PASS
- `npm run lint` -> PASS (warnings only; no new blocking issues)

## Files Changed

- `/Users/Suzy/Desktop/medassist/app/api/clinical/prescription/mark-printed/route.ts`
- `/Users/Suzy/Desktop/medassist/scripts/phase7_clinical_smoke.sh`
- `/Users/Suzy/Desktop/medassist/PHASE7_CLINICAL_SMOKE_REPORT.md`
- `/Users/Suzy/Desktop/medassist/PHASE7B_CHANGE_LOG.md`
