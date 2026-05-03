# Patient Identity Build 06 — Phase A Progress Note

**Status:** Phase A pre-flight in progress. Cowork session paused to surface architectural ambiguities before committing to policy shape.
**Date:** 2026-04-30
**Prompt:** Prompt 6 — RLS Policy Rewrite (highest-risk prompt in the program)

This is NOT the final build-06 results doc. It is a checkpoint so Mo can review architectural decisions before Phases B/C burn 8+ hours on the wrong policy shape.

---

## A.1 — pg_policies snapshot ✅ COMPLETE (2026-04-30)

`audits/rls-pre-migration-snapshot.sql` is built and verified:
- **166 CREATE POLICY** statements (= 166 source rows)
- **166 DROP POLICY IF EXISTS** guards (idempotent rerun)
- **58 ALTER TABLE … ENABLE ROW LEVEL SECURITY** lines (one per distinct policy-bearing tablename)
- 58 distinct tables in CREATE POLICY (= source distinct count)
- 1,035 lines / 72,509 bytes
- No truncation markers

Verified independently from cowork bash after delegated build. File is the deterministic rollback artifact for mig 101 (legacy drop; originally referred to as "mig 098" pre-session-16 renumbering) and the input to Phase G rollback rehearsal.

---

## A.1 — original generator notes (preserved for reproducibility)

**Findings from staging (`mtmdotixlhwksyoordbl`):**
- 166 policies across 58 tables in the `public` schema
- Total CREATE POLICY string length: 62,187 chars (verified via `length(string_agg(...))`)
- All policies are `PERMISSIVE`, none are `RESTRICTIVE`
- Policies use 3 existing helper functions which Phase B inherits and extends:
  - `is_clinic_member(clinic_id, auth.uid())` — used in 40+ policies
  - `can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text)` — used in `clinical_notes` and similar clinical-data tables
  - `can_open_messaging_conversation(doctor_id, patient_id)` — used only in `conversations` INSERT

**Snapshot file status:** the canonical `audits/rls-pre-migration-snapshot.sql` is NOT YET BUILT — first attempt was truncated to 9 of 166 policies; second attempt wrote to wrong path. Rather than continue burning context on subagent retries, the **server-side generator SQL is documented below** — running it against staging in 3 chunks deterministically reproduces the snapshot. To regenerate before mig 092 ships:

```sql
-- Chunk 1: rows 1–56
-- Chunk 2: rows 57–110
-- Chunk 3: rows 111–166

WITH ordered AS (
  SELECT
    format(
      E'-- Policy: %I on public.%I (cmd=%s, permissive=%s)\nDROP POLICY IF EXISTS %I ON public.%I;\nCREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
      policyname, tablename, cmd, permissive,
      policyname, tablename,
      policyname, tablename,
      CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      cmd,
      array_to_string(roles, ', '),
      CASE WHEN qual IS NOT NULL THEN E'\n  USING (' || qual || ')' ELSE '' END,
      CASE WHEN with_check IS NOT NULL THEN E'\n  WITH CHECK (' || with_check || ')' ELSE '' END
    ) AS policy_sql,
    row_number() OVER (ORDER BY tablename, policyname) AS rn
  FROM pg_policies
  WHERE schemaname = 'public'
)
SELECT string_agg(policy_sql, E'\n\n' ORDER BY rn) AS chunk
FROM ordered
WHERE rn BETWEEN <LO> AND <HI>;
```

Concatenate the three `chunk` strings, prepend the 58 `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` lines (one per distinct tablename), write to `audits/rls-pre-migration-snapshot.sql`. Verify: `grep -c "^CREATE POLICY"` MUST equal 166.

The data is reachable verbatim from `pg_policies` at any time before mig 101 drops legacy policies, so the snapshot remains regeneratable up to that cut-over moment. Plan G rollback rehearsal will regenerate fresh on the clone, not depend on the static file.

---

## A.2 — `createAdminClient` callsite inventory (count only)

92 files reference `createAdminClient` (grep across `**/*.ts` + `**/*.tsx`). Full per-callsite triage (KEEP-ADMIN / MIGRATE-TO-USER / INVESTIGATE) is a multi-hour task and is queued as Phase F work — **NOT** Phase A. Mo's prompt scopes this to A.2 but realistically it sits closer to Phase F since each migration decision depends on the new RLS shape. Proposing to relocate the per-callsite triage to Phase F-prep where it logically belongs.

The 92 files break down (by directory):
- `packages/shared/lib/data/*.ts` — ~22 files (data-layer modules)
- `packages/shared/lib/api/handlers/**/*.ts` — ~45 files (API handlers)
- `apps/clinic/app/api/**/*.ts` — ~16 files (clinic-app route stubs)
- `apps/patient/**/*.ts(x)` — 1 file
- `packages/shared/lib/{auth,audit,sms,security,notifications,privacy,utils}/*.ts` — 8 files
- `packages/shared/lib/supabase/admin.ts` — the helper itself (KEEP)

92 files is consistent with "every previous prompt added handlers that bypassed RLS through admin client because RLS was DENY-ALL" — exactly the situation Prompt 6 corrects.

---

## A.3 — patient-joined tables (verified against staging)

Per `list_tables` against staging public schema, the following patient-joined tables exist (verified — no missing):

`global_patients`, `patients` (legacy), `patient_clinic_records`, `patient_data_shares`, `patient_privacy_codes`, `privacy_code_attempts`, `privacy_code_sms_tokens`, `clinical_notes`, `prescriptions`, `medications`, `medication_intake_log`, `lab_results`, `imaging_orders`, `appointments`, `check_in_queue`, `payments`, `messages`, `notifications`, `audit_events`, `doctor_patient_relationships`, `patient_phone_history`, `chronic_conditions`, `vital_signs`, `conversations`, `default_sharing_preferences`, `dependent_account_links`, `messaging_consent`, `anonymous_clinical_observations`, `patient_consent_grants`, `patient_visibility`.

**Notable discrepancies from Mo's prompt's table list:**
- `prescription_templates` — does not exist (the table is `doctor_templates`)
- `templates` — does not exist (per above; doctor templates live on `doctor_templates`)
- `messaging_consent` — exists (Mo's prompt said "if it exists post-Build-05")
- Additional patient-joined tables not on Mo's list: `chronic_conditions`, `vital_signs`, `default_sharing_preferences`, `patient_phone_history`, `patient_consent_grants`, `anonymous_clinical_observations`. Each needs a policy decision.

---

## A.5 — `audit_events` visibility model

**Existing policy on staging (verbatim):**
```sql
CREATE POLICY owners_view_audit_events ON public.audit_events
  AS PERMISSIVE FOR SELECT TO public
  USING (
    clinic_id IN (
      SELECT clinic_memberships.clinic_id
      FROM clinic_memberships
      WHERE clinic_memberships.user_id = auth.uid()
        AND clinic_memberships.role = 'OWNER'::clinic_role
        AND clinic_memberships.status = 'ACTIVE'::membership_status
    )
  );
```

This is OWNER-only — but Build 04+ writes audit rows for system actions (mig 088 trigger, mig 089 backfill, mig 091 SECURITY DEFINER functions) that should be readable by any clinic member, not just OWNERs. Phase C will widen this. **Patient-side audit visibility** is the harder design question (Mo's prompt § A.5 options A/B/C) — I recommend Option A (`metadata_global_patient_id` generated column) but want to confirm before adding it (see ambiguity #5 below).

---

## Architectural ambiguities — flagging before committing to Phase B

The prompt explicitly says: "If at any point during execution you encounter genuine ambiguity that the specification doesn't resolve, STOP and surface the question to Mo before guessing." I've found six. Listed in order of how much they shape Phase C/F.

### Ambiguity 1 — `can_view_patient_data_at_clinic` helper: build it or not?

The **schema spec** (audits/patient-identity-schema-spec.md, lines 564-606) defines a 4th helper, **`can_view_patient_data_at_clinic(p_global_patient_id, p_data_clinic_id, p_viewer_user_id)`**, which it calls "the central directional-consent predicate" used by RLS on `encounters`, `prescriptions`, `lab_orders`, `clinical_notes`. It returns TRUE if any of (a) patient self, (b) caregiver, (c) auto-share self-clinic, (d) directional consent share apply.

**Mo's Prompt 6 (B1–B3) defines only 3 helpers** (`is_clinic_member`, `can_clinic_access_global_patient`, `can_patient_access_global_patient`) and instead inlines the cross-clinic share predicate as a subquery in clinical_notes' SELECT policy (C3 § "clinical_notes_select"). The inline sketch leaves the join-shape question (`patient_id` is which kind of UUID?) explicitly to the cowork session.

The schema spec's approach is structurally cleaner: one helper, called from every clinical-data policy, single source of truth for the directional-consent rule. Mo's approach with inline subqueries means the same logic is duplicated across 6+ tables with 6 chances to get the WHERE join wrong.

**Recommendation:** build the schema-spec helper, drop the inline subquery sketch.

### Ambiguity 2 — `SECURITY DEFINER` vs `SECURITY INVOKER` for the helpers

- Schema spec: `can_view_patient_data_at_clinic` is `SECURITY DEFINER STABLE` (line 602)
- Mo's Prompt 6 (B1–B3): every helper is `SECURITY INVOKER STABLE`

For `is_clinic_member` and `can_patient_access_global_patient` SECURITY INVOKER is fine — both check the caller's own membership/claim. For the cross-clinic share predicate, the helper joins `patient_data_shares` × `clinic_memberships` × the caller's own user_id. Both should work under INVOKER **provided** existing RLS on `patient_data_shares` and `clinic_memberships` allow the caller to read their own rows AND the rows for grantor clinics they're members of. After Phase C this is true (we'll write those policies), but the helpers need to work BEFORE we drop legacy policies — i.e., during runs #1 and #2 of the test matrix when both old and new coexist.

Today the legacy `patient_data_shares` is DENY-ALL (ORPH-V5-01). Until mig 093 ships the new policy, an INVOKER helper that joins `patient_data_shares` returns 0 rows for any caller. **That breaks the entire share-based read path.** The fix is either (a) make the cross-clinic helper SECURITY DEFINER (schema spec's choice), or (b) order the migrations so `patient_data_shares` policies ship before any policy that references them via an INVOKER helper.

**Recommendation:** SECURITY DEFINER for `can_view_patient_data_at_clinic` (matches spec, eliminates ordering hazard). SECURITY INVOKER for the simple member/claim helpers.

### Ambiguity 3 — caregiver / `dependent_account_links` paths

Schema spec embeds caregiver visibility in **every** patient-readable policy: global_patients, patient_clinic_records, patient_data_shares, can_view_patient_data_at_clinic. Mo's prompt B1–B3 + Phase C policies don't mention caregivers. The `dependent_account_links` table exists (verified per A.3 above) but Prompt 7 ("dependent account flow") hasn't shipped — there are no rows yet.

Two options:
- (a) Include caregiver path now — write the EXISTS check against `dependent_account_links` so when Prompt 7 lands, no policy churn. Costs a tiny EXISTS that returns no rows today.
- (b) Defer caregiver path to Prompt 7 — cleaner now, but requires every patient-related policy to be re-edited later.

**Recommendation:** option (a). Cost is one EXISTS that's empty today. Reduces Prompt 7's scope.

### Ambiguity 4 — `patients` (legacy) policies in Phase C

Mo's prompt C2 says: "Mirror clinical_notes-style policies temporarily (still legacy until 6.5 drops it)." But existing `patients` policies aren't DENY-ALL — they're working policies the app currently relies on (every doctor/frontdesk pattern reads through them via the compat shim in mig 081).

**Recommendation:** leave existing `patients` policies UNTOUCHED in Prompt 6 (they coexist via PERMISSIVE-OR with anything new). The whole table is dropped in Prompt 6.5 anyway. Don't burn 30 minutes writing "temporary" policies for a table about to disappear. Document this in build-06-results.md § 8 as a deliberate gap.

### Ambiguity 5 — `audit_events.metadata_global_patient_id` generated column **(RESOLVED — refined Option A')**

Mo's prompt § C5 picks Option A (add a generated STORED column extracting `metadata->>'global_patient_id'`). Concern from prompt itself: "Whether `audit_events.metadata_global_patient_id` generated column works with all existing rows (some rows may not have the field in metadata)."

**Findings (queried staging 2026-04-30):**
- 282 audit_events rows total, 20 distinct actions
- Only **35 / 282 rows (12.4%)** have `metadata->>'global_patient_id'` populated. All 35 are `PATIENT_CLINIC_RECORD_CREATED` from mig 088's trigger.
- Patient-related actions where the gpid is in `entity_id` (with `entity_type = 'global_patients'`): GLOBAL_PATIENT_CREATED (63), PRIVACY_CODE_ATTEMPT_FAILURE (8), SMS_CONSENT_SENT (4), SMS_CODE_FAILED (3), PRIVACY_CODE_ATTEMPT_SUCCESS (2), PRIVACY_CODE_REGENERATED (2), SMS_CODE_VERIFIED (2), PRIVACY_CODE_LOCKED (1) = **85 more rows**
- Together a refined COALESCE column would cover **120 of 282 rows (42.6%)** — the patient-visible subset. Remaining rows are internal admin events (QUARANTINE_*, AUTH_PHONE_NORMALIZED, RECOVERY_*, USER_DEDUP_*, DATA_LAYER_CUTOVER_COMPLETE) which patients shouldn't see anyway, plus 2 clinical-note rows that need a JOIN to resolve.

**Refined Option A' (recommended):**

```sql
ALTER TABLE public.audit_events
  ADD COLUMN resolved_global_patient_id UUID
  GENERATED ALWAYS AS (
    COALESCE(
      NULLIF(metadata->>'global_patient_id', '')::UUID,
      CASE WHEN entity_type = 'global_patients' THEN entity_id END
    )
  ) STORED;

CREATE INDEX idx_audit_events_resolved_gpid
  ON public.audit_events(resolved_global_patient_id)
  WHERE resolved_global_patient_id IS NOT NULL;
```

Patient-side SELECT policy uses this column directly. The 2 CREATE_CLINICAL_NOTE rows are deliberately excluded (clinical-note actions are surfaced to patients via the clinical_notes table itself, not the audit feed). Document as deliberate gap in build-06 § 8.

**Going-forward**: Build 06 should also add a doc convention requiring callers to populate `metadata->>'global_patient_id'` for any new audit action involving a patient, so future actions auto-fold into the generated column.

### Ambiguity 6 — test harness JWT context (Mo's Option A vs Option B)

Mo's prompt § D2 asks to use Option A: `SET LOCAL "request.jwt.claims" = '{"sub":"<user_id>"}'`. The Postgres GUC `request.jwt.claims` is set by **PostgREST/Supabase Auth** — it's not standard. `auth.uid()` reads it via `current_setting('request.jwt.claim.sub', true)::uuid`. Setting it manually via `SET LOCAL` should work for SQL-level RLS testing **inside a single transaction**, but won't survive across-statement state in a script harness unless every statement is wrapped in BEGIN/COMMIT.

I'll prototype this in Phase D before committing — if it fails, fall back to Option B (SECURITY DEFINER test wrappers). Mo's prompt allows either.

**Recommendation:** prototype Option A in 10 minutes during Phase D Day 1. Document outcome before building the matrix.

---

## § 8 deferred-doc notes — log for the eventual `patient-identity-build-06-results.md`

Mo confirmed these as acceptable deviations to surface in the final results doc § 8 ("Honest gaps"). Captured here so they don't get lost between sessions.

**Patient-joined tables that Prompt 6's inventory missed but exist on staging.** Each needs a Phase C policy decision:
- `chronic_conditions` (currently has 2 policies: doctor-via-clinical_notes EXISTS + patient-self ALL)
- `vital_signs` (3 policies on staging — last-known: doctor INSERT, doctor-view-treated, patient-self)
- `default_sharing_preferences` (1 policy: patient-self ALL)
- `patient_phone_history` (need to inventory in Phase C — already exists per schema spec § 7)
- `patient_consent_grants` (legacy messaging-consent table, used by mig 083 effective_messaging_consent view; will track via that view)
- `anonymous_clinical_observations` (per schema spec § 9 — AI training pipeline; currently DENY-ALL or absent — verify in Phase C)

**Table-name corrections from Prompt 6's inventory** (updated session 4 after re-running existence query):
- `prescriptions` (table) → DOES NOT EXIST. Replaced by `prescription_items`.
- `medications`, `medication_intake_log`, `encounters` → DOES NOT EXIST. Stale references; not implemented.
- `prescription_templates` → DOES exist (corrects my earlier session-1 note). Doctor-scoped (no patient FK); policy in mig 097, not 094.
- `templates` → DOES NOT EXIST. Doctor-owned templates live on `doctor_templates`.
- Schema drift between Prompt 6's text and PRODUCT_SPEC.md / ARCHITECTURE.md noted; not fixed in this prompt's scope.

These deviations don't change Phase C's structure — each gets a policy decision in 094 (clinical-data) or 097 (non-patient) per its scope. They just need to be in the final § 8 inventory so future audits don't surface them as silent gaps.

---

## Mo's rulings (2026-04-30, end of cowork session 1)

1. **Helper architecture: HYBRID** — 3 INVOKER helpers + 4th SECURITY DEFINER `can_view_patient_data_at_clinic` per schema spec § 4. Saved to memory file `project_prompt_06_architecture_rulings.md`.
2. **Caregiver paths: DEFER to Prompt 7.** No `dependent_account_links` checks in Phase B/C. Document deviations from schema spec.
3. **Legacy `patients` table: WRITE TEMPORARY MIRROR** policies per Mo's prompt § C2 (Mo overrode my "leave untouched" suggestion).
4. **createAdminClient triage: KEEP IN PHASE A** (Mo overrode my "move to Phase F-prep" suggestion). All 92 files get tagged before Phase B starts.

---

## Phase A status at end of session 1

| Sub-task | Status | Next action |
|---|---|---|
| A.1 snapshot file | ✅ COMPLETE — 166/166 policies, 58/58 tables verified | Done |
| A.2 admin-client triage | ✅ COMPLETE — 210 callsites tagged, 92 files; 60 KEEP / 119 MIGRATE / 8 SECURITY-DEFINER / 23 INVESTIGATE | See `audits/rls-admin-client-triage.md` |
| A.3 patient-joined tables | Verified against staging | Done; deviations from Mo's prompt list documented |
| A.4 existing tests inventory | ✅ COMPLETE — 7 test files, no runtime runner, zero RLS-touching tests | See `audits/rls-existing-tests-inventory.md` |
| A.5 audit_events visibility | ✅ Resolved (refined Option A') | Implementation in mig 096 |

**Cowork session 3 (2026-04-30) shipped:**
- Phase B benchmark (`audits/rls-helper-benchmark.md`) — all 4 helpers <1ms warm
- Mig 093 (patient identity tables) — applied to staging, post-conditions passed
- Phase C checkpoint doc (`audits/rls-phase-c-checkpoint.md`) — FK shape resolved, mig 094-097 designed and queued for next session
- Closures: ORPH-V2-06, ORPH-V3-01, ORPH-V4-01, ORPH-V4-02, ORPH-V4-03, ORPH-V5-01

**Cowork session 16 (2026-05-02) — Phase F entry, RPC scope re-read:**

Session 16's plan was: design and ship 4–5 of the 8 SECURITY-DEFINER RPC candidates from `audits/rls-admin-client-triage.md`. Per the prompt's own rule — "read the actual callsite code to understand what operation does it perform, what data it reads/writes, why was it tagged SECURITY-DEFINER vs MIGRATE-TO-USER vs KEEP-ADMIN" — every callsite was opened before any RPC was designed.

**Result: only 1 of the 8 callsites is an honest SECURITY-DEFINER candidate.** The triage's `scope` column conflated string-similar tags with operational similarity, and several callsites tagged SECURITY-DEFINER are admin-endpoint-only (where KEEP-ADMIN is the correct verdict and an RPC would be over-engineering). Per-callsite re-read findings below; Mo's ruling needed before SQL ships in session 17.

| File:line | Triage tag | Re-read finding | Proposed verdict |
|---|---|---|---|
| `lib/api/handlers/clinical/notes/handler.ts:28` | `patient-dedup` SECURITY-DEFINER | **Mis-labeled.** The `'patient-dedup'` string is the scope arg to `createAdminClient(...)`, but the operation at line 28–34 is the **TD-008 offline-replay idempotency lookup** — it reads `clinical_notes` by `(client_idempotency_key, doctor_id)` to dedup offline-replay attempts, and has no patient-deduplication semantics. Doctor-self read on `clinical_notes` is already permitted by mig 094's policies (`can_view_patient_data_at_clinic` covers a doctor reading notes they own). | **MIGRATE-TO-USER**, no RPC needed. Switch to `createClient()`; the `.eq('doctor_id', user.id)` constraint already matches the RLS policy. |
| `lib/data/patient-dedup.ts:91` (`findPotentialDuplicates`) | SECURITY-DEFINER | Used **only** by `lib/api/handlers/admin/patient-dedup/handler.ts` — admin-gated route. The function loads **every active patient in the entire system across all clinics** and runs Levenshtein/fuzzy matching on names, ages, sexes — i.e. cross-clinic PII traversal of legacy `patients`. Wrapping this in a SECURITY-DEFINER RPC would smooth over a deeper architectural problem (cross-clinic name/phone matching shouldn't happen at all under the global-identity model) and let it survive Prompt 6.5. | **KEEP-ADMIN** for now; flag the *module* as "needs re-architecture against `global_patients` + `patient_clinic_records` after Prompt 6.5" — separate work item, not session 16. |
| `lib/data/patient-dedup.ts:217` (`mergePatients`) | SECURITY-DEFINER | Same admin-only module. Performs cross-row UPDATE on `clinical_notes`, `appointments`, `prescription_items` to repoint to a kept patient — could move clinical data across clinic boundaries if the two patients live at different clinics. This is identity-merge logic and should ideally be `global_patients.merged_into` driven, not legacy-`patients.account_status='merged'` driven. | **KEEP-ADMIN**, same flag. Architecturally suspect, not just an RLS-bypass question. |
| `lib/data/patient-dedup.ts:303` (`searchPatientsForDedup`) | SECURITY-DEFINER | Same admin module. Same cross-clinic search problem. | **KEEP-ADMIN**, same flag. |
| `lib/data/global-patients.ts:75` (`findGlobalPatientByPhone`) | `global-patients-lookup` SECURITY-DEFINER | Used by **two** callers: (a) the service-role-gated `GET /api/admin/global-patients/lookup` whose handler header explicitly says exposing this lookup to per-clinic operators "would be a privacy regression — a doctor in Clinic A could probe whether a phone exists in Clinic B's roster"; and (b) `lib/data/identity-resolution.ts:resolveOrCreateGlobalIdentity`, which is called from frontdesk check-in flows where the user IS a clinic member with a known clinic context. **A naïve SECURITY-DEFINER RPC callable by any authenticated user would create exactly the privacy regression the admin handler refuses to enable.** | The (a) usage stays **KEEP-ADMIN** (service-role gate is correct). The (b) usage is the **one honest RPC**: `clinic_resolve_global_patient_by_phone(p_phone, p_clinic_id)` — verifies caller is a member of `p_clinic_id`, returns the global identity (or creates it), emits an audit event so cross-clinic probing is traceable, returns minimal projection. |
| `lib/data/global-patients.ts:103` (`findGlobalPatientById`) | `global-patients-lookup` SECURITY-DEFINER | Used **only** by `lib/data/identity-resolution.ts:resolveIdentityForLegacyPatient`, which itself is a transitional helper for dereferencing legacy `patients.id` → `global_patient_id`. Per `identity-resolution.ts` header: this is dead-code-walking after Prompt 6.5 drops the legacy `patients` table. | **KEEP-ADMIN-TRANSITIONAL** — don't ship an RPC for a callsite that's removed in 3 weeks. Add a follow-up to delete the function call alongside the legacy `patients` drop in Prompt 6.5. |
| `lib/api/handlers/patient/my-code/handler.ts:13` (GET) | `patient-code` SECURITY-DEFINER | Patient self-service: `SELECT patient_code, unique_id FROM patients WHERE id = user.id`. The legacy `"Patients can update own profile"` RLS policy from mig 001 was never dropped (verified: no DROP exists in any migration, and mig 094a only touched `patients_select_v2`/`patients_update_v2`), and `patients_select_v2` includes a patient-self branch via `can_patient_access_global_patient`. So a normal `createClient()` user-context read already works. | **MIGRATE-TO-USER**. Caveat: depends on the legacy `patients.id == users.id` assumption still holding for patient-claimed rows; verify in Phase D run #2 before flipping. |
| `lib/api/handlers/patient/my-code/handler.ts:41` (POST) | `patient-code` SECURITY-DEFINER | Patient self-service `UPDATE patients SET patient_code = ... WHERE id = user.id`. Legacy `"Patients can update own profile"` policy gates on `auth.uid() = id` and is still live (PERMISSIVE-OR with `patients_update_v2`'s clinic-member-only branch). | **MIGRATE-TO-USER**, same caveat. The 6-char code generation can stay client-side; if Mo wants atomicity / DB-side generation, that's a separate "nice-to-have" wrap. |

**Re-tag summary (proposed):**

| Original | Re-classified |
|---|---|
| 8 SECURITY-DEFINER candidates | **1** SECURITY-DEFINER (clinic-gated identity resolution RPC) + **4** KEEP-ADMIN (3 dedup admin module + 1 global-patients admin endpoint) + **1** KEEP-ADMIN-TRANSITIONAL (dies in Prompt 6.5) + **2** MIGRATE-TO-USER (offline-replay idempotency + patient-self code ops, both pending Phase D run #2 verification) |

**Question for Mo before session 17 starts:**

(a) Accept this re-classification — ship the single `clinic_resolve_global_patient_by_phone` RPC in session 17 alongside the start of the 119-row MIGRATE-TO-USER bulk, log an architectural follow-up for the `patient-dedup.ts` module re-design, and update `audits/rls-admin-client-triage.md` to reflect the new tags?

(b) Or push back: were any of the 7 reclassifications wrong? In particular, the patient-dedup admin module has real cross-clinic-PII concerns that I didn't try to solve here — flagged for separate scoping. The mis-tag at `clinical/notes/handler.ts:28` is unambiguous (the line 28 code has nothing to do with patient dedup) but Mo may want to check the others.

**Hot-spots: not started.** The session-16 plan said hot-spots could be picked up if RPC budget held; since the RPC budget collapsed to 1, hot-spots stay queued for session 17.

**Mig 101: still HOLDS.** Nothing in this session moved the run-#3-100%-green precondition. Phase D run #1 (177/177) and Phase E (perf held) still stand.

**Time spent:** ~60 min (read + analysis + write-up). Lower than the 90–120 min plan because no SQL was written.

**Files read this session, no edits:**
- `audits/rls-admin-client-triage.md` (the 8 candidates table)
- `packages/shared/lib/data/global-patients.ts` (both callsites)
- `packages/shared/lib/data/identity-resolution.ts` (caller of both global-patients functions)
- `packages/shared/lib/api/handlers/admin/global-patients-lookup/handler.ts` (the privacy-rationale header)
- `packages/shared/lib/api/handlers/patient/my-code/handler.ts` (both callsites)
- `packages/shared/lib/data/patient-dedup.ts` (3 callsites)
- `packages/shared/lib/api/handlers/clinical/notes/handler.ts` (the mis-labeled callsite at line 28)
- `supabase/migrations/093_rls_patient_identity.sql` (legacy patients v2 policies)
- `supabase/migrations/094a_rls_helper_fixes.sql` (final patients_select_v2 shape)
- `supabase/migrations/001_initial_schema.sql` (legacy "Patients can update own profile" policy — confirmed never dropped)

**Files NOT yet edited** (waiting on Mo's ruling): `audits/rls-admin-client-triage.md` retains the original 8-row SECURITY-DEFINER tag; the per-callsite verdicts above are proposed only.

---

**Cowork session 16 ruling addendum (2026-05-02, end of session):**

Mo confirmed 6 of 7 reclassifications. The one held-back ruling — `my-code/handler.ts` — turned out to be a **P1 security finding**, not just an architectural decision.

**P1 finding.** `patient_code` was built before the 2026-04-26 locked decisions and contradicts them on five axes:

| Weakness | Locked decision | Verdict |
|---|---|---|
| `Math.random()` generation | `gen_random_bytes()` from pgcrypto, NEVER `random()` | **Contradicts** |
| Indefinite lifetime | SMS-consent token TTL = 5 minutes / Default share expiry = 90 days with auto-renew | **Contradicts** |
| No rate limit | Per-clinic 5 attempts/hour | **Contradicts** |
| No audit on regenerate | Audit-everything-sensitive principle | **Contradicts** |
| Plaintext storage | `privacy_codes` stored as bcrypt hash | **Inconsistent** |

Threat: 6-char Math.random over 36-char alphabet = 2.18 × 10⁹ keyspace. The consumer at `lib/data/patients.ts:376` SHA-256-compares the supplied `patientCode` against `patient_consent_grants.verification_token_hash` and grants messaging consent on match. With no rate limit on either side, the path is brute-forceable in practice. Compromise = unauthorized messaging-consent grant at any clinic the attacker chooses.

**Mo's ruling: Option 3 (Full RPC).** Two SECURITY DEFINER RPCs:

1. `patient_get_my_code()` — read-only, claimed-patient gate, no audit, idempotent, raises on permission denial.
2. `patient_regenerate_my_code()` — rate-limited 1/60s/patient, `gen_random_bytes` + base32 (8 chars, ~1.1 × 10¹² keyspace), bcrypt-stored, plaintext returned one-time, emits `PATIENT_CODE_REGENERATED` audit event, atomic transaction.

Plus a schema migration adding `(patient_code_hash, patient_code_generated_at, patient_code_expires_at)` to `global_patients` (durable home, survives Prompt 6.5; default 90-day expiry).

Plus a consumer-side update at `lib/data/patients.ts:376` to bcrypt-compare instead of SHA-256-compare.

Product framing of the choice (Mo): `patient_code` is a long-lived rotatable messaging-consent token used multiple times across doctors throughout the patient's healthcare journey, NOT a single-use credential like `privacy_codes`. Single-use would break the consumer flow which stores the hash on the consent grant rather than consuming the code per-use.

**Phase F scope expansion.** Originally projected as 2 sessions (17 + 18). Now 3 sessions (17 + 18 + 19). Trade: +1 session vs shipping Prompt 6 with a known unfixed P1 issue. The "we knew but didn't fix" sign isn't a real option given the discipline through 16 sessions.

**Migration numbering ruling (Mo, 2026-05-02 end of session 16):** Option (b) — renumber. Three reasons recorded for the design log:

1. "Filename order = run order" is the discipline matching every other migration in the project. Breaking it for one file sets a precedent that "drop legacy" can come before "add capability" — the opposite of the program's invariant.
2. Mig 098 (the held legacy-drop) hasn't shipped to staging. It's a designed-but-not-applied artifact. Renumbering costs touching one file with zero deployment cost. *(Session-17 correction: the file was never written, only conceptually planned. The `mv` step was a no-op because slot 098 had always been empty — see Empirical Lesson #6 amendment. The renumbering decision is correct on its merits regardless of file state; only reason 2's premise was wrong.)*
3. Simpler mental model. Option (a) requires "mig 098 is special"; option (b) keeps the global rule "all migrations apply in numeric order."

**Session 17 file plan (locked):**

| New filename | Status | Purpose |
|---|---|---|
| `098_patient_code_schema.sql` | NEW | Adds `global_patients.patient_code_hash` + `_generated_at` + `_expires_at` columns. |
| `099_patient_code_rpcs.sql` | NEW | `patient_get_my_code()` + `patient_regenerate_my_code()` RPCs. |
| `100_clinic_resolve_gp_rpc.sql` | NEW | `clinic_resolve_global_patient_by_phone(p_phone, p_clinic_id)` RPC. |
| `101_drop_legacy_policies.sql` | RESERVED slot | Drops legacy v1 policies; runs LAST; still HOLDS. Slot 101 reserved for the legacy-drop migration to be written after run #3 = 100% green. Slot 098 was never occupied — original Prompt 6 spec assigned 'drop legacy' to slot 098, but the renumbering ruling reserved slot 101 for that purpose before any file was written. (Correction added 2026-05-02 session 17 after `Glob("**/098*")` returned empty — see Empirical Lesson #6 amendment in `audits/EXECUTION_PROMPTS.md`.) |

`patients.ts:376` consumer bcrypt update is application code, not a migration.

**Session 17 step order (locked):**

1. **Atomic edit:** ~~rename `supabase/migrations/098_drop_legacy_policies.sql` → `101_drop_legacy_policies.sql` and the matching `*.rollback.sql`.~~ *(Session-17 correction: the file does not exist in the repo. `Glob("**/098*")` returns empty; per `project_rls_rewrite_status.md` "mig 098 hasn't been written yet". The `mv` is a no-op.)* Grep the repo for any references to `"098"` / `"098_drop"` / `mig 098` in code, comments, audit docs, scripts; update each to `mig 101` so existing migration headers (094/095/096) and audit docs reference the correct slot before the new mig 098 (patient_code_schema) ships into the empty slot. Single commit.
2. **Atomic edit:** apply all 7 confirmed reclassifications to `audits/rls-admin-client-triage.md` (the 1 mis-tag at `clinical/notes:28` → MIGRATE-TO-USER; 3 patient-dedup → KEEP-ADMIN + re-arch flag; 1 admin-handler global-patients lookup → KEEP-ADMIN; 1 transitional `findGlobalPatientById` → KEEP-ADMIN-TRANSITIONAL; 2 my-code → SECURITY-DEFINER per Mo's Option 3 ruling). Single commit.
3. **Ship `098_patient_code_schema.sql`** — adds 3 columns to `global_patients`. In-transaction post-condition per Empirical Lesson #2: verify columns present + correct types via `information_schema.columns`.
4. **Ship `099_patient_code_rpcs.sql`** — both RPCs with the 5 design-question answers in the migration header (see below). Smoke-probe inside transaction per Empirical Lesson #2: real authenticated regenerate + read-back round-trip with bcrypt verify.
5. **Ship `100_clinic_resolve_gp_rpc.sql`** — single RPC with the design checklist from session 16's earlier guidance (input signature, member-gate raises EXCEPTION, audit event per call, idempotent, raise on permission denial AND invalid phone format). Smoke-probe.
6. **Update `packages/shared/lib/data/patients.ts:376`** — bcrypt-compare against `global_patients.patient_code_hash`. **CRITICAL: backward-compat dual-hash read path during the transition window** — support BOTH the old SHA-256-against-`patient_consent_grants.verification_token_hash` path on existing rows AND the new bcrypt-against-`global_patients.patient_code_hash` path on freshly-regenerated codes. SHA-256 path removable only after every existing patient has regenerated.
7. **Backfill (NOT a migration)** — one-time admin script that takes existing patients with non-null `patients.patient_code` plaintext and bcrypt-hashes them into `global_patients.patient_code_hash`, populating `_generated_at = NOW()` and `_expires_at = NOW() + INTERVAL '90 days'`. Plaintext stays in `patients.patient_code` until the patient regenerates (no destructive write). Document in `build-06-results.md § 8 honest gaps` as a deliberate transitional state.

Stop after step 7. Hot-spots + bulk MIGRATE-TO-USER are session 18.

**Mig 099 (patient_code RPCs) — 5 design-question answers required IN THE MIGRATION HEADER before writing SQL:**

1. **Format.** 8 chars base32-encoded `gen_random_bytes(5)` (5 bytes = 40 bits = 8 base32 chars, ~1.1 × 10¹² keyspace) **OR** 6 chars `gen_random_bytes(4)` truncated (~1 × 10⁹ keyspace, still 500× stronger than current Math.random×6 and matches `privacy_codes`' visual shape). Mo's preference at session 17 start determines which.
2. **Expiry.** 90 days from `generated_at`, matching default share expiry. `NULL expires_at` reserved for future "no-expiry" use; default behavior is 90 days.
3. **Rate limit shape.** 1 regenerate per 60s per patient, atomic `CHECK` in function body comparing `NOW() - patient_code_generated_at < INTERVAL '60 seconds'`. On limit hit, `RAISE EXCEPTION USING ERRCODE = 'RATE_LIMIT_EXCEEDED'` (or PG SQLSTATE equivalent) so the caller can show appropriate UI.
4. **Backward-compat read path.** `patient_get_my_code()` returns the existing plaintext `patients.patient_code` (synthesizing `generated_at = NULL`, `expires_at = NULL`) for patients who haven't regenerated yet. Once they regenerate, only the new path is used. This is the read-side counterpart to the dual-hash consumer logic in step 6 above.
5. **Audit event shape.** `PATIENT_CODE_REGENERATED` with `actor_user_id`, `global_patient_id`, timestamp. Visible to `OWNER` role of any clinic where the patient has a PCR (matches the existing audit_events visibility model from mig 096; uses `resolved_global_patient_id` generated column). No row in `patient_code_attempts` — that's a DIFFERENT table for the privacy-code attempt tracking.

These answers become part of the permanent design record in the mig 099 header.

**Session 17 estimate:** 3–4 hours. Each migration must include in-transaction smoke-probe per Empirical Lesson #2.

**Mig 101 (formerly 098 — legacy v1 policy drop) hold preconditions (updated):**
- ✅ Path 2 verified across all 6 clinical-data tables.
- ✅ Run #1 = 100% green (177/177 across 19 in-scope tables).
- ⬜ **NEW:** Phase F complete — including session 17's patient_code schema + RPCs + consumer bcrypt update.
- ⬜ Run #2 stable (after Phase F structural changes).
- ⬜ Run #3 = 100% green (after mig 101 itself drops legacy).

Reason mig 101 must come last: it drops the legacy `"Patients can update own profile"` policy from mig 001 that currently gates patient-self UPDATE on `auth.uid() = patients.id`. Without the new SECURITY DEFINER RPCs in place AND the consumer-side dual-hash bcrypt path live, dropping that policy breaks the my-code POST path (since `patients_update_v2` has no patient-self branch — only `is_clinic_member`). Apply order: 098 schema → 099 patient_code RPCs → 100 clinic-resolve RPC → consumer code update + backfill → run #2 → run #3 → 101.

**Empirical Lesson #6 added** to `audits/EXECUTION_PROMPTS.md` under a new "Empirical lessons (Prompt 6 onward)" section. Full text: per-callsite re-reading at Phase F start; triage tags may conflate string-similar operations with semantically-different callsites AND obscure pre-locked-decision security debt; re-read the callsite to confirm what it does AND whether it predates relevant locked decisions; triage tags are a sorting hint, not the decision. Empirical proof: 7 wrong commitments + 1 P1 issue surfaced in 60 minutes.

**New Phase F task IDs created:**
- #20 (in scope for session 17): my-code Option 3 ruled — Full RPC build.
- #21 (Prompt 6.5+): patient-dedup module re-architecture.
- #22 (Prompt 6.5): `resolveIdentityForLegacyPatient` cleanup.
- #23 (session 17): bcrypt-comparison migration for `patients.ts:376` consumer side.
- #24 (session 17): schema migration for `global_patients.patient_code_hash` columns.

The `audits/rls-admin-client-triage.md` triage table will be updated at the start of session 17 with the 7 confirmed reclassifications + the my-code Option 3 ruling, in a single edit so the source-of-truth changes are atomic with the migrations being shipped.

---

**Cowork session 13 (2026-04-30) shipped:**
- 4 of the 11 deferred non-patient/comm/ops tables authored: clinic_memberships (8), users (8), clinics (8), doctors (8) = **32/32 PASS**.
- Both load-bearing flagged tests cleanly green:
  - clinic_memberships bidirectional cross-clinic isolation: doctor_a sees 3 at clinic_a / 0 at clinic_b; doctor_b sees 1 at clinic_b / 0 at clinic_a.
  - users cross-clinic wiring (Mo's flagged "S2 negative could surface bug"): doctor_a ⟂ doctor_b in BOTH directions, both = 0 rows. mig 097's `users_select_clinic_colleagues_v2` correctly scopes to shared-membership only.
- doctors broadly visible to authenticated per spec § C6 — confirmed: doctor_a / patient_y_user / frontdesk_a all see arbitrary doctor profiles.
- Phase F task #16 added: re-audit `clinics` callsites post-mig-097 (some session-2 KEEP-ADMIN tags may now be MIGRATE-TO-USER candidates).
- Phase D run #1 cumulative: **121 / 121 PASS** across 17 tables.

Outstanding for session 14:
- 56 more scenarios across 7 tables: 4 operations (appointments, check_in_queue, payments, doctor_availability) + 3 communication (messages, conversations, notifications) = 7 × 8 = 56.
- All use uniform `is_clinic_member(clinic_id)` predicates — paste-and-adapt from clinic_memberships' 8-block.
- Target: matrix run #1 closure at ~177/177 PASS, then session 14 also runs Phase E (perf benchmark).
- Mig 101 still HOLDS — preconditions: ✅ Path 2 verified across all 6 clinical-data tables; ⬜ full matrix run #1 + #2 + #3 = 100% green.

---

**Cowork session 12 (2026-04-30) shipped:**
- Mig 097 (non-patient tables RLS) shipped to staging. 3 new v2 policies: `clinics_select_v2` (members-only), `users_select_clinic_colleagues_v2` (self + clinic-shared visibility), `doctors_select_authenticated_v2` (any authenticated, per § C6). doctor_templates / prescription_templates / clinic_memberships unchanged. In-transaction smoke-probe per Empirical Lesson #2 — 6 tables exercised, no recursion.
- **Notable finding**: `clinics` had ZERO policies on staging pre-mig-097 — RLS-enabled with no policies = effective DENY-ALL for non-service-role. `clinics_select_v2` closes that gap. Phase F createAdminClient triage should flag any app code reading `clinics` directly that would have been silently broken.
- audit_events patient-self leak test (Mo's load-bearing scenario) — **4/4 PASS** under patient_y_user role:
  - sees own 8 rows (= ground truth)
  - sees 0 of patient_x's 16 rows (no leak)
  - sees 0 of patient_z's 8 rows (no leak)
  - sees 0 of 196 admin rows that don't resolve to a gpid (correct exclusion)
- Phase D run #1 cumulative: **89 / 89 PASS** across 13 tables. All Phase C migrations (092 / 093 / 094 / 094a / 095 / 096 / 097) now live.

Outstanding for session 13+:
- ~92 deferred matrix scenarios across ops (appointments, check_in_queue, payments, doctor_availability), communication remainder (messages, conversations, notifications), and non-patient (clinics, clinic_memberships, users, doctors). Mechanical paste-and-adapt given uniform `is_clinic_member` predicates.
- Mig 101 (drop legacy) still HOLDS — needs run #1 = 100% green across the entire authored matrix, then run #2 (after structure stable), then run #3 (after legacy drop). Realistically 2-3 sessions to close.
- Phase E (perf benchmark on 10 hottest queries), Phase F (admin-client migration of 119 MIGRATE-TO-USER + 23 INVESTIGATE callsites), Phase G (rollback rehearsal on clone), Phase H (final results doc + sign-off line) all still pending.

---

**Cowork session 11 (2026-04-30) shipped:**
- Path 2 verification COMPLETE across all 6 clinical-data tables. **35/35 PASS** for the 5 remaining tables (lab_orders, vital_signs, imaging_orders, prescription_items, lab_results), plus the 10/10 from clinical_notes in session 9.
- Per-table S9 results — RESTRICTIVE INSERT verified in isolation (RLS_BLOCKED_42501, NOT trigger-raised P0001, on every table):

| Table | S9 result | S10 result |
|---|---|---|
| clinical_notes | RLS_BLOCKED_42501 | 0 rows |
| lab_orders | RLS_BLOCKED_42501 | 0 rows |
| vital_signs | RLS_BLOCKED_42501 | 0 rows |
| imaging_orders | RLS_BLOCKED_42501 | 0 rows |
| prescription_items | RLS_BLOCKED_42501 | 0 rows |
| lab_results | RLS_BLOCKED_42501 | 0 rows |

- **The first of mig 101's two preconditions is satisfied**: when mig 081's compat shim triggers drop in Prompt 6.5, the RESTRICTIVE INSERT policies on all 6 clinical-data tables will continue to block cross-clinic writes. The latent-bug risk Mo flagged is now empirically refuted.
- Seed extension committed to `audits/rls-test-seed.sql` with 5 new entities (1 per table for patient_x at clinic_a). Total 26 seeded entities post-session-11. Reproducibility maintained: `SELECT public.rls_test_seed();` rebuilds the canonical state for sessions 12+.
- Two CHECK constraints surfaced in seed extension (logged as "footguns" in the seed file comments): (a) `imaging_orders.modality` must be lowercase ('ct' not 'CT'); (b) `prescription_items` has no `notes` column — used `clinic_id = clinic_id` no-op SET pattern for S10 across all 5 new tables.
- Phase D run #1 cumulative: **85/85 PASS** across 12 of 12 patient/clinical-data tables in scope.

S4/S5/S6 deferred for the 5 new tables (transitive proof: helper logic is identical to clinical_notes' S4/S5/S6 which already passed in session 9). Documented in build-06 § 8 as deliberate gap; full 10/table coverage queued if Mo wants explicit per-table verification before Phase H sign-off.

Outstanding for sessions 12+:
- Mig 097 (non-patient tables) — designed but not shipped.
- Operations / communication / non-patient SELECT scenarios under run_no=1 (~110 more rows; ops tables seeded but not yet tested in matrix).
- Phase E performance benchmark + Phase F app code migration + Phase G rollback rehearsal.
- Mig 101 still HOLDS — second precondition (run #3 = 100% green across the entire matrix) requires the matrix be fully authored and migrations 097/101 in sequence.

---

**Cowork session 10 (2026-04-30) shipped:**
- Seed extension committed to `audits/rls-test-seed.sql` (file + staging functions both updated). Adds 2 patient users (patient_x_user, patient_z_user) + 3 legacy patients + 3 clinical_notes — total 21 entities.
- Reproducibility verified: full `rls_test_teardown()` removed 42 entities cleanly, `rls_test_seed()` from empty state recreated all 21 successfully on first try.
- clinical_notes 10/10 scenarios re-run from clean seed → **10/10 PASS** including S9 (`RLS_BLOCKED_42501`) and S10 (0 rows). Path 2 trigger-bypass technique confirmed reproducible — not a one-off success against an ad-hoc-state staging.
- Phase D run #1 cumulative: **50/50 PASS** across 7 of 12 patient/clinical-data tables — same as end-of-session-9 but now with reproducible seed.
- Empirical Lesson #5 (trigger-bypass via patient with cross-clinic PCR visibility) propagates via the seed file: every cowork session that pulls from the repo gets the canonical setup automatically. Future Prompt 7 caregiver work + Prompt 8 anonymous observations inherit the seed pattern.
- Note for future maintainers: `RETURNS TABLE(... id UUID ...)` introduces an OUT param `id` that shadows table.id columns in the function body — requires explicit table aliasing on internal SELECTs (caught + fixed during apply).

Outstanding for session 11+:
- 5 more clinical-data tables (lab_results, lab_orders, imaging_orders, vital_signs, prescription_items) × 10 scenarios each = 50 rows. Path 2 pattern is uniform; each takes 20-30 min after the first.
- Mig 097 (non-patient tables) — designed but not shipped.
- Operations / communication / non-patient scenarios — ~110 more rows.
- Mig 101 (drop legacy) HOLDS until run #3 = 100% green AND Path 2 verified across all 6 clinical-data tables.

---

**Cowork session 8 (2026-04-30) shipped:**
- Mig 095 (operations RLS) — applied to staging. 4 v2 SELECT policies (`appointments_select_v2`, `check_in_queue_select_v2`, `payments_select_v2`, `doctor_availability_select_v2`), each calling `is_clinic_member(clinic_id, auth.uid())`. PERMISSIVE-OR coexistence with 25 existing legacy policies across the 4 tables. doctor_templates moved to mig 097 (no clinic_id, doctor-scoped). No RESTRICTIVE write-asymmetry needed — these tables have no cross-clinic READ access to begin with, so directional-consent asymmetry doesn't apply.
- Empirical Lesson #2 template fix shipped: post-condition smoke-probe runs INSIDE BEGIN/COMMIT (corrects 094a's after-COMMIT defect). Two harness gotchas surfaced + corrected during apply: (a) auth.users SELECT must happen BEFORE the role switch (authenticated role can't read auth.users); (b) `set_config('role','',TRUE)` rejects empty-string — rely on TRUE third-param transaction-local auto-reset at COMMIT. Both lessons captured in the mig 095 file's smoke-probe comments for future migs.

Outstanding for next session(s):
- **Mig 096** (communication + audit_events): adds `audit_events.resolved_global_patient_id` GENERATED column + index, audit_events SELECT v2 policy (clinic OWNER + claimed-patient-self via the generated column). Plus messages, conversations, notifications policies.
- **Mig 097** (non-patient): clinics, clinic_memberships, users, doctors, doctor_templates, prescription_templates. Mostly verification of existing policies; minor v2 additions if any. Each needs in-transaction smoke-probe per Empirical Lesson #2.
- **Clinical-data scenarios (mig 094 tables, 6×10 = 60 rows)** including S9/S10 cross-clinic write-asymmetry boundary tests.
- **Operations / communication / non-patient scenarios (~110 more rows)** after migs 096/097 ship.

Phase D run #1 cumulative: 40/40 PASS across 6 patient-identity tables. Operations-table scenarios (8a's planned 8b/8c work) deferred to session 9.

---

**Cowork session 7 (2026-04-30) shipped:**
- Phase D run #1 baseline expanded to **6 of 7 patient-identity tables** — **40/40 PASS** cumulative.
  - Session 6 carryover: global_patients (8 PASS), patient_clinic_records (8 PASS).
  - Session 7 added: patient_data_shares (8 PASS), privacy_code_attempts (8 PASS), patient_privacy_codes (4 PASS, DENY-ALL hides seeded code from all roles incl. OWNER + claimed patient), privacy_code_sms_tokens (4 PASS, DENY-ALL).
- Seed extended (sessions 5+7 combined): added owner_a (OWNER clinic_a), patient_privacy_codes row, privacy_code_attempts row, privacy_code_sms_tokens row. `audits/rls-test-seed.sql` updated to match staging — staging↔file alignment preserved.
- Empirical Lesson #2 (write-asymmetry) and Empirical Lesson #3 (`SET LOCAL ROLE` separate-statement) both validated in production-like load: 40 scenarios across 6 tables, all assertions converge on the expected outcome at the row level, no false positives, no false negatives.

Outstanding for next session:
- **Patients (legacy)** — 7th of 7 patient-identity tables, NOT scenario-tested this session. `public.patients.id` has FK to `public.users.id` (legacy assumption: patients ARE users) — seeding 3 legacy patients rows requires 3 additional user accounts. Skipped to preserve session budget; legacy patients-mirror policy is still tested transitively via the global_patients + PCR scenarios that exercise the same helpers. Add 3 user/patients rows to seed in a future session if scenarios become a priority before mig 101 ships.
- **Migs 095 (operations), 096 (communication + audit_events), 097 (non-patient)** — designed in `audits/rls-phase-c-checkpoint.md`, not yet shipped. Each must include in-transaction smoke-probe per Empirical Lesson #2 (separate `SET LOCAL ROLE 'authenticated'` + real authenticated SELECT in post-condition, INSIDE the BEGIN/COMMIT — not after, as 094a's was).
- **Clinical-data scenarios (mig 094 tables, 6 tables × 10 scenarios = 60 rows)** — including the mandatory S9/S10 cross-clinic write-asymmetry boundary tests that prove the RESTRICTIVE INSERT/UPDATE policies work.
- **Operations / communication / non-patient scenarios** — 60+ more rows after migs 095–097 ship.
- **Mig 101 (drop legacy)** — HOLDS until run #3 = 100% green per standing instruction.

Run-#1 cumulative state at end of session 7: 40/40 PASS across 6 patient-identity tables. Patients-legacy + clinical-data + operations + communication + non-patient = ~190 more scenarios queued for sessions 8+.

---

**Cowork session 6 (2026-04-30) shipped:**
- `audits/patient-identity-build-06-results.md` created. § 3 fully populated with the four standing rules + recursion proof + harness debugging trace per Mo's session-5 directive. Other sections marked `[Populated in Phase H]` for now.
- Acknowledged: Mo's session-6 6a (write seed) was already shipped in session 5. Re-applied in session 6.
- Phase D infrastructure: `_rls_test_results` table + `rls_test_record(...)` SECURITY DEFINER capture function (granted EXECUTE TO authenticated). The DEFINER wrapper solves the 'authenticated role doesn't have INSERT permission on postgres-owned table' problem.
- Run #1 baseline scenarios authored + executed for **2 of 7** patient-identity tables: `global_patients` (8/8 PASS) and `patient_clinic_records` (8/8 PASS). 16/16 scenarios green. Includes S4/S5 negative-share scenarios proving identity visibility does NOT propagate through `patient_data_shares` (only the directional-consent helper for clinical data does).
- Forward note acknowledged: future RLS migs (095-101) put post-condition `DO $$` blocks INSIDE the transaction (mig 094a's runs after `COMMIT` — template defect, not worth re-doing).

Outstanding for session 7 — patient-identity remainder (5 tables × 8 scenarios = 40 more): patient_data_shares, privacy_code_attempts (real SELECT), patient_privacy_codes (DENY-ALL trivial), privacy_code_sms_tokens (DENY-ALL trivial), patients (legacy mirror via PERMISSIVE-OR).

Run #1 interpretation note for the eventual Phase H doc: Mo's matrix scaffold described run #1 as "BEFORE any v2 policies" — but in practice we're running Phase D after mig 094a is already live. Reframe: run #1 = baseline matrix state at START of Phase D testing (post-094a, pre-095/096/097). Run #2 still happens after 095-097 ship, run #3 still after mig 101 drops legacy. Same three-run discipline; the labels just don't map to "before/after migrations" cleanly. Close enough for the testing semantic — Mo to confirm framing.

---

**Cowork session 5 (2026-04-30) shipped:**
- Mig 094a (RLS recursion fix + helper-uniformity) — applied to staging. Caught a P0 cross-table EXISTS recursion (Postgres 42P17) that mig 093 had introduced. Fix: 5 helpers all `SECURITY DEFINER` (Mo's amended uniform rule); 6 SELECT/UPDATE policies rewritten to call helpers instead of inline EXISTS. Verified: doctor_a sees 3 PCRs/3 GPs/3 shares; doctor_b sees 1/1/3; patient_y_user sees 1/0/1 own-vs-other. No cross-clinic leak under any tested persona.
- Phase D step 1 — `audits/rls-test-seed.sql` shipped: 2 SECURITY DEFINER functions (`rls_test_seed`, `rls_test_teardown`), idempotent, applied + verified on staging (12 entities seeded, all 12 torn down clean).
- Phase D step 2 — Test harness Option A confirmed working with one critical pattern requirement: `SET LOCAL ROLE 'authenticated'` MUST be a separate statement before the SELECT (not inline `set_config` in a WITH/CTE clause). Reason: Supabase MCP session runs as `postgres` (BYPASSRLS=TRUE); inline set_config inside a CTE leaves the query plan built with session_user's bypass already in effect — RLS becomes cosmetic. This was caught BEFORE scenario authoring because step 2 was a prototype probe — exactly the prototype-before-author discipline working as designed.
- 094a header documents the recursion bug, the empirically-falsified hybrid ruling, and the corrected uniform rule "every helper used in any RLS USING clause is SECURITY DEFINER, no exceptions" — for build-06-results.md § 3.

**Cowork session 4 (2026-04-30) shipped:**
- Mig 094 (clinical data) — applied to staging; 18 new policies on 6 tables (clinical_notes, prescription_items, lab_results, lab_orders, imaging_orders, vital_signs). 6 PERMISSIVE SELECT v2 (cross-clinic via `can_view_patient_data_at_clinic`) + 12 RESTRICTIVE INSERT/UPDATE (write-asymmetry per Mo's scenarios 9-10). Existing legacy policies coexist; mig 101 cleanup later.
- Open question 3 resolved (table existence audit):
  - `prescriptions` ❌, `medications` ❌, `medication_intake_log` ❌, `encounters` ❌ — stale references in Mo's prompt; replaced by `prescription_items` and `clinical_notes`. Logged for § 8.
  - `prescription_templates` ✅ EXISTS — corrects my earlier wrong note in this doc. It's doctor-scoped (no patient FK), so policy lives in mig 097 (non-patient), not mig 094.
- Phase D matrix scaffolding: `audits/rls-test-matrix.sql` started with scenario template + first patient-identity-table section.

---

Phase A is **complete** (end of cowork session 2, 2026-04-30). All sub-tasks resolved:
- A.1 ✅ snapshot file (166/166 verified)
- A.2 ✅ admin-client triage (210 callsites, 92 files)
- A.3 ✅ patient-joined tables (with 6 missed-by-prompt tables flagged for § 8)
- A.4 ✅ existing tests inventory (7 files, no runtime runner, zero RLS coverage)
- A.5 ✅ audit_events refined Option A'

Phase B is **unblocked**. Next step: mig 092 (helper functions) per Mo's hybrid ruling.

**Critical input for Phase B/C/F**: the admin-client triage's 119 MIGRATE-TO-USER callsites group into 5 dependency hot-spots (`patient-privacy-checks`, `clinic-context`, `visibility`, `prescription-sync`, `lab-results`). The new RLS in Phase C must be permissive enough that each of these continues to work after Phase F switches the callsites to user-context client. Validate this during Phase D matrix design.

---

## Time spent so far / time remaining

- Cowork session 1 (this session): ~1.5 hr — Phase A scaffolded, ambiguities surfaced + ruled, audit_events analysis complete, snapshot generator documented.
- Estimated remaining cowork time: 7–10 hours total across multiple sessions, in line with Mo's "8–12 hours" budget for Prompt 6.

**Recommended cadence:** ship 2–3 sessions of 2–3 hours each. Don't try to finish in one marathon — context cost on a database security rewrite is real, and the 8 PASS-critical matrix runs in Phase D each take real time.
