# B07 Phase G — Execution Decision Log

**Date:** 2026-05-10
**Branch:** main
**Pre-work HEAD:** `02f3246` (Phase F.5 cleanup)
**Cowork session:** B07 Phase G — Clinic-app dependent visibility

---

## Pre-work verification status

| Check | Result |
|-------|--------|
| `git log -1 HEAD` = `02f3246` | ✓ |
| `git ls-remote origin main` = `02f3246` | ✓ |
| Working tree clean | ✓ |
| `gh` CI verification | ✗ (gh unavailable in sandbox — STOP exception #11; will note in final surface) |
| `packages/shared/lib/auth/patient-context.ts` exists (Phase F.5 helper) | ✓ |
| `apps/patient/app/api/patient/lookup-by-phone/route.ts` exists | ✓ |
| `apps/patient/app/(patient)/patient/settings/caregivers/grant/page.tsx` exists | ✓ |
| `PatientHeader` `leadingAction` prop in `@ui-clinic` | ✓ |
| `audits/b07-phase-f5-execution-2026-05-10.md` exists (16 decisions) | ✓ |
| `audits/b07-phase-f-findings.md` shows #1, #2, #3, #7, #8 RESOLVED | ✓ |
| `.gitignore` includes `.git-commit-message-*.txt` (line 70) | ✓ |
| Supabase staging project accessible (`mtmdotixlhwksyoordbl`) | ✓ |

---

## Section 0 — Architectural survey

### 0.1 Question

Per Phase G prompt: "Which clinical tables FK to `patients(id)` directly? Which can accept a minor's record (minors have no `patients.id` row by ruling 10)? Whether the FK chain needs bridging via `patient_clinic_records` OR whether existing tables need a generated-column for `global_patient_id`."

### 0.2 Survey — FK chain from clinical tables to `patients(id)`

**Probe (Supabase MCP `execute_sql` against staging):**

```sql
SELECT conname, conrelid::regclass::text AS table_name, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f'
  AND pg_get_constraintdef(oid) ~* 'REFERENCES\s+(public\.)?patients\s*\(';
```

**Result — 35 FK constraints reference `patients(id)`:**

| Category | Tables | `patient_id` nullable? | `global_patient_id` column? |
|----------|--------|------------------------|------------------------------|
| **Mig 080 fully extended (NOT NULL all three)** | `clinical_notes`, `doctor_patient_relationships`, `patient_consent_grants`, `patient_visibility` | NO | YES (NOT NULL) |
| **Mig 080 half-extended (patient_id NOT NULL, gpid NULLABLE)** | `imaging_orders`, `lab_orders`, `lab_results`, `prescription_items`, `vital_signs` | NO (patient_id) | YES (NULLABLE) |
| **Mig 080 partially nullable (patient_id NULLABLE, gpid NOT NULL)** | `appointments` | YES | YES (NOT NULL) |
| **Mig 080 NOT extended — patient_id NOT NULL, no gpid** | `check_in_queue`, `chronic_conditions`, `conversations`, `default_sharing_preferences`, `immunizations`, `lab_results_orders`, `medication_adherence_log`, `medication_reminders`, `patient_allergies`, `patient_diary`, `patient_health_metrics`, `patient_medical_records`, `patient_medication_intake`, `patient_medication_reminders`, `patient_medications`, `patient_recovery_codes`, `payments`, `phone_corrections`, `record_sharing_preferences`, `sms_reminders` | NO | NO |
| **Auxiliary** | `account_recovery_requests`, `notifications`, `otp_codes`, `phone_change_requests`, `patient_phone_history`, `patients` (self-ref via `guardian_id`, `duplicate_of_patient_id`) | mixed | mixed |

### 0.3 Empirical state — do minors have patients/PCR rows today?

**Probe:**

```sql
SELECT 
  (SELECT count(*) FROM public.global_patients WHERE is_minor = TRUE) AS total_minor_gps,
  (SELECT count(*) FROM public.patients p WHERE EXISTS (SELECT 1 FROM public.global_patients gp WHERE gp.id = p.global_patient_id AND gp.is_minor = TRUE)) AS patients_rows_for_minors,
  (SELECT count(*) FROM public.patient_clinic_records pcr WHERE EXISTS (SELECT 1 FROM public.global_patients gp WHERE gp.id = pcr.global_patient_id AND gp.is_minor = TRUE)) AS pcr_rows_for_minors,
  (SELECT count(*) FROM public.patients WHERE is_dependent = TRUE) AS legacy_dependent_patients_rows;
```

**Result:**

| Metric | Count |
|--------|-------|
| Total minor gps (`is_minor=TRUE`) | 3 |
| Minors with guardian set | 3 |
| `patients` rows linked to a minor gp | **3** |
| `patient_clinic_records` rows for minor gps | **3** |
| Legacy `patients.is_dependent = TRUE` rows | 3 |

**Key finding:** All 3 existing minors (Phase B mig 111 backfill) have BOTH a `patients` row AND a PCR row — i.e., the de facto pattern is **Option A (clinic-scoped `patients` row for minors)**. This was established by mig 111's backfill of legacy dependents.

### 0.4 Gap analysis — what about NEW minors created via Phase E?

Per `packages/shared/lib/data/dependents.ts` `createMinorGlobalPatient` (Phase C, line 183):

> Inserts a row into `global_patients` only. Does NOT create a `patients` row or PCR row.

Per `packages/shared/lib/api/handlers/patients/onboard/handler.ts` (Phase E, line 254):

> `// The new minor has no legacy patients row, so // using the v2 minor flow should switch to gp-id-driven`

**Consequence:** NEW minors created via Phase E v2 `isDependent: true` path have only a gp row. They have NO `patients` row, NO PCR row. Therefore:

- They **cannot** be added to `check_in_queue` (NOT NULL `patient_id`, no gpid column)
- They **cannot** have clinical notes written (NOT NULL `patient_id` → mig 081 trigger raises EXCEPTION because no `patients` row to derive from)
- They **cannot** have prescriptions, appointments, vital_signs, lab_orders, payments, etc. (same mig 081 failure)
- Mo's case A1 ("mother registers 6yo, books appointment") is **architecturally blocked today**.

### 0.5 Options for resolution

**Option A — Patients row + PCR row at clinic of registration (recommended)**

When frontdesk registers a minor at clinic X, the v2 minor onboarding ALSO creates:

1. A `patients` row at clinic X with:
   - `global_patient_id` = minor gp id
   - `is_dependent = TRUE`
   - `parent_phone` = guardian phone
   - `phone` = guardian phone (per legacy convention; minors have no own phone)
   - `guardian_id` = legacy guardian's `patients.id` if one exists at clinic X, else NULL
2. A `patient_clinic_records` row for (minor gp id, clinic X).
3. A `doctor_patient_relationships` row (existing onboard flow already creates this for adults).

**Pros:**
- Matches the **already-existing pattern** for the 3 backfilled minors (mig 111). The empirical state IS Option A.
- NO migration needed. Pure code change in `createMinorGlobalPatient` or the calling onboard handler.
- mig 081 compat triggers work unchanged (the `patients` row provides the `patient_id` derivation path).
- All 31 clinical FKs continue to work for minors.
- Reversible: at Prompt 6.5 legacy cleanup, the minor `patients` row gets removed alongside the rest of the legacy `patients` table compat pattern.
- Consistent with adults: an adult patient at clinic X is `(gp, patients, PCR, DPR)` — a minor at clinic X becomes the same shape, just `is_dependent=TRUE` and `parent_phone` populated.
- Consistent with Phase B ruling 32 (additive, reversible, architecturally consistent).

**Cons:**
- Minors get a `patients` row at every clinic they're seen at (small data duplication; same as adults).
- The Phase E onboard handler comment ("minor has no legacy patients row") becomes outdated — needs updating.

**Option B — Add `global_patient_id` to remaining ~20 clinical tables + relax `patient_id NOT NULL` on all 31 tables**

**Pros:**
- Cleaner long-term v2 model — clinical data attaches to gp directly.
- Phase G could ship this as the bridge mig 117.

**Cons:**
- Massive migration (touches 20+ tables, relaxes NOT NULL on 31).
- mig 081 needs rewrite to handle no-patients-row case → may trip STOP exception #6 (RLS or core trigger changes need Mo review).
- High regression risk for adult flows.
- Destructive (relaxing NOT NULL is hard to reverse).
- Conflicts with the existing pattern for 3 backfilled minors.

**Option C — Existing `patient_clinic_records` table already serves; Phase G just uses it**

**Pros:**
- PCR table exists (mig 075).

**Cons:**
- Does not solve the FK problem. Clinical tables FK to `patients(id)`, not PCR. PCR is the per-clinic relationship row, not a substitute for the clinical-data anchor.
- Empirically, PCR rows for the 3 minors exist ALONGSIDE `patients` rows, not instead of them.

**Option D — No bridge; clinic MVP read-only on minors**

**Pros:**
- Zero plumbing.

**Cons:**
- Mo's case A1 fails (mother cannot book child's appointment).
- Frontdesk dependent registration becomes write-only-to-gp with no clinic visibility.
- Undermines the purpose of Phase G.

### 0.6 Recommendation

**Option A.** Empirical state of the 3 backfilled minors already demonstrates this pattern. Phase G's Section 1 (frontdesk dependent registration) becomes: extend the Phase E v2 `isDependent: true` path to ALSO create a `patients` row + PCR row + DPR row at the registering clinic, matching the structure of an adult onboarding.

**No migration needed for Section 0 architectural concern.** Section 7 (schema mig) skipped per ruling 32's conditionality.

**Implementation surface:**

- `packages/shared/lib/data/dependents.ts` — extend `createMinorGlobalPatient` to optionally also create a clinic-scoped `patients` row + PCR row when `clinicId` is provided.
- `packages/shared/lib/api/handlers/patients/onboard/handler.ts` — when `isDependent: true`, after gp creation, call the clinic-scoped extension to land the `patients` row + PCR row at `requesterClinicId`.
- Update the Phase E comment at line 254 to reflect new reality.

**Sympathetic doc updates:**

- `audits/B07-architectural-review-2026-05-10.md` §7.3 — note that "v2 minor flow" includes clinic-scoped patients row creation.
- `DECISIONS_LOG.md` — new entry (e.g., D-080) documenting "Phase G ruling 33: minors get clinic-scoped patients + PCR + DPR rows at registering clinic, matching adult onboarding shape."

---

## Mo's ruling — Option A approved with Section 1 refinement

**2026-05-10:** Option A approved. Refinement attached:

> "Phase G extends scope on Section 1. The `onboardPatient` v2 path with
> `isDependent: true` must create `(global_patients, patients, PCR, DPR)`
> — all four rows — at the registering clinic, matching the empirical
> pattern of mig 111 minors and the structure of adult onboarding.
> Original Phase E modification was incomplete; Phase G completes it."

Plus housekeeping: backfill DPR for fatima ahmad
(`6036cd97-f149-449f-8975-cb7cc5651059`) so all 3 mig 111 minors have
consistent `(patients, PCR, DPR)` shape. Document as a small Phase G
data-fix SQL (not a migration).

Phase G proceeds through Sections 1–6 + verification autonomously,
single final surface at end. Section 7 skipped per Section 0 conclusion.

---

## Decision log — Sections 1-6 + housekeeping

### Decision 1: `establishMinorClinicPresence` helper in `dependents.ts`, not in `patients.ts`

**Date:** 2026-05-10
**Context:** Section 1 needed a new function to land (patients, PCR, DPR) for a minor at the registering clinic.

**Options considered:**
1. Add as a method to `patients.ts:createWalkInPatient` with a `minorGlobalPatientId` parameter. Pros: groups walk-in patient creation in one file. Cons: `createWalkInPatient` is already 200+ lines; mixing minor-specific logic (no own phone, synthetic DEP_*, parent_phone resolution) bloats further; minor logic is distinct enough to warrant separation.
2. New function `establishMinorClinicPresence` in `dependents.ts`. Pros: single-responsibility (dependents.ts owns minor lifecycle); easier audit/review; the function is small (~120 lines incl. comments); call site in onboard handler is one extra line. Cons: two functions now exist for similar purposes; potential future drift.

**Decision:** Option 2.

**Reasoning:** Phase C convention (`dependents.ts` = minor lifecycle) carries naturally into Phase G; the function reuses `getOrCreatePatientClinicRecord` already imported into `patient-clinic-records.ts`; minor-specific synthetic-phone logic doesn't pollute the adult walk-in path.

### Decision 2: Synthetic `DEP_<timestamp>_<rand>` phone for minor `patients.phone`

**Date:** 2026-05-10
**Context:** `patients.phone` is NOT NULL. Minors don't have phones; using the parent's phone risks collision when the parent registers themselves as a separate patient at the same clinic.

**Empirical pattern:** mig 111 minors #2 (نوح عمر) and #3 (احمد محمد) use `DEP_<timestamp>_<rand>` synthetic phones. Minor #1 (fatima) uses the parent's phone (`01234567890`) because mig 111's special-case Option A backfill set patient_id = gp_id (1:1) for the unrecoverable-guardian case.

**Decision:** Use `DEP_<Date.now()>_<nanoid(5).toUpperCase()>` synthetic phone, matching minors #2/#3. The 1:1 case for fatima was a backfill-only construct; new minors via Phase G follow the more common pattern.

**Trade-offs:** Minors' patients rows can't be looked up by typing the parent's phone in the existing search bar (the parent's row is what surfaces). Phase G Section 2's parent-aware search via `searchMyPatients` already handles this case (search includes `parent_phone.ilike.%query%`).

### Decision 3: Phase G search v2 augmentation via two-pass JOIN, not supabase-js relational select

**Date:** 2026-05-10
**Context:** Section 2 needed to add `is_minor`, `date_of_birth`, `guardian_global_patient_id`, `guardian_display_name` to search results. The search handler currently returns trimmed patients rows; we needed to JOIN through `global_patients` to get the v2 fields.

**Options considered:**
1. supabase-js relational select: `select('*, global_patients!inner(is_minor, date_of_birth, ...)')`. Pros: single round-trip. Cons: guardian display_name requires a self-referential FK join on `global_patients.guardian_global_patient_id` — PostgREST's grammar doesn't compose cleanly with self-FKs.
2. Two-pass lookup in TypeScript: collect gp ids → fetch gp rows → collect guardian gp ids → fetch guardian rows. Pros: legible; type-safe; matches Phase F.5 Decision 7. Cons: 2 extra queries per search response.

**Decision:** Option 2 (matches Phase F.5 Decision 7 precedent for the same JOIN problem in delegations.ts).

**Reasoning:** Phase F.5 already established this pattern; consistency wins. Search payloads are small (limit=10 default), so the extra queries are cheap. PostgREST grammar trap is a known issue.

### Decision 4: Pediatric filter param on existing GET /api/doctor/patients, not new endpoint

**Date:** 2026-05-10
**Context:** Section 5 added a pediatric/adult/all filter on the doctor patients list. Two shapes possible: new endpoint or query param.

**Decision:** Query param `?pediatric=all|true|false` on the existing `/api/doctor/patients` endpoint.

**Reasoning:** Filter applies AFTER the same scope-checked patient list; no need for a separate endpoint. URL-param-backed state survives refresh + share-link (Mo ruling 31). The same param can extend to `/api/patients/search` (Section 2) and frontdesk patient list (Section 5) for consistency.

### Decision 5: Care network as new clinic-side endpoint `/api/admin/patient/[gpId]/care-network`, not extension of patient-detail

**Date:** 2026-05-10
**Context:** Section 6 (clinic-side delegation visibility) needed somewhere for the patient detail UI to fetch active delegations.

**Options considered:**
1. Extend `GET /api/doctor/patients/[id]` to include `care_network` array in the response. Pros: one fewer round-trip. Cons: bloats the patient-detail response; couples the patient view to delegations table even on the (common) case where no delegations exist.
2. New endpoint `GET /api/admin/patient/[gpId]/care-network`. Pros: cleanly separable; UI can fetch lazily / skip on empty; gp-id-indexed (matches the v2 identity model). Cons: extra round-trip on patient-detail open.

**Decision:** Option 2.

**Reasoning:** Most patients have no delegations; lazy-fetching keeps the patient-detail payload lean. The gp-id input is the canonical Phase B v2 identity; the legacy `patients.id`–indexed handlers gradually cede ground to gp-id-indexed handlers. The new endpoint sits at `/api/admin/patient/[gpId]/...` (Phase F.5 convention for gp-id-indexed clinic-app endpoints).

### Decision 6: Care-network endpoint scope check via patients-table + DPR/membership, not via RLS

**Date:** 2026-05-10
**Context:** The clinic-side care-network endpoint must enforce "caller has scope on this patient." Phase D's RLS helpers (`can_view_patient_data_at_clinic`) already gate the underlying table via mig 116; but the handler still needs an explicit 404 path for non-scoped callers (rather than returning an empty list).

**Decision:** Explicit scope check at handler boundary:
- doctor: must have a DPR row with the patient at any clinic.
- frontdesk: must be a member (FRONT_DESK/ASSISTANT/OWNER) of any clinic where the patient has a row.

**Reasoning:** Matches the patient-detail handler's defense-in-depth pattern (`/api/doctor/patients/[id]`). Returns 404 (not 403) on no-scope to avoid disclosing whether the patient exists in other clinics' rosters.

### Decision 7: relationship_type = 'primary' for minor DPR (not 'walk_in')

**Date:** 2026-05-10
**Context:** Both Phase G Section 1 (`establishMinorClinicPresence`) and the fatima housekeeping SQL needed to write a DPR row for a minor.

**Empirical discovery:** The DPR table's CHECK constraint allows only `('primary' | 'secondary' | 'consultant')`. Legacy `createWalkInPatient` (patients.ts) writes `relationship_type: 'walk_in'` which violates the CHECK. The 3 mig-111 backfilled minors carry `relationship_type: 'primary'` — i.e., the empirical convention is 'primary' for walk-in / dependent-walk-in.

**Decision:** Use `relationship_type: 'primary'` + `access_type: 'walk_in'` + `status: 'active'` for new minor DPRs. Matches minors #2/#3 empirically.

**Implication:** This surfaces a separate Phase G finding (#3 below) — legacy `createWalkInPatient` is likely failing CHECK in prod for adult walk-ins via that path, OR it has a fallback we haven't found. Out of Phase G scope; flagged for triage.

### Decision 8: `PediatricBadge` in `@ui-clinic`, age helper inline (not shared utility)

**Date:** 2026-05-10
**Context:** Section 3/4/5 needed an age badge + "Pediatric patient" tag for clinic surfaces. Patient app already has `apps/patient/components/AgeBadge.tsx`.

**Options considered:**
1. Move AgeBadge to a shared package, re-use across patient + clinic.
2. New `PediatricBadge` in `@ui-clinic/components/patient/`, with inline `calculateAge`. Patient app's AgeBadge stays untouched.

**Decision:** Option 2.

**Reasoning:** Phase G is clinic-app only (per Mo prompt rule "do not touch patient-app UI"). Moving AgeBadge cross-package risks regressing patient surfaces that aren't covered by Phase G testing. Per Mo's ruling 30 the clinic-side needs a richer badge (age + optional "Pediatric patient" pill); patient-side `AgeBadge` is age-only. Distinct enough to justify two components.

### Decision 9: Section 7 skipped — no migration needed

**Date:** 2026-05-10 (confirming Section 0 conclusion)
**Context:** Section 0 architectural survey determined the existing `patients` table + mig 081 compat triggers already accommodate minors when (patients, PCR, DPR) rows exist. Option A is the lowest-friction implementation.

**Decision:** No mig 117 shipped. Phase G is pure code change.

**Reasoning:** Per ruling 32, mig 117 is conditional on Section 0 survey. Survey concluded no schema bridge needed. Mig 081 unchanged; mig 113-116 RLS unchanged; STOP exception #6 not tripped.

### Decision 10: Housekeeping fatima DPR as one-off SQL file in `audits/`, not migration

**Date:** 2026-05-10
**Context:** Mo's housekeeping request: backfill fatima's DPR row. File shape was caller's choice.

**Decision:** SQL file at `audits/b07-phase-g-fatima-dpr-backfill-2026-05-10.sql`. Applied via Supabase MCP execute_sql against staging. NOT a migration (data fix only, no DDL).

**Reasoning:** Migrations are for DDL + cross-environment schema state. A one-off data fix doesn't belong in the migration ledger. `audits/` is the right home alongside the decision log.

---

## Phase G Findings

### Finding #1: `createWalkInPatient` (patients.ts) writes `relationship_type: 'walk_in'`, which violates the DPR CHECK constraint

**Severity:** blocking-MVP (if path is hit)
**Status:** out of Phase G scope; flagged here for triage

**Description:** DPR table's `relationship_type` CHECK accepts only
`('primary' | 'secondary' | 'consultant')`. `createWalkInPatient`
(packages/shared/lib/data/patients.ts) line 511 (dependents dedup branch)
and line 694 (main walk-in branch) both write `'walk_in'`. If this
function is actively hit in production for adult walk-ins, those inserts
must fail. Either (a) the path is dead, (b) there's a fallback we
missed, or (c) the CHECK was tightened after these call sites were
written. Phase G's `establishMinorClinicPresence` uses `'primary'` to
match the empirical convention from mig 111 minors.

**Recommended next step:** Triage in a follow-up Phase G.5 or similar.
Either flip the legacy call sites to `'primary'` or relax the CHECK.

### Finding #2: mig 111 minor #1 (fatima) lacked DPR — backfilled by Phase G housekeeping SQL

**Severity:** resolved
**Status:** closed by `audits/b07-phase-g-fatima-dpr-backfill-2026-05-10.sql`

**Description:** Section 0 empirical probe revealed fatima had patients +
PCR but no DPR. The other 2 mig-111 minors had DPRs. Mo flagged
proactively; Phase G shipped the one-off backfill SQL.

**Outcome:** Verified all 3 minors now show `(patients, PCR, DPR)` =
`(1, 1, 1)`. New DPR id: `f01f86a4-fa68-42c7-871b-28c1a5a59f7e`.

### Finding #3: Phase E onboard handler comment at line 254 was outdated by Phase G

**Severity:** nice-to-have (documentation)
**Status:** resolved in this commit

**Description:** Phase E left a comment "The new minor has no legacy
patients row, so using the v2 minor flow should switch to gp-id-driven
queries." Phase G makes that statement false — minors now DO get a
patients row.

**Resolution:** Phase G rewrites the comment block in the onboard handler
v2 path to reflect the new four-row shape.

### Finding #4: Search-result row visual differentiation for minors

**Severity:** nice-to-have
**Status:** resolved in Section 2

**Description:** Per Mo's Section 2 ruling, minor rows should have a
subtle left-border accent. Implemented as a 3px right-border (RTL) in
muted blue (`border-r-[3px] border-r-[#1D4ED8]/30`) on the frontdesk
dashboard's search-result rows.

### Finding #5: Pediatric badge typography may overflow at narrow viewports

**Severity:** nice-to-have
**Status:** future (Phase F finding #6 already tracks this)

**Description:** The "Pediatric patient" tag with the UserPlus icon may
overflow on narrow viewports (<380px). Phase F finding #6 already tracks
narrow-viewport QA; Phase G's tag inherits the same future ticket.

### Finding #6: `gh` unavailable in cowork sandbox — CI verification deferred

**Severity:** ops
**Status:** STOP exception #11 (per Phase G prompt — proceed but flag)

**Description:** `which gh` returned empty in the sandbox; could not
verify `02f3246` CI status before commit. Per prompt's STOP exception
#11, proceeded with commit. Mac-side verification expected.

---

## Sympathetic doc updates

Pending application post-commit:

- `audits/STATE_OF_WORK.md` — mark Phase G completed.
- `audits/PROGRAM_STATE.md` — B07 status update; Phase H queued.
- `ARCHITECTURE.md` §clinic-app (if exists) — note dependent registration toggle, pediatric indicators, care-network surface.
- `DECISIONS_LOG.md` — new entries D-080 (Phase G ruling 33 four-row minor shape) and D-081 (clinic-side care-network endpoint).

---

## Verification

| Gate | Status |
|------|--------|
| Root `tsc --noEmit` | ✓ |
| `apps/clinic` `tsc --noEmit` | ✓ |
| `apps/patient` `tsc --noEmit` | ✓ |
| `npm run lint:scopes` | ✓ |
| Mac-side `next build` (clinic + patient) | Pending — Mac-side execution |
| Fatima DPR backfill applied to staging | ✓ (new DPR `f01f86a4-...`) |
| 3-minor consistency check (patients/PCR/DPR = 1/1/1 each) | ✓ |

---

## Phase H readiness

Phase H (RLS test matrix expansion to run_no = 4.0) needs to add
scenarios that cover:

1. **Minor patient at clinic-of-registration** — a doctor at the
   registering clinic should be able to SELECT clinical rows for the
   minor (covered by mig 115 PCR RLS extension already; Phase H verifies
   end-to-end with the (gp, patients, PCR, DPR) chain present).
2. **Minor patient at NON-registering clinic** — a doctor at a different
   clinic should NOT see clinical rows unless a patient_data_share
   exists (D-068).
3. **Frontdesk pediatric/adult/all filter** — verify the filter SQL
   doesn't bypass scope (i.e., a frontdesk at clinic A filtering to
   pediatric should not see minors at clinic B).
4. **Care-network endpoint scope check** — doctor at clinic A querying
   for a minor at clinic B should get 404, not the delegation list.
5. **Guardian display name JOIN visibility** — the JOIN to global_patients
   in search + patient-detail must not bypass RLS on global_patients
   itself.

Estimated new scenarios: ~15-20.

Test fixtures needed:
- Guardian persona (claimed adult gp + matching auth.users)
- Delegate persona (separate claimed adult gp + auth.users)
- Minor gp (newly registered via Phase G v2 path)
- Clinic relationships: (guardian, clinic A), (guardian, clinic B) for cross-clinic tests
- Active delegation: guardian → delegate with subset of capabilities

