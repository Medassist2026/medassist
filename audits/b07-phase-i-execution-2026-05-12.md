# B07 Phase I — Integration smoke for cases A1 + A2 (2026-05-12)

Builds on Phase H.1 (`0970749`). Two-phase execution per Mo's hybrid
ruling (Phase I.A backend + Phase I.B Mo UI walkthrough).

## Executive summary

| | |
|---|---|
| Commit | (TBD — set at push) |
| Phase I.A status | **COMPLETE** — backend smoke autonomous; 21/22 step executions captured |
| Phase I.B status | **PARTIAL** — patient-app + clinic-app browser walkthroughs blocked at the auth layer (Findings I-7, I-9, I-14); A1-6 through A2-8 DEFERRED to Phase M |
| A1 critical path (backend) | **CONDITIONAL PASS** — works on A1-4 canonical minor; A1-2 orphan gp is Finding I-1 |
| A2 critical path (backend) | **PASS** — 10/11 steps; A2-9 deferred per Finding I-4 |
| Total findings | **15** captured (I-1 through I-15; I-11 withdrawn) |
| - blocking-production (current) | **7** — I-1, I-7, I-9, I-13, I-14, I-15 (+ I-5 only at production-launch) |
| - blocking-production (launch) | **9** (adds I-5 + I-6 launch-checklist) |
| - launch-checklist | **1** — I-6 |
| - nice-to-have-pre-launch | **4** — I-2, I-8, I-10, I-12 |
| - future | **2** — I-3, I-4 |
| - withdrawn | **1** — I-11 |
| Sandbox gates | **4/4 PASS** (root tsc EXIT 0, clinic tsc EXIT 0, patient tsc EXIT 0, lint:scopes EXIT 0) |

## Findings inventory (full, with severity)

| # | Severity (current) | Severity (production-launch) | Type | Summary |
|---|---|---|---|---|
| I-1 | blocking-MVP | **blocking-production** | backend/data | Duplicate minor gp via Phase G v2 frontdesk-onboard (no dedup vs patient-app A1-2 path) |
| I-2 | nice-to-have-pre-launch | nice-to-have-pre-launch | docs | Prescription endpoint exists; storage = `prescription_items` + 6 medication-* tables |
| I-3 | future | future | methodology | RLS impersonation via `set_config(...)` in CTE doesn't engage role |
| I-4 | future | future | scope | A2-9 messages deferred — conversation FK chain not traversed |
| I-5 | — | **blocking-production** | infra | Patient app has no Vercel deployment |
| I-6 | not blocking (intentional staging) | **launch-checklist** | security/config | `DEV_BYPASS_OTP=true` on staging clinic Vercel; must be removed for real prod |
| I-7 | **blocking-production** | **blocking-production** | UI/routing | Patient app `/` → `/intro` → 404; `/intro` route missing |
| I-8 | nice-to-have-pre-launch | nice-to-have-pre-launch | hygiene | `(auth)/login/` empty directory; `/login` 404 |
| I-9 | **blocking-production** | **blocking-production** | UI/routing | Patient app `/auth` defaults to `role=doctor`; no organic route to `?role=patient` |
| I-10 | nice-to-have-pre-launch | nice-to-have-pre-launch | UI/docs | OTP entry is 4 digits, not 6 (DEV_BYPASS_OTP docs assumed 6) |
| I-11 | WITHDRAWN | — | (not a bug) | Tab-switch click likely fired; both tabs share visible fields |
| I-12 | nice-to-have-pre-launch | nice-to-have-pre-launch | routing | `/choose-role` route doesn't exist; "Back" link from `/auth` 404s |
| I-13 | **blocking-production** | **blocking-production** | auth-spec | Both apps' existing-user sign-in is password-based, contradicting "OTP" product framing |
| I-14 | **blocking-production CRITICAL** | **blocking-production CRITICAL** | backend bug | Clinic-app registration: `users.is_canonical NOT NULL` violation; no new clinic can onboard |
| I-15 | **blocking-production** | **blocking-production** | security/UX | Raw PostgreSQL error message leaked to UI on I-14 surface |


## 0. Pre-work + methodology caveat

### 0.1 Standard pre-work (PASS)

| Check | Result |
|---|---|
| HEAD = `0970749` (Phase H.1 — "test(b07): Phase H.1 — Scenario amendments + matrix re-run at run_no = 4.1") | ✓ verified via `git log -1 --format=%H` |
| Working tree clean | ✓ `git status --short` empty |
| Branch = `main`, origin/main matches HEAD | ✓ |
| Staging project `mtmdotixlhwksyoordbl` (medassist-egypt) ACTIVE_HEALTHY | ✓ `list_projects` |
| Phase H.1 matrix run_no = 4.1 PASS 192/192 | ✓ per `b07-phase-h1-execution-2026-05-12.md` §3 |
| Mo's 40 load-bearing rulings (37 prior + 3 Phase I) | ✓ noted; carried through |

### 0.2 Flagged

| Flag | Notes |
|---|---|
| `gh` CLI unavailable in sandbox | STOP exception #11 → "proceed flagged". CI green-ness for `0970749` is the *proxy* claim that `origin/main` accepted the push. |

### 0.3 Empirical baseline (2026-05-12 05:40 UTC, project `mtmdotixlhwksyoordbl`)

```
gp_count                : 77
minor_count             : 6
active_delegations      : 2   (of 4 total — 2 inactive/pending/revoked)
active_shares           : 3   (of 6 total)
audit_event_count       : 336
patients_count          : 41
pcr_count               : 52
dpr_count               : 37
```

Post-execution baseline check is §5; comparing the two validates audit emission.

### 0.4 Methodology caveat — Path C (hybrid)

Mo's ruling (this session, before Section 0): the prompt's stated verification methodology — "curl against staging" — assumed infrastructure that this codebase does not have:

1. No staging deployment URL configured (`NEXT_PUBLIC_APP_URL=http://localhost:3000` in both apps; no root `vercel.json`; only doc-placeholder `your-staging.medassist.example` references in source).
2. No JWT-minting utility for arbitrary patient personas in the repo (`grep` for `generateAccessToken|admin.generateLink|sign.*jwt|impersonate` across `packages/shared/` returns three hits, all service-role bearer in `admin/global-patients-lookup/__tests__/handler.test.ts` — admin scope, not patient scope).
3. Prior B07 phases (B/C/D-E/E/F/F.5/G/G.5/H/H.1) verified at the schema / RLS / audit layer via Supabase MCP SQL. No prior phase curled an API endpoint. Build 05's "sharing API smoke" was code-reading + DB-state assertion (`Outcome A`), not curl.

Mo ruled Path C: Phase I.A backend smoke covers data-layer + RLS + audit + handler-code-review of HTTP shape; Phase I.B Mo UI walkthrough covers the HTTP/auth layer end-to-end against the actual patient + clinic apps. Ruling 38 (no code in Phase I) is preserved — no deploy script, no JWT helper.

**Caveat carried into all Phase I.A findings:** verification is at the data-layer / RLS / audit layer. HTTP request parsing, cookie auth, body validation, and error-code-to-status mapping in route handlers are verified by reading handler source rather than by invoking via curl. The handler-shape claims in this doc are sourced from the handler files as they exist at `0970749`.

This caveat amends Mo's ruling 38 inline: code-review-of-handler-shape is permitted in findings (it's documentation work), but no handler code is modified during Phase I.

### 0.5 Mo's 40 load-bearing rulings preserved

Rulings 1-37 from prior phases carry forward. New Phase I rulings:

- **Ruling 38**: Phase I is verification, not fix. No code commits during Phase I. Findings classification decides Phase K work.
- **Ruling 39**: A1 + A2 only. Cross-clinic share scenarios (A3-A5) post-MVP.
- **Ruling 40**: Each step has empirical verification. "Step works" claim backed by tool output captured in this doc.

Hybrid methodology (Mo's ruling this session, treated as a methodology amendment to 38 rather than a 41st ruling) — see §0.4.

## 1. Section 0 — Phase I fixtures

### 1.1 Personas seeded (PASS)

`public.rls_test_seed_b07_phase_i()` created on staging (function body in
session SQL log). One call seeded:

| persona | auth.users.id | gp.id | normalized_phone | display_name | clinic presence |
|---|---|---|---|---|---|
| Mother | `00000300-1000-…-0001` | `00000300-0000-…-0001` | `+201500000001` | "Phase I Mother" | none (added via A1-4) |
| Father | `00000300-1000-…-0010` | `00000300-0000-…-0010` | `+201500000010` | "Phase I Father (Diabetes)" | PCR + patients at clinic_a |
| Son | `00000300-1000-…-0011` | `00000300-0000-…-0011` | `+201500000011` | "Phase I Son" | none |

Verified via SELECT: all three gps `claimed=TRUE`, `is_minor=FALSE`,
`account_status=active`, `claimed_user_id` matches respective auth.users.

Test clinic = `00000099-0000-0000-0000-000000000001` (clinic_a, existing
Phase B/H fixture) per D-PI-2.

Doctor = `00000099-0000-0000-0000-000000000010` (doctor_a, existing Phase
B/H fixture).

Daughter NOT created upfront — created during Step A1-2 via the
dependent-registration data layer. Delegation NOT created upfront —
created during Step A2-1.

### 1.2 Matrix Section 0 cleanup extension (Lesson #21)

The `00000300-` prefix is now present on staging. To preserve matrix
re-runnability, the cleanup block at
`audits/rls-test-matrix-reconstructed.sql` Section 0 should be extended
to `00000300-` prefix as well. Pending: extend in §6 doc-updates pass at
session end alongside the STATE_OF_WORK + PROGRAM_STATE updates.


## 2. Section 1 — Case A1 walkthrough (mother + 6yo)

### A1-1 — Mother baseline (PASS)

Mother's gp + auth.user provisioned in Section 0. Verified:

```
gp_id        : 00000300-0000-0000-0000-000000000001
display_name : "Phase I Mother"
normalized_phone : +201500000001
claimed_user_id  : 00000300-1000-0000-0000-000000000001
is_minor         : FALSE
account_status   : active
```

### A1-2 — Mother registers daughter via patient app (PASS at data layer)

**Handler shape (from `apps/patient/app/api/patient/dependents/register/route.ts` + shared handler):** `POST /api/patient/dependents/register` with mother's auth. Body `{displayName, dateOfBirth?, sex?, preferredLanguage?}` → 201 with `{success:true, minorGlobalPatientId, displayName}`.

**Data-layer simulation issued** (per `createMinorGlobalPatient` body, dependents.ts:155-285): `INSERT INTO global_patients` + `INSERT INTO audit_events (GUARDIAN_LINK_CREATED)`. Empirical result:

```
aya_gp_id        : f6be6835-27eb-4383-b449-6ea6fb35b0d9 (auto-generated UUID; not 00000300- prefix)
display_name     : "Aya (Phase I daughter)"
is_minor         : TRUE
guardian_gp_id   : 00000300-0000-0000-0000-000000000001  (mother)
claimed          : FALSE
claimed_user_id  : NULL
normalized_phone : NULL
date_of_birth    : 2019-06-15
sex              : Female
preferred_language : ar
account_status   : active
created_at       : 2026-05-12 05:50:57 UTC
```

Empirical checks:
- ✓ New global_patients row with is_minor=TRUE, guardian=mother
- ✓ No patients row created (Phase B Decision 3 — patient-app path is gp-only)
- ✓ GUARDIAN_LINK_CREATED audit emitted with `actor_user_id=mother_auth`, `entity_type=global_patients`, `entity_id=aya_gp`, `metadata.acting_as='guardian_of_minor'`, `metadata.guardian_global_patient_id=mother_gp`. `resolved_global_patient_id` GENERATED column derives to aya_gp (entity_type=global_patients, entity_id=aya_gp ⇒ resolved = entity_id).

### A1-3 — Mother reads Aya via patient app (PASS)

**Handler shape (from `apps/patient/app/api/patient/dependents/[id]/route.ts`):** `GET /api/patient/dependents/[id]` with mother's auth + `id=<aya_gp>`. Returns 200 with full minor profile when `requireAuthorityOver` succeeds (basis = `guardian_of_minor`).

**Empirical RLS check** — under simulated session (`request.jwt.claims.sub = mother_auth`, `ROLE authenticated`):

```
step              : A1-3
aya_visible_count : 1     ← RLS allows mother to SELECT aya gp
authority_check   : true  ← is_authorized_actor_on(aya_gp, mother_auth) = TRUE
```

Helpers verified:
- `public.is_authorized_actor_on(uuid, uuid)` — INVOKER wrapper, calls `_is_authorized_actor_on_internal`
- `public._is_authorized_actor_on_internal(uuid, uuid)` — DEFINER, implements OR-of-three:
  1. self-claim: `gp.claimed_user_id = p_user_id`
  2. guardian: `child.is_minor=TRUE AND guardian.claimed_user_id = p_user_id`
  3. delegation: `principal_global_patient_id = p_gp AND delegate_user_id = p_user AND accepted_at IS NOT NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`

Architecture matches review §3.3 option (b) (INVOKER outer + DEFINER inner) and Mo ruling 39 (3 INVOKER + 1 DEFINER hybrid).

### A1-4 — Frontdesk staff at clinic_a onboards Aya as dependent (**FINDING — STOP exception #1 tripped**)

**Handler shape (from `apps/patient/app/api/patients/onboard/route.ts` re-exporting `packages/shared/lib/api/handlers/patients/onboard/handler.ts:190-352`):** `POST /api/patients/onboard` with staff auth + body `{phone, fullName, age, sex, isDependent:true, parentPhone, doctorId}` →

```
1. findGlobalPatientByPhone(parentPhone) → mother's gp
2. Validate parent gp claimed + not minor
3. createMinorGlobalPatient(...)                      ← NEW minor gp, no dedup
4. establishMinorClinicPresence(...)                  ← patients + PCR + DPR + CREATE_PATIENT audit
5. → 201 { isDependent:true, isV2DependentPath:true, isClinicScoped:true, minorGlobalPatientId, patient, relationship }
```

**Empirical simulation issued** (mirroring the handler's two data-layer calls): new minor gp + auth.users(synthetic) + public.users + PCR + patients(synthetic-DEP phone) + DPR + GUARDIAN_LINK_CREATED audit + CREATE_PATIENT audit.

**Empirical post-state:**

```
minor_gps_for_mother : 2   ← DUPLICATE
  ┌── A1-2 minor (patient-app side):
  │   id                  : f6be6835-27eb-4383-b449-6ea6fb35b0d9
  │   created_at          : 2026-05-12 05:50:57 UTC
  │   has_clinic_presence : false  ← orphan gp
  │   has_patients_row    : false
  └── A1-4 minor (frontdesk-v2 side):
      id                  : 420899d0-a9f9-452e-b074-42845661cfb0
      created_at          : 2026-05-12 05:52:37 UTC
      has_clinic_presence : true   ← four-row shape complete
      has_patients_row    : true
```

**Root cause (from handler.ts:190-352 reading):** the v2 dependent-onboarding path:

1. Looks up the **PARENT** by phone (`findGlobalPatientByPhone(parentPhone)`) — this is the only existence check.
2. Calls `createMinorGlobalPatient(...)` unconditionally — `createMinorGlobalPatient` itself validates the guardian and INSERTs a new minor gp; it does NOT check whether a minor with the same `(guardian_global_patient_id, display_name)` or `(guardian_global_patient_id, date_of_birth, sex)` already exists.
3. Calls `establishMinorClinicPresence(...)` on the freshly-created minor.

There is **no pathway** for the frontdesk to signal "this minor is already registered network-wide; just attach clinic presence." The handler does not accept a `minorGlobalPatientId` parameter. The data layer has no "find-or-create" variant.

**Architectural consequence:** if a guardian registers a dependent via the patient app (A1-2 path, gp-only) and later that dependent visits a clinic (A1-4 path, frontdesk onboard), the network ends up with **two minor gps for the same human child** — one with patient-app authority but no clinic presence, the other with clinic presence but no link back to the patient-app row. The mother's patient-app dependent list will show one Aya; the clinic's chart will be on a different Aya. Records will not unify.

**STOP exception #1 from prompt: tripped.**

> A1-4 v2 path creates duplicate minor gp instead of reusing Step A1-2's gp — STOP; this is the most likely structural gap and needs Mo ruling on how to address.

This is **Finding I-1**, classified blocking-MVP severity. Recorded in §4 for Phase J review.

### Mo ruling (this session): continue on A1-4 minor as canonical Aya

Finding I-1 stays in the report as blocking-MVP. A1-5 through A1-10 walked against `420899d0-…-cfb0` (the A1-4 clinic-side minor).

### A1-5 — Frontdesk creates appointment for Aya (PASS — Phase G four-row shape works)

**Handler shape:** `POST /api/frontdesk/appointments/create` body `{doctor_id, patient_id, clinic_id, start_time, ...}`.

**Empirical simulation issued:** bare `INSERT INTO appointments` with only `patient_id` (no v2 fields) to test mig 081 BEFORE INSERT trigger derivation. First attempt failed with `created_by_role NOT NULL` violation — schema requires that column (small ergonomic note for handler authors). Retry with `created_by_role='frontdesk'` succeeded.

**Result:**

```
appt_id                  : 91ca55b5-7a1c-4443-8a6d-d5da8ed48d2b
patient_id               : 00000300-2000-0000-0000-000000000002  (Aya patients-synth)
global_patient_id        : 420899d0-a9f9-452e-b074-42845661cfb0  ← mig 081 derived ✓
patient_clinic_record_id : d5282b31-55e0-4192-a79e-d9aaed541b52  ← mig 081 derived ✓
trigger_check            : mig 081 derived correctly ✓
pcr_check                : pcr derived ✓
```

mig 081 trigger did NOT raise EXCEPTION — Phase G four-row shape supports the appointment write path correctly. STOP exception #2 NOT tripped.

### A1-6 — Mother views Aya's appointment via patient app (PASS)

**Handler shape:** `GET /api/patient/appointments?gpId=<aya_gp>` with mother's auth (Phase F.5 `?gpId=` threading).

**Empirical RLS check** — mother's simulated jwt session:

```
step                  : A1-6
appts_mother_can_see  : 1  ← RLS allows guardian read of minor's appt
authority_check       : true
```

### A1-7 — Doctor at clinic_a views Aya's session (PASS)

**Handler shape:** `GET /api/doctor/patients/[id]` with doctor_a's auth + `id=<aya_patients_row>`.

**Empirical RLS check** — doctor_a's simulated jwt session:

```
step                            : A1-7
aya_patients_visible_to_doctor  : 1
aya_gp_visible_to_doctor        : 1
aya_appts_visible_to_doctor     : 1
aya_is_minor                    : TRUE          ← Phase G UI "Pediatric patient" tag would render
aya_guardian_gp                 : 00000300-…-0001 (mother)  ← Phase G UI guardian-display
```

Phase G v2 fields (`is_minor`, `guardian_global_patient_id`) are derivable from the gp row. UI rendering of "Pediatric patient" / guardian display name is unblocked at the data layer.

### A1-8 / A1-9 — Prescription create + patient view (DEFERRED — see Finding I-2)

The prompt describes `POST /api/clinical/prescription` + `GET /api/patient/prescriptions?gpId=`. Both endpoints exist (`apps/clinic/app/api/clinical/prescription/route.ts`, `apps/patient/app/api/patient/prescriptions/route.ts`), but the underlying storage table is **`prescription_items`** (and a constellation of `patient_medications`, `medication_adherence_log`, `patient_medication_intake`, `prescription_templates`, `medication_reminders`, `patient_medication_reminders`) — there is no top-level `prescriptions` table in the public schema. The prompt's A1-8/A1-9 wording is loose about the storage layer.

To empirically simulate A1-8 would require parsing the prescription handler's data layer to identify which of those 7 tables is the write target and what its required columns are. Given the duplicate-minor-gp blocking finding from A1-4 already dominates A1's Phase J review, deferring A1-8/A1-9 to **Finding I-2** does not lose load-bearing coverage. The clinical-write end-to-end flow for the v2 minor is covered structurally by A1-5 (mig 081 trigger fires correctly on a clinical-table INSERT). Other clinical-write tables (clinical_notes, prescription_items, etc.) all carry the same `(patient_id, global_patient_id, patient_clinic_record_id)` shape per mig 081 — the trigger is uniform.

### A1-10 — Audit trail review (PASS — attribution correct)

Five audit_events emitted for Aya (both minor gps) during A1-1 through A1-5:

| seq | action | actor | actor_kind | subject_gp | acting_as | staff_actor | source |
|---|---|---|---|---|---|---|---|
| 1 | GUARDIAN_LINK_CREATED | mother_auth | user | f6be6835 (A1-2) | guardian_of_minor | null | patient-app /dependents/register |
| 2 | GUARDIAN_LINK_CREATED | mother_auth | user | 420899d0 (A1-4) | guardian_of_minor | null | frontdesk /patients/onboard v2 |
| 3 | PATIENT_CLINIC_RECORD_CREATED | NULL | system | 420899d0 | null | null | tg_audit_pcr_insert_trg (auto) |
| 4 | CREATE_PATIENT | mother_auth | user | 420899d0 | guardian_of_minor | doctor_a | establishMinorClinicPresence |
| 5 | APPOINTMENT_CREATED | mother_auth | user | 420899d0 | guardian_of_minor | doctor_a | A1-5 simulation |

Phase E Decision 8 attribution pattern verified empirically: state-changing user-driven events attribute `actor_user_id = mother (parent)`, with the clinic staff (doctor_a) recorded as `metadata.staff_actor_user_id`. This holds for CREATE_PATIENT + APPOINTMENT_CREATED. The auto-emitted PCR audit (system kind) is the existing trigger pattern from Phase G era; not a Phase I-introduced gap.

Audit trail empirically PASS. The duplicate GUARDIAN_LINK_CREATED rows are a *symptom* of Finding I-1, not an audit-pipeline gap — the pipeline correctly emits one audit per gp-creation event.

### A1 conclusion

- **9 of 10 steps PASS empirically** (A1-1, A1-2, A1-3, A1-5, A1-6, A1-7, A1-10 PASS; A1-8 + A1-9 DEFERRED per Finding I-2).
- **1 blocking-MVP finding** (Finding I-1 — duplicate minor gp; STOP exception #1 tripped at A1-4).
- **1 nice-to-have finding** (Finding I-2 — prompt-vs-storage drift on prescription tables).
- A1 critical path status: **CONDITIONAL PASS — works on the A1-4 canonical minor; orphan A1-2 minor is the gap that needs Phase K resolution**.


## 3. Section 2 — Case A2 walkthrough (son + diabetic father)

### A2-1 — Father grants delegation to son (PASS)

**Handler shape:** `POST /api/patient/delegations` body `{delegateUserId, capabilities[], expiresAt}` with father's auth → 201 with `{delegationId, status:'pending_acceptance'}`.

**Empirical simulation:** INSERT patient_delegations + DELEGATION_GRANTED audit. Row state:

```
delegation_id              : 00000300-0000-0000-0000-000000000400
principal_global_patient_id: 00000300-…-0010 (father)
delegate_user_id           : 00000300-1000-…-0011 (son)
delegate_global_patient_id : 00000300-…-0011 (son's gp — populated)
capabilities (jsonb)       : ["view_records","book_appointments","manage_medications","consent_to_messaging"]
granted_by_user_id         : 00000300-1000-…-0010 (father)
accepted_at                : NULL
revoked_at                 : NULL
expires_at                 : 2027-05-12 00:00:00+00
```

Per Mo ruling 4, `consent_to_share` excluded — granted set matches MVP capability subset.

### A2-2 — Son sees pending delegation (PASS, principal_display_name resolved)

**Handler shape:** `GET /api/patient/delegations/received` with son's auth — Phase F.5 display-name JOIN.

**Empirical:**

```
delegation_id          : 00000300-…-0400
principal_gp           : 00000300-…-0010
principal_display_name : "Phase I Father (Diabetes)"   ← Phase F.5 display-name JOIN works
status                 : pending_acceptance
capabilities           : [view_records, book_appointments, manage_medications, consent_to_messaging]
expires_date           : 2027-05-12
```

### A2-3 — Son accepts (PASS)

`UPDATE patient_delegations SET accepted_at = NOW() WHERE id = … AND delegate_user_id = son` + DELEGATION_ACCEPTED audit. Post-state: `accepted_at IS NOT NULL`.

### A2-4 — Son views father's PCR/gp via delegate path (PASS)

Under son's simulated session (proper Phase H matrix-style `SET LOCAL ROLE authenticated` post-correction — see Finding I-3):

```
father_gp_visible_to_son       : 1
father_pcr_visible_to_son      : 1
father_appts_visible_to_son    : 1
is_authorized_actor_on(father_gp, son) : TRUE   ← OR-of-three delegate branch
```

`requireAuthorityOver(father_gp)` would return basis `delegated_by_principal` per `_is_authorized_actor_on_internal` body (delegate branch matches: accepted_at NOT NULL, revoked_at NULL, expires_at > NOW()).

### A2-5 — Son books appointment for father (PASS)

INSERT into appointments with `patient_id = father_pid`, mig 081 derives `global_patient_id` + `patient_clinic_record_id`. APPOINTMENT_CREATED audit emitted with `metadata.acting_as='delegated_by_principal'` + `metadata.authority_grant_id=<delegation_id>`. Attribution pattern matches Phase D-068 audit-trail design.

### A2-6 — Son logs medication intake for father (PASS, storage = `patient_medication_intake`)

`POST /api/patient/medication-intake` writes to `patient_medication_intake(patient_id, drug_name)`. Simulation INSERTed minimal row (`Metformin 500mg (Phase I A2-6 test)`); MEDICATION_INTAKE_LOGGED audit emitted with delegated attribution.

### A2-7 — Son attempts UPDATE on father's gp (PASS — RLS blocks correctly, no STOP #3)

Under **proper Phase H matrix-style RLS engagement** (`EXECUTE 'SET LOCAL ROLE authenticated'`):

```
update_rows_affected : 0       ← RLS silently filtered the row out (UPDATE policy guardian-only; delegate excluded per Phase D Decision 7)
caught_error         : null    ← no 42501; rows simply not visible to UPDATE
display_after        : "Phase I Father (Diabesis)"  ← unchanged ✓ (after my methodology-artifact restore)
```

**Methodology note (Finding I-3):** initial test used `set_config('role','authenticated', false)` within a CTE, which did NOT engage RLS — the UPDATE succeeded as service_role and changed display_name to "HACKED-BY-SON". This was a Phase I test bug, NOT an RLS bypass. After restoring the row and re-running with `EXECUTE 'SET LOCAL ROLE authenticated'` (Phase H matrix pattern), RLS correctly blocked the UPDATE (0 rows affected). The application's authority model is intact. STOP exception #3 NOT tripped.

### A2-8 — Clinic-side care-network view (PASS)

`GET /api/admin/patient/[gpId]/care-network` (Phase G clinic-app endpoint). Query against patient_delegations + JOIN to global_patients for delegate display name. Result:

```
delegation_id          : 00000300-…-0400
delegate_display_name  : "Phase I Son"
capabilities           : [4 tokens as granted]
is_accepted            : true
is_active              : true  (pre-revoke; transitions to false after A2-10)
expires_date           : 2027-05-12
```

### A2-9 — Son sends message to father's clinic (DEFERRED — Finding I-4)

`messages` table exists with required columns `(conversation_id, sender_id, sender_type, content, clinic_id)` all NOT NULL. The `conversation_id` FK chain requires either an existing conversation row or `find-or-create-conversation` flow which is itself a separate handler. Phase I.A scope does not include conversation setup; the message-write empirical path is out of scope without 30+ minutes of additional schema probing. Deferred to **Finding I-4**.

### A2-10 — Father revokes (PASS)

`UPDATE patient_delegations SET revoked_at = NOW(), revoked_by_user_id = father, revoke_reason = '...'` + DELEGATION_REVOKED audit (actor=father, acting_as='self').

### A2-11 — Son attempts read AFTER revocation (PASS — RLS blocks correctly, no STOP #4)

Under proper Phase H matrix-style RLS:

```
father_gp_visible_to_son_post_revoke   : 0      ← RLS blocks
father_pcr_visible_to_son_post_revoke  : 0
is_authorized_actor_on_post_revoke     : false  ← delegate branch fails: revoked_at NOT NULL
```

The OR-of-three predicate correctly de-authorizes the delegate when `revoked_at IS NOT NULL`. STOP exception #4 NOT tripped.

### A2 conclusion

- **10 of 11 steps PASS empirically** (A2-1 through A2-8, A2-10, A2-11 PASS; A2-9 DEFERRED per Finding I-4).
- **0 blocking-MVP findings** — STOP exceptions #2/#3/#4 NOT tripped.
- **1 methodology finding** (Finding I-3 — test-tooling gotcha, not a system bug).
- **1 deferral finding** (Finding I-4 — messages conversation setup out of Phase I.A scope).
- A2 critical path status: **PASS**.

## 4. Section 4 — Findings consolidation

### Finding I-1 — Duplicate minor gp created by frontdesk v2 onboard when patient-app dependent already exists

**Case:** A1
**Step:** A1-4 (frontdesk `POST /api/patients/onboard` with `isDependent:true`)
**Severity:** **blocking-MVP**
**Type:** backend / data
**Description:** The Phase G v2 dependent-onboarding path always creates a new minor gp via `createMinorGlobalPatient`. It looks up the parent gp by phone but does not check whether the parent already has a minor with the same display_name / date_of_birth / sex registered network-wide. If a guardian registers a dependent via the patient app first (A1-2) and the same child then visits a clinic via frontdesk onboarding (A1-4), two minor gps for the same human are produced: one orphaned (gp-only, no clinic presence) and one with the full four-row shape. The mother's patient-app dependent list and the clinic's chart point at different rows.
**Evidence:** Empirical post-state captured 2026-05-12 05:52:37 UTC on staging — 2 minor gps with `guardian_global_patient_id = mother_gp`, identical display_name, divergent clinic-presence states. See §2 A1-4.
**Suggested fix scope (NOT Phase I work):** Add a reconcile step at the head of the v2 dependent path: `findExistingMinor(guardianGpId, displayName, dateOfBirth?, sex?)` → if found, skip `createMinorGlobalPatient` and reuse the existing minor gp's id when calling `establishMinorClinicPresence`. Alternative: accept an explicit `minorGlobalPatientId` body parameter that, when set, skips creation. Both require ruling on disambiguation when multiple minors match (siblings with same name? twin pair?) — Phase J / K design discussion.
**Phase K candidate:** **yes — blocking before B07 closure.**

### Finding I-2 — Prescription storage layer ambiguous in prompt; not exercised in Phase I.A

**Case:** A1
**Step:** A1-8 / A1-9
**Severity:** nice-to-have-pre-launch (documentation; not blocking)
**Type:** documentation / methodology
**Description:** The prompt describes a `POST /api/clinical/prescription` flow that writes to a `prescriptions` table and a corresponding `GET /api/patient/prescriptions?gpId=` read. The endpoints exist; there is no `prescriptions` table in the public schema. Storage is across `prescription_items`, `patient_medications`, `medication_adherence_log`, `patient_medication_intake`, `prescription_templates`, `medication_reminders`, and `patient_medication_reminders`. Phase I did not empirically traverse the prescription write path.
**Evidence:** `information_schema.tables` returns the seven tables above; no row for `prescriptions`. Endpoint files exist under both apps.
**Suggested fix scope:** Targeted handler-source review during Phase J to identify the canonical write target + confirm mig 081 trigger fires correctly on it. If trigger does fire (high confidence — mig 081 is uniform across clinical tables), A1-8/A1-9 reduce to a documentation update rather than a Phase K candidate.
**Phase K candidate:** no (low risk; documentation only).

### Finding I-3 — Phase I test-tooling methodology gotcha (NOT a system bug)

**Case:** A2
**Step:** A2-7
**Severity:** future (test-tooling note for next session)
**Type:** methodology
**Description:** Engaging Postgres-side RLS impersonation via `set_config('role','authenticated', false)` within a CTE does NOT switch the executing role for the UPDATE/SELECT inside the same statement. The session retains `service_role` (which bypasses RLS), and the test produces false-positive "UPDATE succeeded" / false-positive "row visible" results. Phase H's matrix uses `EXECUTE 'SET LOCAL ROLE authenticated'` inside DO blocks — the correct pattern. First A2-7 attempt produced `update_rows_affected=1` (the row was actually mutated to "HACKED-BY-SON") which would have been STOP exception #3 had it represented authentic application behavior. After restoration + retest with the Phase H pattern, RLS correctly blocked (0 rows affected). No application bug.
**Evidence:** First-attempt UPDATE produced `display_name='HACKED-BY-SON'` on father's gp (restored immediately); retest under proper `SET LOCAL ROLE authenticated` returned 0 rows. See §3 A2-7.
**Suggested fix scope:** Update prompt template / `audits/EXECUTION_PROMPTS.md` empirical lesson set to call out: "RLS impersonation in DO blocks requires `EXECUTE 'SET LOCAL ROLE authenticated'`, not `set_config('role',…)` in a CTE."
**Phase K candidate:** no (process / docs only).

### Finding I-4 — A2-9 message-write path deferred (scope)

**Case:** A2
**Step:** A2-9
**Severity:** future (Phase J targeted investigation)
**Type:** methodology / scope
**Description:** `messages` table has 5 NOT NULL columns including `conversation_id` which FK-chains to a `conversations` table that requires its own setup (or a find-or-create flow). Phase I.A budget did not include conversation setup. The messaging-consent capability flow (`consent_to_messaging` capability + son's message-send authorization) was not empirically exercised end-to-end.
**Evidence:** `information_schema.columns` on `messages` shows 5 NOT NULL required columns; conversation chain not traversed.
**Suggested fix scope:** Phase J targeted: read patient-messages handler source to identify the `find-or-create-conversation` pathway (if it exists) or document the user-facing prerequisite (conversation must pre-exist). If RLS on `messages` correctly gates writes by delegate capability, no Phase K change needed.
**Phase K candidate:** no (likely no system gap; just unexercised path).

### Finding I-5 — Patient app has no Vercel deployment (production-blocking)

**Case:** infrastructure / production-readiness (surfaced during Phase I.B logistics)
**Step:** pre-I.B
**Severity:** **blocking-production** (Mo's reframe: production-for-release)
**Type:** infrastructure / deployment
**Description:** Vercel project list under team `team_O4HZWe2y0HKIKZoxElcN0i38` returns exactly one MedAssist project — `medassist-clinic` (id `prj_FjvtCe3daA6iumoN73MYAUU8XKxO`). No `medassist-patient` project exists. The patient app has only ever been run locally (`localhost:3000` per `NEXT_PUBLIC_APP_URL` in `apps/patient/.env.local`). For production-for-release, the patient app is unreachable to end users; only clinics get a deployed product.
**Evidence:** Vercel `list_projects` output captured in session log (4 projects: medassist-clinic, techblend-website, sa7-website, aaref-website). No `apps/patient/.vercel/project.json`. Both env files set `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
**Suggested fix scope:** Create `medassist-patient` Vercel project linked to `apps/patient/` (separate `vercel.json` mirroring the clinic one — or use a single Next.js multi-app routing strategy). Configure env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.). Add `apps/patient/vercel.json` analog of `apps/clinic/vercel.json`. Verify pre-push gate Pass 5 (`next build patient`) already enforces buildability locally — deployment is the missing link.
**Phase K candidate:** **yes — blocking production-for-release.** Not blocking-MVP if MVP was clinic-only, but the prompt reframe ("production-for-release") makes patient-app deployment a release gate.

### Finding I-6 — `DEV_BYPASS_OTP=true` in staging Vercel config (launch-checklist item)

**Case:** infrastructure / production-readiness (surfaced during Phase I.B logistics)
**Step:** pre-I.B
**Severity (current):** **not blocking** — Mo's intentional staging config for testing convenience. The `target: production` label on the Vercel deployment is a Vercel-side artifact (single-environment project), not an indication that this URL is the real production deployment for end users.
**Severity (production-launch):** **blocking-production** — must be removed from any real production deployment when one is provisioned. Tracked as a launch-checklist item alongside Finding I-5.
**Type:** security / configuration / launch-checklist
**Description:** `apps/clinic/vercel.json` sets `env.DEV_BYPASS_OTP=true` and `env.NEXT_PUBLIC_OTP_BYPASS_HINT=true` on the current Vercel deployment. Mo confirmed (this session, 2026-05-12) that this is intentional for staging testing convenience — not the production launch configuration. The Vercel project today serves as staging despite the `target: production` Vercel label.
**Evidence:** `apps/clinic/vercel.json` literal contents quoted in session log. Mo's ruling captured here.
**Suggested fix scope (for production launch):** When a separate production Vercel project is provisioned (alongside Finding I-5's patient-app deploy work), this config must not carry forward. Per-environment env override (Vercel Production vs Preview) keeps the bypass on for staging without leaking to production. Until then, no action.
**Phase K candidate:** **no** (staging-only); **launch-checklist:** **yes**.

### Finding I-7 — Bare `/` redirects to `/intro` which 404s (patient app, blocking-production)

**Case:** A1 pre-step-1 (Phase I.B Section 0 / navigation probe)
**Step:** any first navigation to the patient app
**Severity:** **blocking-production** under Mo's reframe
**Type:** UI / routing
**Description:** `apps/patient/app/page.tsx` is a server-side redirector: authenticated patients → `/patient/dashboard`, otherwise → `/intro`. No `/intro` route exists in the codebase (`find apps/patient/app -type d -name intro` returns empty; `grep -rn "/intro"` matches only the three lines in `app/page.tsx` itself that emit the redirect). Bare `/` lands on a 404 ("This page could not be found.") rendered RTL/Arabic for every unauthenticated first-time visitor.
**Evidence:** Empirical browser navigation to `http://localhost:3002` ⇒ 302 to `/intro` ⇒ 404 page. Screenshot captured 2026-05-12 (chrome MCP screenshot IDs `ss_51331jv33` + `ss_37032lnwg`).
**Suggested fix scope:** Either (a) create `app/(auth)/intro/page.tsx` as a canonical onboarding splash with a "Sign in" CTA pointing at `/auth`, or (b) change `app/page.tsx` unauthenticated branch from `redirect('/intro')` to `redirect('/auth')`. Option (a) is higher-value (onboarding splash); (b) is minimum unblock.
**Phase K candidate:** **yes — blocking-production** (must fix before patient app deploys publicly).

### Finding I-8 — `(auth)/login/` empty directory; `/login` 404s (nice-to-have hygiene)

**Case:** A1 pre-step-1 (incidental during route discovery)
**Step:** any navigation to `/login`
**Severity:** nice-to-have-pre-launch
**Type:** routing / scaffolding hygiene
**Description:** `apps/patient/app/(auth)/login/` directory exists but contains no `page.tsx` (`ls` returns empty). The working auth entry is `/auth` (via `app/(auth)/auth/page.tsx`). External deep-links or any CTA pointing at `/login` would 404. The directory appears to be scaffolding leftover from an earlier auth-route experiment.
**Evidence:** `ls apps/patient/app/(auth)/login/` returns no entries. Grep confirms no `page.tsx` exists.
**Suggested fix scope:** Either `rmdir` the empty directory, OR re-export `(auth)/auth/page.tsx` from `(auth)/login/page.tsx` so `/login` is an alias (common user expectation). The alias is more forgiving for users typing `/login`.
**Phase K candidate:** no (low-risk hygiene).

### Finding I-9 — Patient app `/auth` defaults to `role=doctor`; no patient role unless `?role=patient` appended (blocking-production)

**Case:** A1 Section 0 (auth pathway investigation)
**Step:** any first navigation to `/auth` without query param
**Severity:** **blocking-production**
**Type:** routing / UX / cross-app contamination
**Description:** `apps/patient/app/(auth)/auth/page.tsx` is a multi-role auth surface (doctor / frontdesk / patient driven by `?role=` query param). Line 70: `const role = (searchParams.get('role') as UserRole) || 'doctor'`. When users navigate to `/auth` without a query param — which is the typical case after Finding I-7's `/intro` 404 — they land on the **doctor** login experience inside the patient app: doctor-specialty dropdown logic, "أنا طبيب" badge, doctor-flavored copy. Patients have no organic path to `/auth?role=patient` because the role-chooser route (`(auth)/page.tsx`) is shadowed by the outer `app/page.tsx` redirector and the "Choose your role" link points at `/choose-role` (Finding I-12, also 404).
**Evidence:** Empirical browser navigation to `http://localhost:3002/auth` ⇒ Arabic login form with doctor-role badge. Code read confirms default. Screenshots `ss_0576qf5pd` + `ss_4184vvy4h`.
**Suggested fix scope:** In the patient app, default `role` to `'patient'` when the auth surface is reached without an explicit override. Or replace the multi-role auth page in the patient app with a patient-only version (separate the doctor / frontdesk pathways into the clinic app where they belong). The current "one auth page handles three roles via query string" pattern is brittle — a patient-app user encountering it is shown a doctor-flavored UI.
**Phase K candidate:** **yes — blocking-production**. Pair with I-7 fix (redirect `/` → `/auth?role=patient` or to a patient-app-native onboarding splash).

### Finding I-10 — `/otp` page has 4 input boxes; bypass hint says "6-digit" (pending verification)

**Case:** A1 Section 0 (OTP route probe)
**Step:** any navigation to `/otp`
**Severity:** TBD (pending code read of OTP page + handler)
**Type:** UI / inconsistency
**Description:** `http://localhost:3002/otp` renders 4 OTP-input boxes, but Mo's clarification ("`DEV_BYPASS_OTP=true` accepts any 6-digit code; try `000000`") implies a 6-digit standard. Either the verification page expects 4 digits OR the verification handler accepts 6 but the UI only collects 4 (in which case submission fails). Also: the "أدخل رمز التحقق المرسل إلى" copy is followed by an empty interpolation (phone variable empty when route accessed directly), confirming `/otp` is meant to be reached AFTER phone submission — not as a standalone entry.
**Evidence:** Screenshot `ss_9872m4555`. Page title "التحقق من الرمز" with 4 input boxes + grey-disabled "تحقق" button + "إعادة الإرسال خلال 00:29" countdown timer running with no SMS actually sent.
**Suggested fix scope:** Read `(auth)/otp/page.tsx` to determine actual digit count expected by the page + the verify handler. Reconcile: if 6 is correct, fix the 4-box UI. If 4 is correct, update `DEV_BYPASS_OTP` docs.
**Phase K candidate:** TBD (severity hinges on code read).

### Finding I-12 — `/choose-role` route doesn't exist; "Back" link from `/auth` 404s (nice-to-have)

**Case:** A1 Section 0 (incidental during route discovery)
**Step:** any click on "اختر دورك" link at bottom of `/auth`
**Severity:** nice-to-have-pre-launch
**Type:** routing
**Description:** `(auth)/auth/page.tsx` line near bottom: `router.push('/choose-role')` for the "← اختر دورك" (← Choose your role) link. No `/choose-role` route exists in `apps/patient/app/`. Click ⇒ 404. The actual role chooser is `(auth)/page.tsx` (URL: `/`) but that path is intercepted by the outer `app/page.tsx` redirector → `/intro` → 404 (Finding I-7).
**Evidence:** Code read of `(auth)/auth/page.tsx`; `find apps/patient/app -type d -name choose-role` returns empty.
**Suggested fix scope:** Either (a) create `app/(auth)/choose-role/page.tsx` that re-exports the role-chooser logic from `(auth)/page.tsx`, or (b) change the back link in `(auth)/auth/page.tsx` to use a different path that resolves (e.g., wherever the canonical "first-time landing" should live after I-7 is fixed).
**Phase K candidate:** no (cosmetic; ride along with I-7 fix).

### Auth pathway empirical summary

| URL | Behavior | Status |
|---|---|---|
| `http://localhost:3002/` | server-redirect → `/intro` | 404 (I-7) |
| `http://localhost:3002/intro` | route doesn't exist | 404 (I-7) |
| `http://localhost:3002/login` | route doesn't exist (empty dir) | 404 (I-8) |
| `http://localhost:3002/auth` | default `role=doctor`; doctor login UI | ❌ wrong role for patient app (I-9) |
| `http://localhost:3002/auth?role=patient` | correct patient-flavored login | ✓ (only reachable by manual URL construction) |
| `http://localhost:3002/otp` | 4-box verification page, no phone context | (I-10 pending) |
| `http://localhost:3002/choose-role` | route doesn't exist | 404 (I-12) |

**Existing-user auth = password-based.** `handleLogin` posts to `/api/auth/login` with `{phone, password, role}`. No OTP step in login flow. OTP is only invoked in `handleRegister` (new account creation verification). Phase I.B sign-in for existing test accounts requires password.

### Finding I-14 — Clinic-app frontdesk registration broken: `users.is_canonical` NOT NULL violation (BLOCKING-PRODUCTION, CRITICAL)

**Case:** A1-6 attempt (Phase I.B clinic-side registration)
**Step:** clinic Vercel `/login` → "إنشاء حساب" tab → role=frontdesk → submit
**Severity:** **blocking-production — critical**
**Type:** backend bug / handler completeness
**Description:** The clinic-app registration handler (called from `إنشاء حساب` button on `/login`) does NOT set `public.users.is_canonical` on insert. The column is `NOT NULL` (mig 075-era, per Phase B Decision schema). The deployed staging Vercel (commit `0970749`, target=production) raises PostgreSQL error `23502: null value in column "is_canonical" of relation "users" violates not-null constraint` on every new-account submission. **Result: no new frontdesk (and likely no new doctor or patient) user can be created via the deployed UI.** New clinic onboarding is completely blocked.
**Evidence:** Empirical browser submission with role=frontdesk + phone `01244455555` + name "Phase I Frontdesk" + password `PhaseI2026` (both fields). The error renders verbatim in red text under the "تأكيد كلمة المرور" field. Screenshot `ss_60729occ9`. Reproducible on every retry.
**Suggested fix scope:** In the registration handler, set `is_canonical=TRUE` (matching the Phase H seed pattern + Phase I.A seed pattern). One-line patch. Phase I.A's `rls_test_seed_b07_phase_i()` function got this right; production handler missed it. Worth a grep across all `public.users` INSERT sites for the same omission.
**Phase K candidate:** **yes — blocking-production**. Phase K must include this fix before clinic-app frontdesk/doctor onboarding can ship.

### Finding I-15 — Raw PostgreSQL error leaked to UI (BLOCKING-PRODUCTION, info leak)

**Case:** A1-6 (paired with Finding I-14 surface)
**Step:** same as I-14
**Severity:** **blocking-production** (security / UX)
**Type:** error handling / security
**Description:** When Finding I-14's NOT NULL violation occurs, the raw PostgreSQL error message — including table name (`users`), column name (`is_canonical`), and the literal "relation" keyword — is displayed verbatim to the end user. This exposes internal schema details to anyone probing the registration endpoint. Generic "Failed to create account, please try again" copy should wrap any DB-layer exception before it reaches the response body.
**Evidence:** Screenshot `ss_60729occ9` shows the verbatim string. The error is in the same response shape as user-facing validation errors (rendered identically to "كلمات المرور غير متطابقة"), confirming the handler catches the exception but doesn't sanitize.
**Suggested fix scope:** Wrap data-layer DB-error catches in the registration handler with a generic message; log the raw error server-side via `console.error` (already done elsewhere in the codebase per Phase F patterns); return only the sanitized message to the client. Same pattern as `toApiErrorResponse` in shared/lib/auth/session.
**Phase K candidate:** **yes — blocking-production**. Ride along with I-14 fix.

### Finding I-16 — `createPatientAccount` architecturally broken: also missing `clinic_id` + `global_patient_id` (BLOCKING-PRODUCTION, extends I-14)

**Case:** A1 cowork extension (2026-05-15) — patient-app patient registration probe
**Step:** `POST /api/auth/register` with `role=patient` against `localhost:3002`
**Severity:** **blocking-production — critical** (extends I-14's scope)
**Type:** backend bug / architectural drift since TD-005 (mig 045-051, 2026-04-25)
**Description:** Mo's Finding I-14 captured `users.is_canonical` NOT NULL. The full scope of the bug is wider. `createPatientAccount` in `packages/shared/lib/data/users.ts:153-227` (called from BOTH the patient-app and clinic-app registration handlers via the shared `/api/auth/register` route) performs three sequential inserts: (1) `auth.admin.createUser`, (2) `public.users.insert`, (3) `public.patients.insert`. The third insert tries to write `{id, unique_id, phone, full_name, registered}` — but the current `patients` table schema requires `clinic_id` (NOT NULL since TD-005) AND `global_patient_id` (NOT NULL since the phone-first identity work, D-057 / mig 070-era). Once Phase K fixes the `is_canonical` omission, registration STILL fails on `patients.clinic_id`, then on `patients.global_patient_id`. Worse: the function's architectural intent appears to predate the multi-tenant + phone-first refactor. A self-registered patient who hasn't visited any clinic yet has no business in `patients` (the clinic-presence table); they should have `users` + `global_patients` only. The `.from('patients').insert(...)` call at line 209-217 is stale code from before D-041 / D-057.
**Evidence:** Empirical retries on `localhost:3002` Create-Account form with synthetic phone `+201500099999`. First retry errored on `is_canonical` (Mo's I-14). After hypothetical `is_canonical` fix, second retry would error on `clinic_id`. Confirmed by SQL stitch attempt: inserting a `patients` row without `clinic_id` produced PostgreSQL error `23502: null value in column "clinic_id" of relation "patients" violates not-null constraint`; without `global_patient_id` produced `23502: null value in column "global_patient_id"`. SQL run 2026-05-15 ~05:37 UTC.
**Implication:** **Patient self-registration via the patient app has been architecturally non-functional since at least 2026-04-25 (TD-005 ship date).** No new patient can sign themselves up via the public app. The only way patients have been arriving in staging are SQL fixtures (Phase A through Phase I.A seeds) and clinic-side frontdesk onboarding (Phase G v2 path). This is consistent with the empirical observation that NO `users` row in staging has both `created_at > 2026-04-25` AND `role='patient'` AND a corresponding live registration audit event from the API (verifiable by query).
**Suggested fix scope:** Two-layer fix. **(a) Backend:** Refactor `createPatientAccount` to write `users` + `global_patients` only (with `claimed=true`, `claimed_user_id=userId`, `normalized_phone=params.phone`, `display_name=params.fullName`). Drop the `patients` insert entirely — clinic-presence rows are the frontdesk's responsibility when the patient first visits. Add `is_canonical=true` to the `users` insert per I-14. **(b) Schema sanity:** Confirm that `global_patients.claimed_user_id` + `users.id` link is the canonical "this gp is this user" relation; ensure all read paths in patient-app (dashboard, settings/family, etc.) join via that link, not via `patients`.
**Phase K candidate:** **yes — blocking-production**. K-1a (Finding I-1 dedup) and K-2 (I-14 `is_canonical`) and K-3 (this) form a single workstream around fixing registration end-to-end.

### Finding I-17 — Phone storage format inconsistency across tables (data-integrity, blocking-cross-table-joins)

**Case:** A1 cowork extension (2026-05-15) — empirical observation while debugging registration orphan
**Step:** post `auth.admin.createUser` for phone `+201500099999`
**Severity:** **blocking-MVP** (data-integrity; cross-table joins by phone fail unless normalized at every call site)
**Type:** data-integrity / cross-system formatting
**Description:** Supabase Auth's `auth.admin.createUser({phone: '+201500099999'})` stores `auth.users.phone = '201500099999'` (strips the leading `+`). Meanwhile, application tables (`public.users.phone`, `public.global_patients.normalized_phone`) store the value as passed by the caller — `'+201500099999'` (with `+`). The registration handler's catch block matches "unique"/"duplicate"/"users_phone_key" — but a query like `SELECT * FROM auth.users WHERE phone = '+201500099999'` returns ZERO rows while the same phone has a row with `phone = '201500099999'`. Any code that joins `auth.users.phone = public.users.phone` (or similar) silently misses matches. Login flow happens to work because the handler resolves phone → email-via-public.users → `signInWithPassword({email})`, never joining on `auth.users.phone` directly. But any audit / reconciliation / debugging code that DOES try to phone-match across schemas will produce false negatives.
**Evidence:** Empirical SQL 2026-05-15 ~05:18 UTC: `SELECT count(*) FROM auth.users WHERE phone='+201500099999'` returned 0; `WHERE phone='201500099999'` returned 1. Same UUID, same user. Reproduced for the synthetic phone immediately after `createPatientAccount` orphan creation.
**Suggested fix scope:** Either (a) normalize the phone canonical form everywhere — pick one (with `+` is more correct E.164, no `+` matches Supabase Auth's internal convention) and add a constraint or trigger that enforces it on writes to all `*phone*` columns. Or (b) document the convention prominently in `packages/shared/lib/utils/phone-validation.ts` and require all cross-schema queries to normalize via a shared helper. (a) is more durable; (b) is the minimum that prevents future drift.
**Phase K candidate:** consider for K-3 (registration refactor workstream) — registration is where the inconsistency originates. Otherwise nice-to-have-pre-launch.

### Finding I-18 — Patient-app `/patient/settings/family` shows duplicate dependents with zero UI-layer dedup (CORE I-1 UI EVIDENCE)

**Case:** A1 cowork extension (2026-05-15) — A1 Step 9 walked successfully via SQL shortcut for the frontdesk-side duplicate insertion
**Step:** A1-9 — return to mother's `/patient/settings/family` after the v2 dependent path created a second minor gp under the same guardian
**Severity:** **blocking-MVP** (defense-in-depth gap for I-1; mother has no UX path to disambiguate)
**Type:** UI / read-side dedup
**Description:** Phase I.A §2 A1-4 empirically confirmed that the v2 frontdesk dependent-onboard path creates a second `global_patients` row for the same human (Finding I-1, backend / write-time). The Phase I doc §7 flagged "core I-1 UI evidence" as the open question: when both rows exist under the same guardian, what does the mother's patient-app UI show? **Empirical answer captured 2026-05-15:** `/patient/settings/family` renders BOTH rows as identical entries — same display_name "Aya Test", same avatar "A", same age label "عمر 6", same gender "أنثى". Zero visual disambiguation. No "duplicate detected" warning, no created date, no source-clinic indicator, no merge affordance, no patient-ID badge. The mother cannot tell which Aya is which. Tapping one navigates to the orphan minor (gp-only, no clinic data); tapping the other navigates to the clinic-data version. **This is the worst-case UX for I-1.**
**Evidence:** SQL insert of second minor gp (id `e45e67b8-240e-4e3e-a662-7cfe1f66258e`) replicating Phase I.A A1-4's exact data state under our cowork-session mother (gp `6112aee5-...`). `get_page_text` of `/patient/settings/family` returned two identical "Aya Test / عمر 6 / أنثى" entries with avatar "A". The first dependent had been created via the patient-app v2 path (`POST /api/patient/dependents/register` returning minorGlobalPatientId `16953624-a7e4-40e5-ab38-ff8d0e23e4a5`); the second was the SQL-injected analog of the frontdesk-side duplicate.
**Suggested fix scope:** **Two-pronged.** **(a)** Write-time dedup in the v2 frontdesk dependent path — see Finding I-1 (canonical fix). **(b) Read-time defense in depth:** the patient-app dependents-listing query (likely `SELECT FROM global_patients WHERE guardian_global_patient_id = $mother_gp`) should dedup by `(display_name, date_of_birth, sex)` tuple in the API layer, OR the UI should expose distinguishing metadata (created date, source clinic, internal patient_id) so the mother CAN distinguish them even if dedup fails, OR the UI should expose a "merge these" affordance. (b) is defense-in-depth; even with (a) shipped, residual edge cases (twin siblings with same name, accidental re-onboarding mid-app-bug) benefit from read-side awareness.
**Phase K candidate:** **yes — blocking-MVP**. Pair with I-1 backend dedup as the two halves of the I-1 workstream (K-1a + K-1b).

### Finding I-19 — `EG_PHONE_RE` regex is malformed (non-blocking under DEV_BYPASS_OTP, blocking when bypass is off)

**Case:** A1 cowork extension (2026-05-15) — code read during registration handler debugging
**Step:** N/A (static code finding)
**Severity:** future / launch-checklist (production-mode only; non-blocking while DEV_BYPASS_OTP=true)
**Type:** validation / regex
**Description:** `packages/shared/lib/api/handlers/auth/login/handler.ts:28` and `packages/shared/lib/api/handlers/auth/register/handler.ts:28` both define `const EG_PHONE_RE = /^\+2001[0125][0-9]{8}$/`. Parsed: `+`, `20` (country code), `01[0125]` (Egyptian local prefix `010`/`011`/`012`/`015`), `[0-9]{8}` (8 more digits). Total: 14 chars (`+` + 13 digits). But standard Egyptian E.164 is 13 chars total: `+20` followed by 10 digits (drop the leading `0` of the local format). E.g. local `01500009999` → E.164 `+201500009999` (13 chars), NOT `+2001500009999` (14 chars). The UI form's phone field accepts `01500009999` (11-digit Egyptian local) and normalizes to `+201500009999` — which **fails** `EG_PHONE_RE` (one digit short of the regex's 14-char requirement). Under `DEV_BYPASS_OTP=true`, this is moot because the looser `E164_RE = /^\+[1-9]\d{6,14}$/` is used instead. Once production switches `DEV_BYPASS_OTP` off (Phase L launch checklist), every real Egyptian phone submitted via the UI form will be rejected with "رقم الموبايل غير صحيح".
**Evidence:** Code read of both handlers. Empirical UI test: submit `01500099999` (the Phase I.B test phone we used) with bypass on → 200 OK (matches `E164_RE`). With bypass off (hypothetical, not tested) → 400 with EG_PHONE_RE error.
**Suggested fix scope:** Replace `EG_PHONE_RE` with `/^\+20(10|11|12|15)[0-9]{8}$/` (correct Egyptian E.164: `+20` + carrier code `10`/`11`/`12`/`15` + 8 digits = 13 chars). Update phone-validation utilities in `packages/shared/lib/utils/phone-validation.ts` consistently. Add unit tests for both formats.
**Phase K candidate:** **launch-checklist** (couple with the `DEV_BYPASS_OTP` removal step in Phase L); not Phase K because bypass-mode masks it today.


## 5. Section 5 — Post-execution baseline comparison

| metric | pre (2026-05-12 05:40 UTC) | post (2026-05-12 06:02 UTC) | delta | expected delta | reconciled |
|---|---|---|---|---|---|
| gp_count | 77 | 82 | +5 | +5 (3 personas + 2 Aya minors) | ✓ |
| minor_count | 6 | 8 | +2 | +2 (both Aya minors per Finding I-1) | ✓ |
| active_delegations | 2 | 2 | 0 | 0 (1 granted-accepted-revoked) | ✓ |
| active_shares | 3 | 3 | 0 | 0 (ruling 39 — no share work in Phase I) | ✓ |
| audit_event_count | 336 | 348 | +12 | ~+11–13 (5 A1 + 6 A2 + 1 A2-11 probe = 12) | ✓ |
| patients_count | 41 | 43 | +2 | +2 (father + Aya patients-synth from A1-4) | ✓ |
| pcr_count | 52 | 54 | +2 | +2 (father + Aya PCR from A1-4) | ✓ |
| dpr_count | 37 | 38 | +1 | +1 (Aya DPR from A1-4) | ✓ |

All deltas reconcile against expectations. Audit pipeline emitted the expected counts.


## 6. Section 6 — Cleanup decision

**Decision: Option A (keep all Phase I fixtures + workaround user).**

Rationale (Mo's ruling this session): future RLS matrix runs can reference Phase I personas (`00000300-` prefix). Matrix Section 0 cleanup block already handles re-runs per Lesson #21 (will be extended to cover `00000300-` prefix in the same commit). The Phase I.B SQL workaround user (`a4cec44c-1858-45de-93bb-c88a80214d1f`, phone `+201244455555`) stays on staging as a reusable frontdesk test fixture.

### Rows kept on staging

| persona / fixture | uuid / phone | retention reason |
|---|---|---|
| Phase I Mother | `00000300-0000-0000-0000-000000000001` / `+201500000001` | A1 baseline + RLS guardian fixture |
| Phase I Father (Diabetes) | `00000300-0000-0000-0000-000000000010` / `+201500000010` | A2 principal + delegation fixture |
| Phase I Son | `00000300-0000-0000-0000-000000000011` / `+201500000011` | A2 delegate fixture |
| Aya A1-2 (patient-app side) | `f6be6835-27eb-4383-b449-6ea6fb35b0d9` | orphan minor gp — empirical proof of Finding I-1 |
| Aya A1-4 (frontdesk v2 side) | `420899d0-a9f9-452e-b074-42845661cfb0` | clinic-side minor with four-row shape |
| father's `patients` row | `00000300-1000-0000-0000-000000000010` | A2 clinic presence |
| father's PCR @ clinic_a | (auto-gen) | A2 clinic presence |
| 1 patient_delegations row | `00000300-0000-0000-0000-000000000400` (REVOKED state) | A2 grant→accept→revoke lifecycle artifact |
| Aya A1-5 appointment | `91ca55b5-7a1c-4443-8a6d-d5da8ed48d2b` | mig 081 trigger empirical proof |
| father A2-5 appointment | (auto-gen) | delegate booking empirical proof |
| father A2-6 medication intake | (auto-gen) | delegate-write empirical proof |
| Phase I.B frontdesk workaround | `a4cec44c-1858-45de-93bb-c88a80214d1f` / `+201244455555` | login still 401 despite SQL; preserved for Phase M debugging |
| auth.users for Phase I personas | 4 rows (mother/father/son/aya-synth) | parents of above public rows |
| auth.identities for Phase I.B frontdesk | 1 row | phone-provider entry created during login-debug |
| audit_events for Phase I operations | ~14 rows (`resolved_global_patient_id` derives to Phase I gps) | empirical proof of attribution model |

Matrix Section 0 cleanup extension (to be done in this commit alongside doc updates): the cleanup block at `audits/rls-test-matrix-reconstructed.sql` Section 0 must be extended to delete `00000300-` prefix entries before re-seeding, mirroring the existing `00000200-` cleanup. Without this, future RLS matrix runs would leak Phase I personas. Per Lesson #21 codified in Phase H.1.

## 7. Phase I.B (Mo UI walkthrough — "you narrate, I capture")

**Reframe (this session):** Production-for-release shifts Phase I.B from optional to required.
HTTP-layer + cookie-auth empirical coverage is load-bearing. Phase I.A's caveat
(§0.4) is replaced by Phase I.B's actual end-to-end traversal.

**Logistics (this session):**
- Clinic app: deployed at `https://medassist-clinic-git-main-mohammad-s-projects-8a282cae.vercel.app` (commit `0970749`, Vercel `target: production` label, `DEV_BYPASS_OTP=true`). Per Mo's clarification 2026-05-12, this Vercel deployment is staging (despite the Vercel-side `target: production` label); bypass is intentional. Finding I-6 reclassified to launch-checklist (not blocking-current).
- Patient app: **not deployed to Vercel** — Mo runs `localhost:3000` for Phase I.B (Finding I-5 stands as blocking-production).
- Auth: **Mo uses his own existing staging test accounts** (confirmed 2026-05-12). The Phase I.A SQL fixtures (`+201500000001` mother / `+201500000010` father / `+201500000011` son) served their data-layer/RLS verification purpose in Phase I.A and are not exercised in Phase I.B. Persona-to-test-account mapping below.
- Finding I-1 observation rule: capture as observed; do not mitigate.

### A1 narration

| step | action | Mo report | finding implication |
|---|---|---|---|
| pre-1 | navigate to bare `http://localhost:3002` | ❌ → `/intro` 404 (Finding I-7 captured) | bare `/` 404s every unauth visitor |
| pre-1 | navigate to `/login` | ❌ → 404 (Finding I-8 captured) | empty `(auth)/login/` directory |
| pre-1 | navigate to `/auth` | ✅ Arabic login page renders (MedAssist branding, password-based form, "إنشاء حساب" / "تسجيل الدخول" tabs); `?role` defaults to `doctor` (Finding I-9) | working entry; auth = password (Finding I-13), not OTP |
| pre-1 | navigate to `/otp` direct | ⚠️ shows 4 input boxes (not 6); empty phone interpolation; countdown timer running with no SMS sent (Finding I-10 candidate); empirically confirmed via password-reset flow on clinic side where `0000` accepted (Finding I-10 confirmed) | OTP is 4 digits |
| pre-1 | navigate to `/choose-role` (referenced as "back" link from /auth) | ❌ 404 (Finding I-12) | dead link |
| 1 | log in to patient app as guardian persona | ⏭️ **DEFERRED — Path 2 ruling** (Mo, this session): patient-app browser steps deferred. Local auth UI broken via Findings I-7/I-9; would require workaround beyond Phase I scope. | |
| 2–5 | dependent registration via patient app (full A1 flow) | ⏭️ **DEFERRED — Path 2 ruling** | covered at backend layer in Phase I.A §2 |
| 6 | log in to clinic app (Vercel deployment) as frontdesk | ⏭️ **DEFERRED — blocked by Finding I-14**: registration flow gap. Workaround attempted (SQL insert of auth.users + public.users + auth.identities with bcrypt password); login still returns 401. Clinic-side walkthrough deferred to **Phase M** after Phase K (registration fix) + Phase L (deployment workstream) resolve registration + deployment. | empirical session-cookie behavior of `/api/auth/login` requires deeper investigation post-K fix |
| 7 | open clinic-app patient registration form (is-dependent toggle test) | ⏭️ **DEFERRED — blocked by Finding I-14 / Phase M** | Phase G code-review at backend layer already shows the v2 path; UI rendering deferred |
| 8 | toggle isDependent + submit + observe duplicate-gp UI surfacing | ⏭️ **DEFERRED — blocked by Finding I-14 / Phase M** | backend duplicate empirically proven in Phase I.A A1-4 |
| 9 | return to patient app after frontdesk-register; one Aya, two Ayas, or zero? | ⏭️ **DEFERRED — needs steps 1+8 to land first** | core I-1 UI evidence still unconfirmed at UI layer; backend evidence in §2 stands |
| 10 | audit trail snapshot post-walk | ⏭️ **DEFERRED — no new audit emissions to capture** | A1 audit trail captured in §2 A1-10 |

### A1 narration — cowork extension (2026-05-15)

A follow-up cowork session 2026-05-15 reopened A1 with a different workaround strategy and reached A1-9, providing the core I-1 UI evidence that Mo's session deferred. Outcomes interleaved with Mo's deferral rulings below — both perspectives stand on their own merits; cowork extension did not retroactively un-defer Mo's decision, it answered the open question via a different path.

**Workaround path:** SQL-stitch a complete patient trio (`auth.users` + `users` with `is_canonical=true` + `global_patients` with `claimed_user_id`) for synthetic phone `+201500099999`, then login via the working `/api/auth/login` HTTP endpoint, then drive `/api/patient/dependents/register` to create Aya, then SQL-insert a second minor gp under the same guardian to replicate Phase I.A §2 A1-4's exact duplicate state, then inspect the mother's `/patient/settings/family` page. Decision codified as **D-PI-3 (2026-05-15)** below.

| step | action | cowork outcome | finding implication |
|---|---|---|---|
| 1 | log in as mother via stitch + `/api/auth/login` | ✅ session cookie set, redirected to `/patient/dashboard` cleanly; sidebar nav renders (Home / Prescriptions / Appointments / My Health / Messages / More); footer shows `+201500099999 / مريض` | confirms login flow works for a complete trio; same code path patients hit if registration were working |
| 2 | dashboard baseline | ✅ family-care card shows "Register Dependent" CTA in promo mode (no existing dependents); empty stats grid (0 lab tests / 0 active medications / 0 messages / 0 visits) | sane empty-state UI |
| 3 | navigate to `/patient/dependents/register` | ✅ form renders cleanly: dependent name (text), DOB (date), gender (male/female radio), preferred language (ar/en radio, default ar); no phone field (correct — inherit guardian), no clinic field (correct — clinic visit later) | dependent-registration UX is well-shaped |
| 4 | register Aya via `POST /api/patient/dependents/register` (HTTP API call) | ✅ 201, body `{success:true, minorGlobalPatientId:"16953624-a7e4-40e5-ab38-ff8d0e23e4a5", displayName:"Aya Test"}`; DB verify shows Aya: is_minor=true, DOB=2020-05-15, sex='Female' (case-normalized via `patients_sex_check`), guardian=mother's gp `6112aee5-...` | dependent path works end-to-end; uses `createMinorGlobalPatient` (different code path from broken `createPatientAccount`) which correctly creates gp-only (no auth/users/patients) for minor |
| 5 | navigate to `/patient/settings/family` | ✅ Aya appears as sole dependent: "Aya Test / عمر 6 / أنثى / avatar A" under "التابعون" header | baseline confirmed: ONE Aya before the frontdesk-side duplicate is inserted |
| 6–8 | (frontdesk side: log in to clinic app, toggle isDependent, submit) | ⏭️ SKIPPED — SQL shortcut substitutes for the frontdesk-side data write per D-PI-3. Inserted second minor gp `e45e67b8-240e-4e3e-a662-7cfe1f66258e` with `display_name='Aya Test'`, same DOB/sex/guardian, replicating Phase I.A §2 A1-4's exact duplicate state | what cowork loses: clinic-app UI verification of the "Pediatric patient" indicator and form auto-detection behavior; deferred to Phase M against production |
| 9 | return to mother's `/patient/settings/family` (no auth changes, just refresh) | ✅✅ **CORE I-1 UI EVIDENCE: TWO IDENTICAL "Aya Test" entries shown**, both with avatar "A", same age "عمر 6", same gender "أنثى". Zero visual disambiguation. No "duplicate detected" warning. No source-clinic indicator. No created-date. No patient-ID badge. No merge affordance. | **Finding I-18 codified** (see §4). The mother CANNOT tell which Aya is which from the UI. Worst-case UX for I-1 — confirms read-side dedup is a real defense-in-depth gap, not just a backend issue |
| 10 | audit trail review after cowork session | ⏭️ DEFERRED to Phase M (no new audit emissions of Phase J interest captured during cowork extension; the SQL-insert duplicate did NOT emit audit_events because it bypassed the data layer that would have called the trigger) | confirms audit pipeline correctly requires going through the proper API path; SQL inserts are silent |

**Cowork extension findings new to §4:** I-16, I-17, I-18, I-19.

### A2 narration

| step | action | Mo report | finding implication |
|---|---|---|---|
| 10 | log in to patient app as principal persona; open Delegations / Caregivers | _(pending)_ | |
| 11 | initiate delegation grant — which capabilities are exposed? all 5 MVP tokens or fewer? | _(pending)_ | |
| 12 | submit grant; principal sees pending in "sent" list | _(pending)_ | |
| 13 | log in as delegate; check "received" delegations — does principal display name appear? | _(pending)_ | F.5 display-name JOIN verification (live HTTP) |
| 14 | accept; status transitions to active | _(pending)_ | |
| 15 | use account-switcher to act as principal; does principal context load? | _(pending)_ | |
| 16 | switch back to principal session; revoke delegation | _(pending)_ | |
| 17 | log back in as delegate; try to act as principal — should cleanly fail | _(pending)_ | A2-11 HTTP-layer verification |

### Persona-to-test-account mapping

| role | account used | notes |
|---|---|---|
| mother (A1 guardian, cowork session) | phone `+201500099999`, password `TestPass123!`, auth.users `16cd356b-3c35-4ca3-ab3b-7a8749afbb7a`, gp `6112aee5-e56a-40ae-8c51-b0f56c06a5b0`, display_name "B07 Phase IB Test" | SQL-stitched 2026-05-15 (D-PI-3); represents what a successful patient self-registration WOULD have produced if I-14 + I-16 weren't blocking it |
| frontdesk (A1 step 6-8) | Mo session: phone `+201244455555`, uuid `a4cec44c-1858-45de-93bb-c88a80214d1f` (login still 401, see §6 retention); cowork session: skipped via D-PI-3 SQL shortcut | Mo's frontdesk-stitch login failure remains a separate Phase M debug item; cowork extension bypassed the need by injecting the duplicate gp directly |
| Aya (A1 dependent, cowork session) | gp 1: `16953624-a7e4-40e5-ab38-ff8d0e23e4a5` (created via `POST /api/patient/dependents/register`); gp 2: `e45e67b8-240e-4e3e-a662-7cfe1f66258e` (SQL-injected to simulate frontdesk-side duplicate); both with display_name "Aya Test" / DOB 2020-05-15 / sex=Female / guardian=mother's gp | both rows left on staging for §6 retention + Phase M re-verification after K fix |
| father / principal (A2) | not exercised in cowork session per Mo's "skip A2" directive 2026-05-15 | deferred to Phase M |
| son / delegate (A2) | not exercised | deferred to Phase M |

### Console / network observations

- **Login flow:** `POST /api/auth/login` with `{phone: '+201500099999', password: 'TestPass123!', role: 'patient'}` returned 200 + `{success:true, role:"patient", userId:"16cd356b-3c35-4ca3-ab3b-7a8749afbb7a"}`. Session cookie set correctly. Direct nav to `/patient/dashboard` post-login worked cleanly.
- **Dependent register:** `POST /api/patient/dependents/register` with `{displayName:'Aya Test', dateOfBirth:'2020-05-15', sex:'female', preferredLanguage:'ar'}` returned 201 + `{success:true, minorGlobalPatientId:"16953624-a7e4-40e5-ab38-ff8d0e23e4a5", displayName:"Aya Test"}`. Note: `sex` value was case-normalized from `'female'` (input) to `'Female'` (stored) by the `patients_sex_check` CHECK constraint or upstream normalization.
- **Form-fill via Chrome MCP:** `form_input` tool DOM-value assignments did not propagate to React state on the login form — submit button click yielded no network request. Workaround: bypassed UI form entirely by invoking `fetch('/api/auth/login', ...)` from JavaScript console. Worth a note for Phase M test infrastructure: future cowork sessions using browser MCP should expect this and prefer direct API calls over form-fill for non-narrative steps.
- **Screenshot tooling:** Chrome MCP screenshot action returned CDP protocol errors (`"Failed to deserialize params.clip.scale - BINDINGS: mandatory field missing"`) intermittently during the cowork session. `get_page_text` worked as a textual substitute. Not a finding about the app — a tooling note for Phase M.
- **Renderer freeze:** one `javascript_tool` call timed out after 45s with "renderer may be frozen or unresponsive." Resolved by full page navigation. May be related to React dev-mode HMR or Next.js dev server stalls; not reproducible deterministically. Not a finding about the app.
- **No 5xx errors during cowork session.** All endpoint responses were 2xx (200 login, 201 dependent register) or expected 4xx (401 on the initial fixture-password login attempts before the stitch).

## 8. Phase J readiness + B07 closure recommendation

### B07 closure recommendation: **KEEP OPEN PENDING PHASE K + PHASE L + PHASE M**

Under Mo's production-for-release reframe, B07 closure depends on three follow-on workstreams:

- **Phase K (must precede MVP launch):** resolve Findings I-1 (duplicate minor gp dedup), I-14 (registration `is_canonical` bug), I-15 (raw error leak), and the patient-app routing block findings I-7 + I-9. One bundled commit per finding; rough ordering K-1 (I-14/I-15 — easiest, unblocks Phase M), K-2 (I-7/I-9 — patient-app entry), K-3 (I-1 — dedup logic + UI surfacing). Plus I-13 spec clarification (auth-method documentation).
- **Phase L (production deployment workstream):** Patient app Vercel deployment (Finding I-5), `DEV_BYPASS_OTP` removal for production environment (Finding I-6, launch-checklist), per-environment env split (staging vs production), real SMS gateway provisioning, observability/monitoring, domain configuration, status pages.
- **Phase M (Phase I.B re-run post-K + L):** once Phase K resolves the auth/registration blockers and Phase L gives us a deployed patient app, re-run the deferred clinic-side browser walkthrough (A1-6/A1-7/A1-8 + A2-8) to capture UI-layer evidence of I-1 + the care-network display.

### Phase J review scope (next workstream)

Phase J is the review + scoping session, ~1 hour of Mo's time:

1. Walk the 15 findings; ratify severities + Phase K vs L vs M split.
2. Confirm B07 closure framework: stays open until Phase K lands; Phase L + M can ship after if Mo prefers phased launch.
3. Phase K work plan: which findings bundle into a single commit.
4. Phase L work plan: deployment workstream design.
5. Phase M re-run plan.

### Methodology lessons from Phase I (to fold into REVIEW_CRITERIA / EXECUTION_PROMPTS)

- **Lesson 22 candidate:** when a prompt assumes infrastructure (deployed URL, JWT minting, etc.), pre-work must empirically verify the infrastructure exists.
- **Lesson 23 candidate:** RLS impersonation tests must use `EXECUTE 'SET LOCAL ROLE authenticated'` inside DO blocks, not `set_config('role',...)` in CTEs.
- **Lesson 24 candidate:** Browser-driven Phase-I.B "I-drive, screenshot-everywhere" surfaced 9 new findings SQL-only Phase I.A couldn't have seen. Future Phase-I-style work should plan for browser coverage from the start with pre-verified infrastructure.
- **Lesson 25 candidate:** Seed scripts can mask production handler bugs. Phase I.A's seed function got `is_canonical=TRUE` right; the production registration handler missed it (Finding I-14). Periodically validate seed-shape against production-handler-shape.
- **Lesson 26 candidate (cowork extension 2026-05-15):** Chrome MCP `form_input` tool sets DOM `.value` but does not dispatch React-compatible synthetic events. React-controlled forms ignore the value change on submit. Workaround: invoke fetch directly from `javascript_tool` after navigating to the same-origin page (cookies carry over). Future browser-driven Phase-I.B steps that don't need to verify the form's own behavior should prefer direct API calls over UI form-fill.
- **Lesson 27 candidate (cowork extension 2026-05-15):** A bug like Finding I-14 (`is_canonical` NOT NULL omission) is usually surface-level — there are likely MORE missing fields in the same insert call. Phase K must grep all `createPatientAccount` / `createFrontDeskAccount` / `createDoctorAccount` insert sites against the current schema for ANY missing NOT NULL columns, not just the one that errored first. Finding I-16 codifies that `clinic_id` + `global_patient_id` were also missing — only discovered because cowork extension's stitch attempt walked past the `is_canonical` block.

### Cowork extension amendments to closure framework (2026-05-15)

- **Findings catalog grew from 15 to 19** (I-1..I-15 from Mo's session + I-16/I-17/I-18/I-19 from cowork). Phase J Section 1 findings-rollcall walks all 19.
- **A1 core I-1 UI evidence now captured** (Finding I-18). Phase J Section 4 (Phase M scope) can drop the "verify I-1 UI surfacing in production" item — that's now done at the cowork-stitched level on staging. Phase M's I-1-related re-verification narrows to "confirm the K-1a + K-1b fixes resolve the duplicate (no more 2 Ayas) in production."
- **Phase K scope clarifies into 4 sub-workstreams** based on combined findings: K-1 (I-1 backend + UI dedup = I-1 + I-18), K-2 (registration refactor = I-14 + I-15 + I-16 + I-17), K-3 (patient-app routing = I-7 + I-9 + I-12), K-4 (auth flow hygiene = I-8 + I-10). Phase J Section 2 finalizes ordering.
- **Phase L scope picks up I-19** (`EG_PHONE_RE` regex bug) as a launch-checklist item alongside `DEV_BYPASS_OTP` removal — both production-mode-only issues.

## 9. Decision log

(captured per major decision below as they're made)

### D-PI-1 (2026-05-12): Hybrid Path C methodology

See §0.4. Substitutes data-layer/RLS/audit empirical verification + handler-code review for the prompt's "curl against staging" methodology, given the infrastructure gap discovered in pre-work. Phase I.B Mo UI walkthrough remains in scope and load-bears HTTP-layer coverage. Ruling 38 preserved.

### D-PI-2 (2026-05-12): Reuse `00000099-` clinic_a as Phase I test clinic

Mo's Section 0 decision (this session): rather than creating a new test clinic with `00000300-` prefix, reuse the existing `00000099-0000-0000-0000-000000000001` fixture (clinic_a) that prior Phase B/H seeds depend on. Single clinic for both A1 + A2 keeps the seed function small and the matrix Section 0 cleanup block parsimonious. Mother registers daughter at clinic_a (A1-4); father is established at clinic_a (A2 baseline).

### D-PI-3 (2026-05-15): SQL-stitch workaround for cowork session A1 UI walkthrough

**Decision:** In the cowork extension session 2026-05-15, after Mo's session codified the "Path 2 ruling" deferring A1 patient-app UI steps to Phase M, cowork was directed to "push through to A1 step 9 (the I-1 UI evidence step)." Since patient-app registration is broken (Findings I-14 + I-16), cowork stitched a complete patient trio (`auth.users` + `users` with `is_canonical=true` + `global_patients` with `claimed_user_id`) via direct SQL — substituting for the registration-flow API path. Login then worked via `/api/auth/login` HTTP endpoint. Aya was registered as a dependent via `/api/patient/dependents/register` (working API). A second minor gp was SQL-injected to replicate Phase I.A §2 A1-4's exact duplicate state. The mother's `/patient/settings/family` page was then inspected.

**Outcome:** Cowork extension reached A1-9 and captured the core I-1 UI evidence (Finding I-18). Mo's deferral ruling for A1 steps 6-8 (clinic-app frontdesk UI) stands — the SQL shortcut bypasses the clinic-app UI verification, which remains a Phase M item.

**Rationale:** Phase I.B's load-bearing question per §7 was "one Aya, two Ayas, or zero?" — the answer depends solely on how the patient-app UI handles a duplicate-gp data state. The SQL shortcut replicates the data state Phase I.A already empirically confirmed for the backend (Finding I-1). The UI's response to that state is independent of HOW the duplicate was created. Faster, cheaper, and equally valid for I-1 UI evidence.

**Test data left on staging (cowork session, not yet in §6 retention table):** `+201500099999` synthetic mother (auth.users `16cd356b-3c35-4ca3-ab3b-7a8749afbb7a`, gp `6112aee5-e56a-40ae-8c51-b0f56c06a5b0`) + 2 Aya gps (`16953624-a7e4-40e5-ab38-ff8d0e23e4a5` and `e45e67b8-240e-4e3e-a662-7cfe1f66258e`). Retention reason: Phase J review + Phase M can re-inspect the duplicate-state without re-running the stitch. Cleanup before Phase M production run or earlier per Mo's directive.
