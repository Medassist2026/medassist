# Phase 4 Frontdesk Core Journey Smoke Report

- Date: 2026-02-15 21:50 PST
- Environment:
  - App: `next dev` on `http://localhost:3001`
  - Database: Supabase (configured via `.env.local`)
- Scope (frontdesk core journey):
  - Frontdesk auth entry
  - Frontdesk page reachability
  - Core frontdesk APIs: doctor list, patient lookup, slots, appointment create, check-in, queue update, payment create
  - Walk-in onboarding path sanity

Evidence bundle:
- `/tmp/phase4_frontdesk_20260215_215047/summary.txt`
- `/tmp/phase4_frontdesk_20260215_215047/*.json`
- extra probes:
  - `/tmp/phase4_frontdesk_20260215_215047/api_patients_onboard_frontdesk.json`
  - `/tmp/phase4_frontdesk_20260215_215047/api_doctors_list_doctor_cookie.json`
  - `/tmp/phase4_frontdesk_20260215_215047/api_doctors_list_no_cookie.json`

## Execution Summary

- Total checks executed: 23
- Passed: 17
- Failed: 6
- Overall Phase 4 (Frontdesk core): `FAIL`

## Smoke Matrix

| ID | Check | Result | Evidence |
|---|---|---|---|
| F-01 | Register frontdesk account | PASS | `/tmp/phase4_frontdesk_20260215_215047/register_frontdesk.json` (`200`) |
| F-02 | Register doctor account (test data) | PASS | `/tmp/phase4_frontdesk_20260215_215047/register_doctor.json` (`200`) |
| F-03 | Register patient account (test data) | PASS | `/tmp/phase4_frontdesk_20260215_215047/register_patient.json` (`200`) |
| F-04 | Frontdesk login | PASS | `/tmp/phase4_frontdesk_20260215_215047/login_frontdesk.json` (`200`) |
| F-05 | Page `/frontdesk/dashboard` | PASS | `/tmp/phase4_frontdesk_20260215_215047/page_frontdesk_dashboard.json` (`200`) |
| F-06 | Page `/frontdesk/checkin` | PASS | `/tmp/phase4_frontdesk_20260215_215047/page_frontdesk_checkin.json` (`200`) |
| F-07 | Page `/frontdesk/appointments/new` | PASS | `/tmp/phase4_frontdesk_20260215_215047/page_frontdesk_appointments_new.json` (`200`) |
| F-08 | Page `/frontdesk/payments/new` | PASS | `/tmp/phase4_frontdesk_20260215_215047/page_frontdesk_payments_new.json` (`200`) |
| F-09 | Page `/frontdesk/patients/register` (linked from dashboard/checkin) | FAIL | `/tmp/phase4_frontdesk_20260215_215047/page_frontdesk_patients_register.json` (`404`) |
| F-10 | `GET /api/doctors/list` as frontdesk should return selectable doctors | FAIL | `/tmp/phase4_frontdesk_20260215_215047/api_doctors_list.json` (`200` but `doctors: []`) |
| F-11 | `GET /api/patients/search?q=Phase4` should find created patient | FAIL | `/tmp/phase4_frontdesk_20260215_215047/api_patients_search_by_name.json` (`200` but empty) |
| F-12 | `GET /api/patients/search?q=<phone-fragment>` should find created patient | FAIL | `/tmp/phase4_frontdesk_20260215_215047/api_patients_search_by_phone.json` (`200` but empty) |
| F-13 | `GET /api/frontdesk/slots` missing params validation | PASS* | `/tmp/phase4_frontdesk_20260215_215047/api_slots_missing_params.json` (`400` expected) |
| F-14 | `GET /api/frontdesk/slots?doctorId=...&date=...` | PASS | `/tmp/phase4_frontdesk_20260215_215047/api_slots_with_doctor_date.json` (`200`, returned empty slots) |
| F-15 | `POST /api/frontdesk/appointments/create` | PASS | `/tmp/phase4_frontdesk_20260215_215047/api_appointments_create.json` (`200`) |
| F-16 | `POST /api/frontdesk/checkin` missing required fields validation | PASS* | `/tmp/phase4_frontdesk_20260215_215047/api_checkin_missing_fields.json` (`400` expected) |
| F-17 | `POST /api/frontdesk/checkin` valid payload | PASS | `/tmp/phase4_frontdesk_20260215_215047/api_checkin_create.json` (`200`) |
| F-18 | `POST /api/frontdesk/queue/update` to `in_progress` | PASS | `/tmp/phase4_frontdesk_20260215_215047/api_queue_update_in_progress.json` (`200`) |
| F-19 | `POST /api/frontdesk/queue/update` to `completed` | PASS | `/tmp/phase4_frontdesk_20260215_215047/api_queue_update_completed.json` (`200`) |
| F-20 | `POST /api/frontdesk/payments/create` valid payload | PASS | `/tmp/phase4_frontdesk_20260215_215047/api_payments_create.json` (`200`) |
| F-21 | `POST /api/frontdesk/payments/create` missing required fields validation | PASS* | `/tmp/phase4_frontdesk_20260215_215047/api_payments_missing_fields.json` (`400` expected) |
| F-22 | Frontdesk appointment list via available route (`GET /api/doctor/appointments`) | FAIL | `/tmp/phase4_frontdesk_20260215_215047/api_doctor_appointments.json` (`500`) |
| F-23 | Walk-in onboarding (`POST /api/patients/onboard`) as frontdesk | FAIL | `/tmp/phase4_frontdesk_20260215_215047/api_patients_onboard_frontdesk.json` (`500`, FK error) |

## Confirmed Root Causes

1. Frontdesk cannot read doctors, blocking doctor pickers in check-in/booking/payment forms
- Files:
  - `app/api/doctors/list/route.ts:8`
  - `supabase/migrations/001_initial_schema.sql:242`
  - `supabase/migrations/006_front_desk_module.sql:114`
- Detail:
  - Doctors table has only "doctor can read own profile" policy.
  - Frontdesk policy additions in migration 006 cover patients/appointments/payments/queue, but not doctors.
  - Result: frontdesk gets `200` with empty `doctors` array; doctor dropdowns are unusable.

2. Frontdesk patient search uses doctor-scoped relationship query
- Files:
  - `app/api/patients/search/route.ts:29`
  - `lib/data/patients.ts:607`
- Detail:
  - Route allows frontdesk role but calls `searchMyPatients(user.id, ...)` which is explicitly doctor-relationship scoped.
  - For frontdesk `user.id` (not a doctor id), query returns no relationships, therefore empty results.
  - Result: search appears successful (`200`) but cannot find patients.

3. Frontdesk walk-in onboarding path fails with doctor FK constraint
- Files:
  - `app/api/patients/onboard/route.ts:102`
  - `lib/data/patients.ts:421`
- Detail:
  - Onboard route passes `user.id` as `doctorId` for both doctor and frontdesk users.
  - `createWalkInPatient` writes `patients.created_by_doctor_id = doctorId`.
  - For frontdesk users this violates doctor FK in deployed DB.
  - Runtime evidence: `Failed to create patient ... patients_created_by_doctor_id_fkey`.

4. Frontdesk UI links to a non-existent registration page
- Files:
  - `app/(frontdesk)/frontdesk/dashboard/page.tsx:91`
  - `components/frontdesk/CheckInForm.tsx:253`
- Detail:
  - Both link/push to `/frontdesk/patients/register`, but no matching route exists under `app/(frontdesk)/frontdesk/...`.
  - Result: hard 404 on "Register Patient" action.

5. No frontdesk-safe appointments listing endpoint in current route set
- File:
  - `app/api/doctor/appointments/route.ts:15`
- Detail:
  - Existing list route is doctor-only via `requireRole('doctor')`; frontdesk receives `500` in current call path.
  - Frontdesk can create appointments but lacks a corresponding route for role-appropriate retrieval from API layer.

## Additional Notes

- `api_slots_with_doctor_date` returned no slots for newly created doctor. This is expected in this run because no availability rows existed for that new doctor.
- `api_checkin_create` returned `doctor: null` in joined payload, consistent with missing frontdesk read access on doctors.

## Proposed Fix Plan (Approval Required Before Code Changes)

1. Fix doctor visibility for frontdesk.
- Add explicit frontdesk SELECT access for doctors (policy and/or role-guarded admin-backed API route).

2. Split patient search behavior by role.
- Keep doctor privacy behavior for doctors.
- Add frontdesk path that searches patients per frontdesk permissions (clinic-scoped or all, based on product decision).

3. Repair walk-in onboarding for frontdesk.
- Do not pass frontdesk user id as `doctorId` into patient creation.
- Add explicit selected/assigned doctor id for frontdesk-created walk-ins, or make `created_by_doctor_id` nullable/optional path when created by frontdesk.

4. Implement missing patient registration page/flow.
- Create `/frontdesk/patients/register` UI route and wire to working onboarding endpoint.

5. Add frontdesk-compatible appointments listing API.
- Provide `/api/frontdesk/appointments` (or equivalent) with frontdesk role check and clinic-appropriate scope.

6. Harden frontdesk API role checks.
- Add `requireRole('frontdesk')` (or explicit allowed roles) to all `/api/frontdesk/*` handlers for consistent 401/403 behavior instead of downstream RLS 500s.

## Remediation Retest (Post-Fix)

- Retest timestamp: 2026-02-15 21:58 PST
- Evidence bundle: `/tmp/phase4b_frontdesk_20260215_215849/`
- Queue payload hardening probe: `/tmp/phase4c_queue_doctor_20260215_220024/checkin.json`
- Status: `PASS`

Retest counts:
- Total checks: 23
- Passed: 23
- Failed: 0

Validated outcomes:
- `/frontdesk/patients/register` now reachable (`200`).
- Frontdesk doctor list populated (`/api/doctors/list` non-empty list).
- Frontdesk patient search returns matches by name and phone.
- Frontdesk onboarding works with explicit doctor assignment (`201` success).
- Frontdesk appointments listing route available (`/api/frontdesk/appointments`, `200`).
- Frontdesk queue/check-in payload now includes doctor details (no null doctor object).
