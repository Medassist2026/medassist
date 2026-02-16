# Phase 2 Doctor Core Journey Smoke Report

- Date: 2026-02-15 20:50 PST
- Environment:
  - App: `next dev` on `http://localhost:3001`
  - Database: Supabase (configured via `.env.local`)
- Scope (doctor-first core journey):
  - Auth entry
  - Doctor dashboard/pages reachability
  - Appointments/schedule APIs
  - Patient onboarding/search
  - Clinical note save + prescription fetch
  - Messaging APIs
  - Lab orders APIs

## Execution Summary

- Total checks executed: 21
- Passed: 10
- Failed: 11
- Overall Phase 2 (Doctor core): `FAIL` (multiple blocking backend issues)

## Smoke Matrix

| ID | Check | Result | Evidence |
|---|---|---|---|
| D-01 | Register doctor account | PASS | `/tmp/phase2_doctor_register_http.txt` (`200`, `success:true`) |
| D-02 | Login existing doctor (phone) | FAIL | `/tmp/login_phone.json` (`404`, `User not found`) |
| D-03 | Login existing doctor (email) | FAIL | `/tmp/login_email.json` (`404`, `User not found`) |
| D-04 | Doctor pages load (`/doctor/dashboard`, `/doctor/session`, `/doctor/patients`, `/doctor/schedule`, `/doctor/messages`, `/doctor/lab-orders`) | PASS | `/tmp/phase2_page_checks.txt` (all `200`) |
| D-05 | `/api/doctor/appointments` | FAIL | `/tmp/api_appointments.json` (`500`, failed fetch) |
| D-06 | `/api/doctor/availability` GET | PASS | `/tmp/api_availability_get.json` (`200`) |
| D-07 | `/api/doctor/availability` POST | FAIL | `/tmp/api_availability_post.json` (`500`) |
| D-08 | `/api/doctor/messages/conversations` | FAIL | `/tmp/api_messages_conv.json` (`500`, schema relationship error) |
| D-09 | `/api/doctor/messages?patientId=...` | FAIL | `/tmp/api_doctor_messages_get.json` (`500`, `messages.doctor_id` missing) |
| D-10 | `/api/doctor/messages` POST | FAIL | `/tmp/api_doctor_messages_post.json` (`500`, `doctor_id` column missing) |
| D-11 | `/api/clinical/lab-tests` | PASS | `/tmp/api_lab_tests.json` (`200`, 22 tests) |
| D-12 | `/api/doctor/lab-orders` | FAIL | `/tmp/api_lab_orders.json` (`500`, `patients.date_of_birth` missing) |
| D-13 | `/api/doctor/patients` before note | PASS | `/tmp/api_doctor_patients_before.json` (`200`, empty list) |
| D-14 | Create patient with UI-shaped payload (`full_name`, `date_of_birth`, lowercase `sex`) | FAIL | `/tmp/api_patients_create_ui_payload.json` (`400`) |
| D-15 | Create patient with route-shaped payload (`fullName`, `age`, `sex`) | PASS | `/tmp/api_patients_create_valid.json` (`200`) |
| D-16 | Search newly created patient `/api/patients/search` | FAIL | `/tmp/api_patients_search.json` (`200` + empty result) |
| D-17 | Save note with empty diagnosis (UI says optional) | FAIL | `/tmp/api_note_empty_diagnosis.json` (`400`, diagnosis required) |
| D-18 | Save note with meds + `syncToPatient=true` | FAIL | `/tmp/api_note_with_meds_sync_true.json` (`500`, medication_reminders RLS) |
| D-19 | Save note with diagnosis + no reminders | PASS | `/tmp/api_note_success.json` (`200`, note created) |
| D-20 | Fetch prescription `/api/clinical/prescription?noteId=...` | PASS* | `/tmp/api_prescription.json` (`200`, but `patient:null`) |
| D-21 | Doctor patients API after note exists | FAIL | `/tmp/api_doctor_patients_after.json` (`500`, missing patient columns) |

## Confirmed Root Causes

1. Login path blocked by RLS lookup before auth
- File: `app/api/auth/login/route.ts:20`
- Detail: API queries `public.users` before successful auth (`.from('users').select...`), but unauthenticated clients cannot read `users` by policy.
- Runtime symptom: valid users return `404 User not found`.

2. Appointments/patients/lab-orders use non-existent patient columns
- Files:
  - `app/api/doctor/appointments/route.ts:36`
  - `app/api/doctor/patients/route.ts:37`
  - `lib/data/clinical.ts:373`
  - `lib/data/clinical.ts:403`
- Detail: code expects `patients.date_of_birth` (and `blood_type`) but schema provides `age`/`sex` demographics.
- Schema reference: `supabase/migrations/004_add_patient_demographics.sql:5`.

3. Doctor availability API contract mismatched with DB table shape
- File: `app/api/doctor/availability/route.ts:72`
- Detail: API reads/writes JSON column `availability`, but schema uses row-based fields (`day_of_week`, `start_time`, `end_time`, `slot_duration_minutes`).
- Schema reference: `supabase/migrations/006_front_desk_module.sql:25`.

4. Messaging APIs are out of sync with current message schema
- Files:
  - `app/api/doctor/messages/conversations/route.ts:14`
  - `app/api/doctor/messages/route.ts:19`
- Detail: routes query `messages.doctor_id/patient_id` and relational `patient:patients(...)`; DB no longer matches this shape (runtime errors for missing columns/relations).
- Schema refs:
  - Legacy: `supabase/migrations/001_initial_schema.sql:151`
  - Newer: `supabase/migrations/011_phase11_messaging_sharing.sql:33`

5. Clinical session UI/API contract mismatch for diagnosis
- Files:
  - UI: `app/(doctor)/doctor/session/page.tsx:79` (diagnosis marked optional)
  - API: `app/api/clinical/notes/route.ts:34` (diagnosis required)
- Runtime symptom: UI-allowed empty diagnosis fails save with `400`.

6. Medication sync fails due missing INSERT policy on reminders
- Files:
  - `app/api/clinical/notes/route.ts:52`
  - `supabase/migrations/001_initial_schema.sql:309` (no INSERT policy for doctors on `medication_reminders`)
- Runtime symptom: `500` RLS error when `syncToPatient=true` and medications exist.

7. Doctor patients page uses endpoints that do not exist
- File: `app/(doctor)/doctor/patients/page.tsx:85`
- Detail: UI calls `/api/doctor/patients/search`, `/api/doctor/patients/add`, `/api/doctor/patients/create`; these routes are absent (404).

8. Walk-in creation flow returns success even if relationship insert fails
- File: `lib/data/patients.ts:445`
- Detail: relationship insert error is not checked; function returns success regardless.
- Additional mismatch: code uses `access_type`, while migration set uses `status`/`relationship_type` variants.
- Result: patient created, but doctor relationship may be missing; search returns empty.

9. Walk-in UI payload does not match `/api/patients/create` contract
- Files:
  - UI payload: `components/clinical/PatientSelector.tsx:325`
  - API contract: `app/api/patients/create/route.ts:10`
- Detail: UI sends `full_name/date_of_birth/sex:male|female`; API expects `fullName/age/sex:Male|Female|Other`.

## Notes

- No application source code was modified during this phase.
- Evidence artifacts are in `/tmp`:
  - `/tmp/phase2_doctor_smoke_raw.txt`
  - `/tmp/phase2_page_checks.txt`
  - `/tmp/api_*`
  - `/tmp/login_*`

## Proposed Fix Plan (Approval Required Before Code Changes)

1. Fix authentication login flow to authenticate first, then resolve role safely.
2. Align doctor appointments/patients/lab-orders queries with actual patient schema (`age`/`sex`, remove `date_of_birth`/`blood_type` assumptions).
3. Refactor doctor availability API to table-native format (row-per-day-slot) or add migration for JSON model; pick one and standardize.
4. Reconcile messaging implementation with chosen schema version (legacy `messages` or `conversations + messages` model) and update all doctor routes/pages consistently.
5. Make diagnosis requirement consistent (either enforce in UI or relax API).
6. Add proper medication reminder insert permission path (policy or privileged write path) for doctor-triggered reminder creation.
7. Fix doctor patient onboarding/search integration:
  - point UI to existing endpoints or add missing `/api/doctor/patients/*` routes,
  - unify payload naming/casing,
  - enforce error handling for relationship insert in `createWalkInPatient`.

## Remediation Retest (Post-Fix)

- Retest timestamp: 2026-02-15 21:09 PST
- Evidence file: `/tmp/phase2c_doctor_smoke_summary.txt`
- Status: `PASS`
- Result summary:
  - Auth checks: PASS (`200/200`)
  - Doctor pages: PASS (all major doctor routes `200`)
  - Doctor APIs: PASS (`appointments`, `availability`, `lab-tests`, `lab-orders`, `doctor/patients`)
  - Create/Search flows: PASS (`/api/patients/create`, `/api/patients/search`, `/api/doctor/patients/search`)
  - Clinical + prescription: PASS (empty diagnosis save, sync-to-patient with meds, prescription API/page)
  - Messaging: PASS (`/api/doctor/messages` GET/POST + conversations)
  - Doctor patient subroutes: PASS (`/api/doctor/patients/create`, `/api/doctor/patients/add`, `/api/doctor/patients`)
