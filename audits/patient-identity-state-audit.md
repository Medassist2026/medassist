# Patient Identity State Audit

> Read-only audit of MedAssist as of 2026-04-26 (HEAD: `778467a`). Compares the
> current schema and code against the proposed network-first patient identity
> model (global phone identity, clinic-scoped relationship rows, directional
> consent via privacy code, search-privacy parity, dependent caregiver linkage,
> and a patient-facing app).
>
> Every claim is cited file:line. Where runtime data is required and not
> available from code, the line is marked **NEED RUNTIME ACCESS TO VERIFY**.

---

## Section A — Current schema state (per table)

### `patients` — PARTIAL

- `001_initial_schema.sql:43-49`: `id` PK = auth user, `unique_id TEXT
  UNIQUE`, `phone TEXT NOT NULL` (non-unique, plain index `001:52`),
  `registered BOOLEAN`. Demographics added `004:5-10`. Privacy fields
  added `013:13-18`: `phone_verified`, `account_status` CHECK
  (active/suspended/locked/dormant/merged), `last_activity_at`,
  `created_by_doctor_id`, `converted_at`. `clinic_id` added `019:10-13`,
  `NOT NULL` via mig 051 (TD-005). `guardian_id UUID REFERENCES
  patients(id)` added `030:13-18`.
- Active SELECT: `067_patients_clinic_policy.sql:68-87` — three-OR on
  `id = auth.uid()`, `can_access_patient(clinic_id, id, auth.uid(),
  'READ')`, legacy DPR fallback. Two more legacy SELECTs documented
  `067:30-36`; mig 068 staged to drop them.
- Row count: ARCHITECTURE.md:339 cites **35 patient rows** total
  (23 in Naser's clinic) at RLS-rewrite time.
- **Identity model: clinic-scoped.** `createWalkInPatient`
  (`patients.ts:574-639`) mints a fresh `users` row + `patients` row per
  walk-in, so the same phone at two clinics gets two `patients.id`s.
- Classification: **PARTIAL.** Needs (a) drop `clinic_id` from
  `patients`, (b) add UNIQUE on a normalized E.164 phone, (c) retire
  `unique_id` in favor of `privacy_codes` (Section C).

### `users` — PARTIAL

- `001_initial_schema.sql:11-17`: PK = auth.uid, `phone TEXT UNIQUE NOT
  NULL`, `email TEXT UNIQUE`, `role` (extended in
  `008_fix_frontdesk_and_patient_features.sql:9-11` to include `frontdesk`).
- `phone_verified` + `phone_verified_at` added
  `070_…sql:98-110`; backfilled to true for 288 rows (ARCHITECTURE.md:341).
- The `users.phone` UNIQUE is the *only* UNIQUE phone constraint in the
  schema; `patients.phone` is NOT UNIQUE.
- Classification: **PARTIAL for global patient identity.** A walk-in at
  Clinic A and a walk-in at Clinic B for the same phone would mint two
  separate `users` rows — `createWalkInPatient` (`patients.ts:574-606`)
  inserts a fresh `users.phone = data.phone`, which would 23505-collide
  if the phone were already in `users`. Practical collisions are rare
  today, but nothing enforces the global rule.

### `doctor_patient_relationships` — PARTIAL

- Created `010_phase8_FIXED.sql:20-31` with `UNIQUE(doctor_id, patient_id)`,
  `status`, `relationship_type`. Hardened in `013_privacy_reconciliation.sql:27-58`:
  added `access_type`, `access_level` (`ghost|walk_in_limited|verified_consented`),
  `consent_state` (`pending|granted|revoked`), doctor-entered-name fields,
  `verified_at`, `consent_granted_at`, `consent_revoked_at`, `last_visit_at`.
- `clinic_id` added `019_clinic_id_everywhere.sql:209-213`.
- RLS: `010_phase8_FIXED.sql:128-142` doctor-self / patient-self / doctor
  insert / doctor update; never rewritten in 020/021/055-067 series.
- Seeded into `patient_visibility` at mig 052 (32 rows;
  `052_seed_patient_visibility.sql:88-92`).
- Used heavily as the canonical "patient is in this clinic" join key —
  `searchMyPatients()` (`patients.ts:867-915`) and the frontdesk search path
  (`packages/shared/lib/api/handlers/patients/search/handler.ts:55-90`).
- Classification: **PARTIAL.** Concept is right (per-doctor, per-clinic
  scoping). Needs (a) flip from per-doctor to per-clinic — the new model
  scopes data by `(clinic_id, patient_id)` not by `(doctor_id, patient_id)`;
  (b) drop the access-level/consent-state ladder, which mixes data
  visibility with messaging consent.

### `anonymous_visits` — DEAD-ish

- `013_privacy_reconciliation.sql:79-88`: `(doctor_id, visit_date,
  daily_number)` unique. RLS doctor-only
  (`013_privacy_reconciliation.sql:357-361`).
- Used by `createGhostVisit()` (`patients.ts:750-794`) and counted by
  `getAnonymousVisitCount()` (`patients.ts:1162-1174`). Surfaced in
  `/api/patients/anonymous` (handler at
  `packages/shared/lib/api/handlers/patients/anonymous/handler.ts:12-38`).
- Classification: **DEAD for the new model.** Ghost mode is doctor-scoped,
  pre-network — the new model expects every patient to have a real global
  row. Recommend retention only as a "decline-to-share" counter for
  analytics, not as a parallel identity surface.

### `opt_out_statistics` — DEAD

- `013_privacy_reconciliation.sql:90-96`. Doctor-only RLS.
- Written by `createGhostVisit()` (`patients.ts:778-783`). Read by
  `getOptOutStats()` (`patients.ts:1179-1201`).
- Classification: **DEAD for the new model.** Tied to ghost-visit flow.
  Recommend delete or repurpose.

### `patient_phone_history` — ALIGNED (with extensions)

- `013_privacy_reconciliation.sql:98-105`. Extended in
  `070_users_phone_verified_and_phone_change_for_staff.sql:120-149`:
  `changed_by FK→users(id)`, `change_reason TEXT CHECK` enum.
- Written by `createWalkInPatient` (`patients.ts:670-678`) and the
  `change_phone_commit` SQL function
  (`070_users_phone_verified_and_phone_change_for_staff.sql:331-345`).
- Classification: **ALIGNED.** Append-only history; matches new model
  immutable-past requirement. Audit fan-out covered by `change_phone_commit`
  for both the original change and the rollback compensation path
  (mig 070:412-431).

### `patient_recovery_codes` — DEAD

- `013_privacy_reconciliation.sql:107-114`. Stores hashed codes per patient
  with `expires_at` and `used_at`.
- **No code reads or writes this table** outside of the type definition at
  `packages/shared/lib/supabase/types.ts:1745`.
- Classification: **DEAD.** Either retire or reclaim its shape for the new
  privacy-code mechanism (Section C below).

### `phone_change_requests` — ALIGNED

- `013_privacy_reconciliation.sql:116-124`. Extended in
  `070_users_phone_verified_and_phone_change_for_staff.sql:158-194`:
  `user_id` nullable, XOR check `(patient_id IS NULL) <> (user_id IS NULL)`,
  status CHECK extended to include `'rejected'`. Three RLS policies added
  (`mig 070:208-242`).
- Driven by ~1100 LOC at `packages/shared/lib/data/phone-changes.ts`.
- Classification: **ALIGNED for the phone-change flow.** Independent of the
  new identity model.

### `otp_codes` — ALIGNED

- `013_privacy_reconciliation.sql:126-134`. `purpose` CHECK extended in mig
  041 (per ARCHITECTURE.md TD-009 commentary at `070_…sql:64-65`).
- Classification: **ALIGNED.** Unchanged by the new model.

### `clinical_notes` — PARTIAL

- `001_initial_schema.sql:107-127`: keyed by `(doctor_id, patient_id)`. Free
  prescription JSON; no `clinic_id`.
- `clinic_id` added `016_multi_tenant_clinic.sql:7-13`, backfilled and made
  NOT NULL via the 045-051 series (per ARCHITECTURE.md TD-005, mig 046).
- Active SELECT: `066_clinical_notes_clinic_policy.sql` (referenced from mig
  068 line 161). Active INSERT: tightened to "Doctors can insert notes in
  their clinic" (`021_centralized_access_control.sql:162-170`).
- Classification: **PARTIAL.** Already clinic-scoped, but the join key is
  `patient_id` (a per-clinic walk-in id). Once the patient model goes global,
  clinical_notes need either (a) keep `patient_id` and *globalize* it, or
  (b) add `global_patient_id` column and migrate. The new model says (a) —
  every clinical row points to the global patient id.

### `prescriptions` — PARTIAL

- Standalone prescriptions table added in mig 017 (referenced
  `017_add_prescriptions_table.sql` per migrations list).
- Same shape risk as `clinical_notes`: `patient_id` is the local one.
- Classification: **PARTIAL.** Same migration story.

### `clinic_memberships` — ALIGNED

- `018_clinic_memberships.sql:19-29`. Unified RBAC with `clinic_role` enum
  (`OWNER|DOCTOR|ASSISTANT|FRONT_DESK`) and `membership_status`
  (`ACTIVE|INVITED|SUSPENDED`). `UNIQUE(clinic_id, user_id)`.
- RLS recursion fixed via `056_fix_clinic_memberships_recursion.sql`
  (referenced from mig 070:223; uses SECURITY DEFINER `is_clinic_member`).
- Classification: **ALIGNED.** This is the right tenant primitive for the
  new model.

### `patient_visibility` — PARTIAL

- `020_assignments_visibility_audit.sql:93-104`. Mode enum
  (`DOCTOR_SCOPED_OWNER|CLINIC_WIDE|SHARED_BY_CONSENT`) + consent enum
  (`IMPLICIT_CLINIC_POLICY|DOCTOR_TO_DOCTOR_TRANSFER|PATIENT_CONSENT_CODE`)
  + `expires_at`. Seeded by mig 052 (32 rows live;
  `052_seed_patient_visibility.sql:67-84`). Partial UNIQUE index on
  `(clinic_id, patient_id, grantee_user_id) WHERE grantee_type='DOCTOR'`
  (`052_seed_patient_visibility.sql:42-44`).
- Read path: `can_access_patient` (mig 054).
- Live data per memory record `project_rls_rewrite_status.md`: every active
  grant points to clinic OWNERs; production is effectively solo today.
- Classification: **PARTIAL.** It already encodes intra-clinic sharing, but
  the new model wants *cross-clinic* directional consent
  (clinic A → clinic B). The current `patient_visibility` row has
  `grantee_user_id` (a doctor) and `clinic_id` (one clinic), so it can only
  describe "doctor X in clinic C can see patient P", not "clinic A can see
  clinic B's data on patient P".

### `patient_shares` — MISSING

- No table named `patient_shares` exists. Grep confirms zero hits across the
  repo. The new model's directional consent grant ("patient grants clinic X
  access to clinic Y's data") has no schema today.

### `audit_events` — ALIGNED

- `020_assignments_visibility_audit.sql:168-178` plus per-row clinic / actor
  / action / entity / metadata / ip. Owner SELECT + universal INSERT
  policies (`mig 020:193-207`).
- Used by `logAuditEvent` (`packages/shared/lib/data/audit.ts:46-63`).
- Action enum: 25 values, includes `VIEW_PATIENT`, `SHARE_PATIENT`,
  `REVOKE_SHARE`, plus phone-change set (`audit.ts:5-35`).
- Classification: **ALIGNED.** Right shape for the privacy-code attempt
  log too — needs a couple of extra action enum values
  (`CODE_ATTEMPT_SUCCESS`, `CODE_ATTEMPT_FAILURE`, `LOCKED_OUT`).

### `audit_log` — DEAD/legacy

- ARCHITECTURE.md:319 calls it legacy; service-role-only and not OWNER
  visible. Used by older modules (`packages/shared/lib/audit/logger.ts:18-41`,
  fire-and-forget).
- Classification: **DEAD.** TD-013 already flags deprecation. Migrate
  callers to `audit_events`.

### `consent_log` — MISSING

- No table named `consent_log` exists. The closest analogue is
  `patient_consent_grants` (`013_privacy_reconciliation.sql:213-227`),
  which records `(doctor_id, patient_id, clinic_id, consent_type)` for
  `messaging` and `history_sharing` only — not for cross-clinic data
  visibility.

### `encounters` — MISSING

- No table named `encounters`. The functional analogue is `clinical_notes`
  + `appointments`.

---

## Section B — Phone normalization

- Phone columns: `users.phone` (`001:13`), `patients.phone` (`001:46`),
  `patients.parent_phone` (`004:9`), `patient_phone_history.phone`
  (`013:101`), `phone_change_requests.old_phone`/`new_phone` (`013:119-120`).
- **No E.164 normalization at the schema layer.** Validation lives in
  `packages/shared/lib/utils/phone-validation.ts` (canonical helpers per
  ARCHITECTURE.md:442). Server-side `validateEgyptianPhone` returns a
  normalized E.164 form; data-layer code uses the local 11-digit form
  (`createWalkInPatient` writes `data.phone` straight through —
  `patients.ts:619`).
- D-053 (DECISIONS_LOG.md:562-564) explicitly leaves storage canonicalization
  in TD-009: today the database holds a mix of `01XXXXXXXXX` and
  `+201XXXXXXXX` forms (170 of 288 use the local form per D-053 narrative).
- The phone-history fallback in `createWalkInPatient` (`patients.ts:466-474`)
  searches both forms via an `or` filter, which is the load-bearing evidence
  that mixed formats really do exist.
- **UNIQUE phone constraints today:** `users.phone` UNIQUE
  (`001_initial_schema.sql:13`); `patients.phone` is **NOT UNIQUE** (the
  index at `001:52` is plain). The new model's "single global row keyed by
  phone" requirement is therefore unsatisfied today.
- **Duplicate-phone count in production:** **NEED RUNTIME ACCESS TO VERIFY.**
  Resolves with:

  ```sql
  SELECT phone, COUNT(*)
  FROM public.patients
  GROUP BY phone
  HAVING COUNT(*) > 1;
  ```

  The codebase ships a SECURITY DEFINER helper for exactly this — invoke
  `SELECT * FROM public.find_duplicate_patient_phones();`
  (`013_privacy_reconciliation.sql:272-284`). Mo's memory record
  `project_rls_rewrite_status.md` describes the live data as 32 active
  grants pointing to clinic OWNERs, which is consistent with each clinic
  having its own walk-in patient row per phone (i.e. duplicates in
  `patients.phone` are expected at every clinic boundary).

---

## Section C — Existing consent / share mechanisms

- **Privacy code:** there is no rate-limited, regeneratable, lockout-aware
  privacy code today. The closest mechanism is `patients.unique_id`
  (`001:46`), minted as `MED-${nanoid(6).toUpperCase()}` in
  `createWalkInPatient` (`patients.ts:612`). It is used as a one-shot
  patient-shares-to-doctor token in:
  - `verifyPatientCode` (`patients.ts:137-177`) — timing-safe compare via
    `timingSafeEqualString` (`patients.ts:162`).
  - `upgradeRelationship` (`patients.ts:982-1078`) — same compare; on
    success flips the relationship to `verified_consented` and grants
    `messaging` consent in `patient_consent_grants`.
  - `/api/patients/verify-code` (handler at
    `packages/shared/lib/api/handlers/patients/verify-code/handler.ts:1-77`,
    rate-limited 12/min).
  - `/api/patients/upgrade-relationship`
    (`apps/clinic/app/api/patients/upgrade-relationship/route.ts:23-124`,
    rate-limited 10/min).
  No 5-attempts-per-hour cap, no 24h lockout, no audit row per attempt
  (only success path writes to `patient_consent_grants`), no SMS to patient
  on lockout.
- **`patient_recovery_codes`** exists in schema (`013:107-114`) but is
  unused — see Section A. Could be repurposed for the new privacy code
  table, but recommend a fresh shape that includes `attempts_count`,
  `locked_until`, `regenerated_count` per privacy-code requirements.
- **Share table:** `patient_visibility`
  (`020_assignments_visibility_audit.sql:93-104`) is the only existing
  sharing surface. It models intra-clinic doctor↔doctor grants, **not**
  cross-clinic clinic↔clinic grants. `sharePatientWithDoctor`
  (`packages/shared/lib/data/visibility.ts:73-98`) inserts a
  `SHARED_BY_CONSENT` row keyed to a target *doctor user id* in the same
  clinic. `revokeVisibility`
  (`visibility.ts:131-141`) is a hard delete (the new model wants soft
  revoke so past views remain auditable).
- **Code-based share flow:** `verifyPatientCode` and `upgradeRelationship`
  above. Both compare against `patients.unique_id`. There is no SMS-based
  ephemeral code path. `/api/patients/onboard` accepts an optional
  `patientCode` body field
  (`packages/shared/lib/api/handlers/patients/onboard/handler.ts:160`)
  which routes through the same `verifyPatientCode`.
- **Cross-clinic data visibility today:** none. Every read path joins
  through clinic-scoped `patient_id` rows that were created at *that*
  clinic. The clinic_id NOT NULL invariant on `clinical_notes` (mig 046),
  `payments` (mig 047), and 19 other tables (mig 051) closes the only
  legacy paths that could have leaked across clinics. The OPD-004
  open question (PRODUCT_SPEC.md:210-225) explicitly defers cross-clinic
  identity merging to the patient app (Phase 2).

---

## Section D — Search privacy

- **Phone existence check:**
  `GET /api/patients/check-phone` →
  `packages/shared/lib/api/handlers/patients/check-phone/handler.ts:19-69`
  → `checkPhoneExists` (`patients.ts:102-130`).
- **Behavior matrix today:**
  - **Phone matches a registered (`registered=true`) patient anywhere in
    the system** → `{ exists: true, isRegistered: true }` (handler line
    57-64; data-layer line 126-129).
  - **Phone matches a walk-in (`registered=false`) patient at any clinic**
    (including this clinic's own walk-in) → `{ exists: false, isRegistered:
    false }` (data-layer line 121-122 — the `.eq('registered', true)` filter
    drops it).
  - **Phone does not exist in `patients` at all** → same response as above.
- **Privacy parity:** YES for walk-in vs. not-found (both return identical
  payload). NO for registered vs. anything-else (registered patients are
  *always* identifiable to any logged-in doctor or frontdesk caller). This
  is the leak: a registered patient's existence is visible to every clinic
  in the network, while the new model wants the response to be
  indistinguishable across all three cases unless the caller has a code or
  consent.
- **Reproducer (HTTP):**
  ```
  GET /api/patients/check-phone?phone=01000000003
  → { exists: true, isRegistered: true, valid: true }   # registered patient

  GET /api/patients/check-phone?phone=01000000099
  → { exists: false, isRegistered: false, valid: true } # not registered or absent
  ```
  The two responses are not byte-equivalent — the leak is structural.
- **Timing parity:** the data-layer query short-circuits as soon as
  `.maybeSingle()` returns null (`patients.ts:118-122`); a hit returns
  immediately. Index `idx_patients_phone` (`001:52`) means lookup is
  O(log n). Response time should be near-uniform across all three cases at
  this scale (35 rows). **NEED RUNTIME ACCESS TO VERIFY** — measure with
  `time curl …` against staging at p99 over 1k requests.
- **Patient list search (frontdesk):**
  `GET /api/patients/search` →
  `packages/shared/lib/api/handlers/patients/search/handler.ts:17-102`.
  For frontdesk, scopes to the caller's clinic via
  `getFrontdeskClinicId(supabase, user.id)` (line 50). Returns full
  `patient.full_name`, `phone`, `unique_id` (line 81). For doctors,
  `searchMyPatients` (`patients.ts:867-915`) restricts to the doctor's own
  relationships. **No leak across clinics for search** because of the
  `doctor_patient_relationships.clinic_id` filter at line 61.

---

## Section E — Dependent / caregiver / guardian

- **Schema:** `patients.parent_phone` and `patients.is_dependent` added in
  `004_add_patient_demographics.sql:5-10` (TEXT phone string, not FK).
  `patients.guardian_id UUID REFERENCES patients(id)` added in
  `030_add_guardian_id_to_patients.sql:13-14` ON DELETE SET NULL with
  partial index (`030:16-18`).
- **No `parent_user_id` / `managed_by` / `child_account` /
  `linked_account` / `family_member` columns or tables exist** (grep at
  `packages/shared/lib/data/`, full repo: 14 hits, all guardian/dependent).
- **Data-layer flow:** `createWalkInPatient` does dependent dedup
  (`patients.ts:463-540`) on `(parent_phone, full_name)` then resolves
  `guardian_id` from `patients` by phone match
  (`patients.ts:548-570`). New record stores both `parent_phone` (text
  fallback) and `guardian_id` (FK; lines 624-626). On returning visit, only
  a new doctor-patient relationship is created for the existing dependent
  (lines 504-522).
- **UI flow:** the clinical session form
  (`packages/shared/components/clinical/SessionForm.tsx:42-45,234,585-587,
  837-855,1110-1336`) supports an `isDependent` chip; when enabled, name
  search surfaces siblings under the same `parent_phone`
  (`SessionForm.tsx:1320-1336`).
- **Patient-side visibility:** the patient app does not surface the
  guardian↔child relationship today. There is no "managed accounts"
  pane in `apps/patient/app/(patient)/`.
- **State: PARTIAL.** Schema and clinic-side onboarding are wired; patient
  app does not surface caregiver linkage; the new model's "audited
  separately" caregiver flow (per the spec) is not yet codified — there is
  no `caregiver_links` ledger or audit action for "caregiver added/removed".

---

## Section F — Audit logging coverage

- **Two modules** (per ARCHITECTURE.md:447 and TD-013):
  - `audit_events` (clinic-scoped, OWNER readable, mig 020:168-207). 25
    AuditAction values (`packages/shared/lib/data/audit.ts:5-35`),
    including `VIEW_PATIENT`, `SHARE_PATIENT`, `REVOKE_SHARE`, plus 7
    phone-change values.
  - `audit_log` (legacy, service-role-only,
    `packages/shared/lib/audit/logger.ts:18-41`).
- **Privacy-event coverage:**
  - **VIEW_PATIENT:** wired in `logPatientView` (`patients.ts:1141-1153`)
    and in the doctor patients handler
    (`packages/shared/lib/api/handlers/doctor/patients/handler.ts:175`).
    But callers do not always invoke it — e.g. `/api/patients/[id]` does
    not call `logPatientView` (NEED RUNTIME ACCESS TO VERIFY trace).
  - **SHARE_PATIENT:** wired in
    `packages/shared/lib/api/handlers/clinic/share-patient/handler.ts:41-48`.
  - **REVOKE_SHARE:** wired in
    `packages/shared/lib/api/handlers/patient/sharing/handler.ts:87-92`.
  - **CODE_ATTEMPT (success / failure / lockout):** **not in the enum,
    not written anywhere.** Both `verifyPatientCode` (`patients.ts:137-177`)
    and the upgrade-relationship handler exit silently on bad code
    (`upgrade-relationship/route.ts:67-75`).
- **Reliability:** `logAuditEvent` swallows errors in a `try/catch`
  (`audit.ts:46-63`) and is *not awaited* by `share-patient/handler.ts:41`
  or `patient/sharing/handler.ts:87`. Both call sites drop the promise on
  the floor — fire-and-forget. `createWalkInPatient` does `await`
  `logAuditEvent` for the CREATE_PATIENT row (`patients.ts:643-655`), so
  the contract is inconsistent. Legacy `audit_log` is explicitly
  fire-and-forget via `void (async () => …)()` (`audit/logger.ts:20`).
- **State:** privacy-event audit is **partial**: viewing is wired (with
  gaps), sharing/revoking is wired (fire-and-forget), and code-attempt
  audit is missing entirely.

---

## Section G — Patient app surface

- **Yes, there is a patient app.** `apps/patient/` contains a Next.js 14
  app with a `(patient)` route group:
  - `dashboard/page.tsx`, `messages/page.tsx`, `sharing/page.tsx`,
    `appointments/page.tsx`, `health/page.tsx`, `prescriptions/page.tsx`,
    `diary/page.tsx`, `more/page.tsx` (per the directory listing).
  - The sharing page (`apps/patient/app/(patient)/patient/sharing/page.tsx:1-50`)
    binds to `GET/DELETE /api/patient/sharing` (handler at
    `packages/shared/lib/api/handlers/patient/sharing/handler.ts:1-99`),
    which reads/revokes `patient_visibility` rows scoped to the patient.
- **Login flow:** the patient app inherits the same Supabase auth flow as
  the clinic app via `middleware.ts`. Patient OTP sign-in is supported via
  the shared `/api/auth` routes; password sign-in is the default. The
  PRODUCT_SPEC.md:85-89 notes that PWA-via-WhatsApp + OTP is the eventual
  delivery model, but today the route group is co-located with the
  password flow.
- **State: PARTIAL.** Patient app routes and a sharing UI exist. RLS-side,
  the new policies (`067_patients_clinic_policy.sql:71-87`) explicitly
  permit `id = auth.uid()` self-view, so a patient can read their own
  global row today — but the app does not yet show a *cross-clinic
  history* (each `clinical_notes` row is keyed to the per-clinic
  `patient_id`, so the patient sees only the visits at the clinic where
  their auth account was minted unless duplicates have been merged).

---

## Section H — Migration risk inventory

| Schema change | Table(s) | Rows | Type | Break risk | RLS off | Downtime |
|---|---|---|---|---|---|---|
| Normalize `patients.phone` to E.164 + add UNIQUE | patients | 35 | Additive→enforcing | `createWalkInPatient` (`patients.ts:619`) + `searchMyPatients` (`patients.ts:907`) need normalize step | No | ~1 min |
| Dedup `patients.phone` ahead of UNIQUE | patients | **NEED RUNTIME ACCESS TO VERIFY** | Destructive | Clinical writes break mid-collapse | Briefly | 5-15 min |
| Drop `patients.clinic_id` (move to scoped relationship) | patients | 35 | Destructive | Major: `patients.ts:660-666` writes it; mig 052:50-52 seeds on it | Yes | ~10 min |
| Replace DPR with `patient_clinic_relationships` (per-clinic) | DPR + patient_visibility | 32 active | Destructive | Every onboarding/search/dedup path rewrites | Yes | ~30 min |
| Add `patient_shares` (directional consent) | new | 0 | Additive | None | No | None |
| Add `privacy_codes` (rate-limited, regeneratable) | new (or recycle `patient_recovery_codes`) | 0 | Additive | None | No | None |
| Replace `patients.unique_id` consumers with `privacy_codes` | code | n/a | App-only | `verifyPatientCode`, `upgradeRelationship`, onboard handler | No | None |
| Extend `AuditAction` with CODE_ATTEMPT_* | code | n/a | Additive | None | No | None |
| Soft-revoke `patient_visibility` | patient_visibility | 32 | Additive | `revokeVisibility` (`visibility.ts:131-141`) UPDATE not DELETE | No | None |
| Drop dead tables (`anonymous_visits`, `opt_out_statistics`, `patient_recovery_codes`, `audit_log`) | DEAD | unknown — **NEED RUNTIME ACCESS TO VERIFY** | Destructive | Two ghost-mode read paths + TD-013 callers | No | ~1 min |

Highest-risk: the UNIQUE add (gated on dup count) and `patients.clinic_id`
removal (touches every clinic-resolving write path —
`patients.ts:240-252`).

---

## Section I — Cross-impact summary

### Schema layer (migrations)
1. New mig: normalize `patients.phone` to E.164 in-place + add UNIQUE.
2. New mig: dedup `patients` by phone, chained-merge through
   `clinical_notes`, `appointments`, `prescriptions`,
   `doctor_patient_relationships`, `patient_visibility`,
   `patient_phone_history`, `medication_intake_log`, etc. Functionality
   sketched at `find_duplicate_patient_phones` /
   `mark_duplicate_patients` (mig 013:272-295).
3. New mig: `patient_shares` table (directional, `(grantor_clinic_id,
   grantee_clinic_id, patient_id, expires_at, revoked_at, granted_via,
   audit_event_id)`).
4. New mig: `privacy_codes` table (`(patient_id, clinic_id, code_hash,
   created_at, attempts_count, locked_until, regenerated_count)`).
5. New mig: extend `AuditAction` enum (textual; no schema enum yet — it's
   TS-only at `audit.ts:5-35`); add `CODE_ATTEMPT_SUCCESS`,
   `CODE_ATTEMPT_FAILURE`, `CODE_ATTEMPT_LOCKED`, `SMS_CONSENT_SENT`.
6. New mig: drop `clinic_id` from `patients` once relationship-row split is
   complete.
7. New mig: drop `anonymous_visits`, `opt_out_statistics`,
   `patient_recovery_codes` if not repurposed; drop legacy `audit_log`
   per TD-013.
8. New mig: rewrite `patient_visibility` policies and seed for the
   directional model (or migrate to `patient_shares`).
9. RLS: rewrite `can_access_patient` to consult `patient_shares` for
   cross-clinic reads (mig 054:75-117 today only consults
   `patient_visibility`).

### Data access layer (`packages/shared/lib/data/`)
10. `patients.ts:102-130` `checkPhoneExists` — reshape to uniform
    `{ exists: false, requiresCode: true }` for all inputs; truth only
    after code redemption. Drop `.eq('registered', true)`.
11. `patients.ts:137-177` `verifyPatientCode` — switch from `unique_id`
    compare to `privacy_codes` lookup with attempt + lockout logic.
12. `patients.ts:189-433` `onboardPatient` and
13. `patients.ts:440-740` `createWalkInPatient` — stop minting a fresh
    `patients` row when a global row already exists for the phone;
    create a relationship row instead.
14. `patients.ts:867-915` `searchMyPatients` — scope only via the new
    `patient_clinic_relationships`.
15. `visibility.ts:73-141` `sharePatientWithDoctor`,
    `setClinicWideVisibility`, `revokeVisibility`,
    `createDefaultVisibility` — rewrite for `patient_shares`; revoke
    becomes UPDATE not DELETE.
16. `visibility.ts:147-166` `ensurePatientAccess` — call a new
    `can_access_patient_v2(global_patient_id, clinic_id, user_id)` that
    consults shares.
17. `messaging-consent.ts:103-161` `ensureMessagingConsent` — re-derive
    from the new relationship row, not DPR access_level.
18. `patient-dedup.ts:212-294` `mergePatients` — migrate
    `patient_visibility` / `patient_shares` rows too.
19. `audit.ts:5-35` — extend AuditAction with `CODE_ATTEMPT_*`,
    `SMS_CONSENT_SENT`.
20. New: `privacy-codes.ts` (regen, verify, lockout, audit) and
    `patient-shares.ts` (grant, revoke-soft, list).

### API routes
21. `apps/clinic/app/api/patients/check-phone/route.ts` — reshape per #10.
22. `apps/clinic/app/api/patients/verify-code/route.ts` and
    `apps/clinic/app/api/patients/upgrade-relationship/route.ts` — switch
    to `privacy_codes`; add CODE_ATTEMPT audit writes.
23. `apps/clinic/app/api/patients/onboard/route.ts` — rewire to the new
    identity model.
24. New: `POST/DELETE/GET /api/clinic/patient-shares`,
    `POST /api/patient/privacy-code/regenerate`,
    `POST /api/sms/consent-share` (5-min ephemeral code SMS in Egyptian
    Arabic per spec g).
25. `apps/clinic/app/api/clinic/share-patient/route.ts` and
    `apps/patient/app/api/patient/sharing/route.ts` — re-target at
    `patient_shares` with extend / permanent / revoke controls.

### UI
26. `packages/shared/components/clinical/SessionForm.tsx:1110-1336` —
    phone-first picker + privacy-code modal for cross-clinic phones,
    consistent with D-057 (PRODUCT_SPEC.md:48-55).
27. `packages/ui-clinic/components/frontdesk/PatientRegistrationForm.tsx`
    — same change.
28. `apps/patient/app/(patient)/patient/sharing/page.tsx` — privacy-code
    regenerate widget + grant duration controls (90d / 1y / permanent).
29. Front-desk SMS consent dialog with read-back affordance.

### Tests
30. Vitest under `packages/shared/lib/data/__tests__/` for privacy-code
    rate-limit + lockout.
31. Check-phone parity test (uniform response shape across all 3 states).
32. Search-timing test (p99 ≤ p50 + epsilon).
33. Extend `useOfflineMutation` test
    (`packages/shared/hooks/__tests__/useOfflineMutation.test.ts`) for
    privacy-code-aware idempotency.

---

### Closing notes

- Migs 013, 020/021, and 052-068 built a coherent **clinic-scoped**
  model with intra-clinic `patient_visibility` sharing. Identity is not
  yet global — OPD-004 (PRODUCT_SPEC.md:210-225) documents the gap.
- Missing load-bearing pieces: phone normalization + UNIQUE,
  cross-clinic `patient_shares`, privacy-code lifecycle with lockout,
  CODE_ATTEMPT audit, soft-revoke semantics.
- Three claims need runtime access (flagged inline).
