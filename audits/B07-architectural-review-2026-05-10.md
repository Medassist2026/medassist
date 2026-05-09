# B07 — Dependent Accounts: Architectural Review

**Date:** 2026-05-10
**Reviewer:** Cowork session (autonomous-execution per protocol established 2026-05-09)
**HEAD reviewed:** `08cc9b2` (Phase F closeout — pre-push gate + Tier 2 next bump + Task 19 audit)
**Authority basis:** Mo's three load-bearing answers (2026-05-09); D-068 directional consent; REVIEW_CRITERIA.md §1.1 / §2.1 / §5; Empirical Lessons #1–#18.

This is an **architectural review document**, not a build deliverable. No production code, schema, or migration changes were made during this review. The review's output is a precise empirical map of what exists, a reconciliation against Mo's stated premises, an architectural design proposal, and a list of decisions Mo must rule on before the B07 build can begin.

---

## Section 1 — Pre-work findings: empirical state of existing code

### 1.1 — Migrations referencing dependent / caregiver / guardian concepts

| Mig | Filename | Concept | Status (staging) | Notes |
|-----|----------|---------|------------------|-------|
| 004 | `004_add_patient_demographics.sql` | `patients.parent_phone TEXT`; `patients.is_dependent BOOLEAN DEFAULT FALSE`; index `idx_patients_parent_phone` | Applied | Original dependent fields. Text-only parent phone (no FK). |
| 010 | `010_phase8_patient_empowerment.sql` | `doctor_patient_relationships.relationship_type` ENUM-string `('primary','secondary','consultant')` | Applied | Doctor↔patient access tier. NOT guardian↔dependent. |
| 026 | `026_data_foundation_fixes.sql` | Backfills `clinic_id` on `doctor_patient_relationships` | Applied | Tangential — only mentions DPR. |
| 030 | `030_add_guardian_id_to_patients.sql` | `patients.guardian_id UUID REFERENCES patients(id) ON DELETE SET NULL`; partial index `idx_patients_guardian_id` | Applied | Proper FK to guardian's patient row. Header comment: "guardian_id takes precedence over parent_phone for relational integrity; parent_phone is kept as a human-readable fallback." |
| 049 | `049_backfill_self_registered_patients.sql` | Backfills `patients.clinic_id` for self-registered users; cascades to clinical tables | Applied | No guardian/dependent field touched. Pure clinic_id backfill. |
| 073 | `073_create_global_patients.sql` | Creates `global_patients` (Layer 1 of v2 identity) | Applied | **No guardian/dependent column on `global_patients`.** Only mention is a comment in the placeholder DENY-ALL policy: "Replaced by self/clinic/caregiver policies in Prompt 6 (ORPH-V2-06)" — this comment was never implemented; no caregiver policy exists. |
| 075 | `075_create_patient_clinic_records.sql` | Creates `patient_clinic_records` (Layer 2 of v2 identity) | Applied | **No guardian/dependent column on `patient_clinic_records`.** |
| 080 | `080_add_global_refs_to_clinical_tables.sql` | Adds `global_patient_id` + `patient_clinic_record_id` to clinical tables | Applied | No dependent linkage carried forward. |
| 081 | `081_compatibility_triggers.sql` | Triggers that mirror writes between legacy `patients` and v2 `(global_patients, patient_clinic_records)` | Applied | Mentions `parent_global` / `parent_pcr` only as variable names in `lab_results→lab_orders` parent-result hierarchy (not parent-child humans). |
| 092–097 | RLS policy tree | RLS for v2 identity / clinical / operations / communication / non-patient | Applied | **All RLS policies on `global_patients` key off `claimed_user_id = auth.uid()`** (mig 093 lines 75, 95–96, 122, 160, 181, 207, 244). One-to-one self-claim semantics; no delegation expression. |

**No migration creates a dedicated caregiver / dependent / delegation / relationship table.** The only relationship-like table is `doctor_patient_relationships`, scoped to clinical access tier (`primary | secondary | consultant`), not patient↔patient.

### 1.2 — Live staging schema (project `mtmdotixlhwksyoordbl`, queried 2026-05-10)

**Tables matching `caregiver|guardian|dependent|delegate|relationship|link|principal`:** exactly one — `doctor_patient_relationships`. No `caregivers`, `dependents`, `caregiver_links`, `account_links`, `patient_relationships`, or similar table exists.

**Columns matching the same patterns** (all schemas):

```
patients.guardian_id      uuid    NULL    (FK to patients.id, ON DELETE SET NULL)
patients.is_dependent     boolean DEFAULT false   (nullable)
patients.parent_phone     text    NULL
doctor_patient_relationships.relationship_type   text   DEFAULT 'primary'
```

**Production data counts** (live `patients` table, 2026-05-10):
- Total rows: 38
- `is_dependent = TRUE`: 3
- `parent_phone IS NOT NULL`: 3
- `guardian_id IS NOT NULL`: 1

**`global_patients` columns** (verified live): id, normalized_phone, legacy_phone, display_name, date_of_birth, age, sex, preferred_language, claimed, claimed_at, claimed_user_id, account_status, merged_into, deceased_at, consent_to_anonymous_research, consent_to_anonymous_research_at, created_at, updated_at, patient_code_hash, patient_code_generated_at, patient_code_expires_at. **No guardian/dependent/principal/delegate column.**

**`patient_clinic_records` columns:** id, global_patient_id, clinic_id, is_anonymous_to_global, consent_to_messaging, consent_to_messaging_granted_at, first_seen_at, last_seen_at, created_at, updated_at. **No guardian/dependent column.**

**`audit_events` shape** (load-bearing for delegation): `actor_user_id` (uuid, nullable, FK to auth.users via mig 074); `actor_kind` text NOT NULL with CHECK (`user|system|migration`); `entity_type`, `entity_id`; `metadata` jsonb; **`resolved_global_patient_id` GENERATED ALWAYS** as `COALESCE((NULLIF(metadata->>'global_patient_id',''))::uuid, CASE WHEN entity_type='global_patients' THEN entity_id ELSE NULL END)`. The actor and the subject are already separate fields. This is the single most architecturally important finding for delegated authority — the audit pipeline already supports actor ≠ subject without any schema change.

### 1.3 — TypeScript / JS code paths (production, excluding `.next/` and `node_modules/`)

Exhaustive list of source files referencing `\bguardian\b | \bdependent\b | parent_phone | is_dependent`:

| File | Role | What it does |
|------|------|--------------|
| `packages/shared/lib/supabase/types.ts` | Type defs | Lines 1794, 1798, 1817, 1821, 1840, 1844 — defines `is_dependent: boolean \| null` and `parent_phone: string \| null` in patients Row/Insert/Update. **No guardian_id type def at this surface.** |
| `packages/shared/lib/data/patients.ts` | Data layer | Lines 21–23 (type), 233 (validation), 449–567 (createPatient flow with guardian resolution), 901–907 (search includes parent_phone). Implements: dedupe-by-(parent_phone+name), `guardianId` direct or resolve-by-parent_phone, FK store of `guardian_id`, walk_in_limited relationship creation when same dependent visits new doctor. |
| `packages/shared/lib/api/handlers/patients/create/handler.ts` | API | Lines 16–17, 64–67 — accepts `isDependent`, `parentPhone`, `guardian_phone`. Validates parent phone required for dependents. |
| `packages/shared/lib/api/handlers/doctor/patients/create/handler.ts` | API | Lines 32–35, 102–104 — same shape as above plus explicit `guardianId` pass-through. |
| `packages/shared/lib/api/handlers/doctor/patients/search/handler.ts` | API | Lines 53–56 — surfaces `is_dependent`, `parent_phone`, `guardian_id` on search results. |
| `packages/shared/components/clinical/PatientSelector.tsx` | UI | Lines 43–44 (props), 154 (displays "dependent" badge on selected patient), 307–317 (results list shows guardian_name), 400–457 (form path: search guardian via `/api/patients/search` when is_dependent toggled, attach selected guardian.id). |
| `packages/shared/components/clinical/SessionForm.tsx` | UI | Lines 42–45 (props), 232–250 (state: `isDependent`, `dependentType` `child|elderly|special|null`, `guardianCandidate`, `guardianConfirmed`), 585–587 (load existing patient with family fields), 622–642 (auto-surface guardian when phone matches), 837–852 (submit payload with guardianId). The most complete dependent-aware UI in the codebase. |
| `packages/ui-clinic/components/frontdesk/PatientRegistrationForm.tsx` | UI | Line 143 (validation), 145 (parentPhone field), 165 (dependent body field). Frontdesk-side dependent toggle. |
| `packages/shared/lib/data/drug-interactions.ts` | Data | Two hits but **false positives**: "pH-dependent" and "vitamin K-dependent clotting factor" — chemistry/biology vocabulary, NOT dependent-account semantics. |

**Patient app side** (`apps/patient/`): zero source files reference dependent, guardian, parent_phone, or is_dependent. The shared `onboard` handler has one parent-phone validation line (mig 075-era), but no patient-app surface invokes it with dependent context.

### 1.4 — UI surfaces already implementing dependent flows

| Surface | Location | Coverage |
|---------|----------|----------|
| Frontdesk register-patient form | `packages/ui-clinic/components/frontdesk/PatientRegistrationForm.tsx` | Dependent toggle, parent phone field, validates parent phone required when toggled. Submits to `/api/patients/onboard`. |
| Doctor session form (walk-in / new patient) | `packages/shared/components/clinical/SessionForm.tsx` | Dependent toggle, dependent-type subtype (`child | elderly | special`), live guardian-search-by-phone with auto-surface of matching patient as `guardianCandidate`, explicit confirmation step (`guardianConfirmed`), guardian-name display in confirmation. Most fully developed dependent UX. |
| Patient selector (in-doctor "find patient") | `packages/shared/components/clinical/PatientSelector.tsx` | Search-result display includes `is_dependent` badge and `guardian_name` in subtitle (Arabic: "ولي الأمر: <name>"). Form variant has guardian-search subform when `is_dependent` toggled. |
| Patient app — register a child / dependent | (none) | No surface exists. No "add dependent," no "register on behalf of," no account switcher. |
| Patient app — view records as parent of X | (none) | No surface exists. |
| Patient app — accept delegation grant | (none) | No surface exists. |
| Clinic visit indicator: "patient is dependent of [parent]" | Partially — PatientSelector subtitle shows guardian_name. Doctor session reads `is_dependent` from patient row but the in-session UI does not gate prescription writing on it. | Read-only display only. |

### 1.5 — API handlers already implementing dependent concepts

| Handler | Endpoint | Behavior |
|---------|----------|----------|
| `packages/shared/lib/api/handlers/patients/create/handler.ts` | `POST /api/patients/create` | Accepts isDependent + parentPhone, validates, delegates to `createPatient` data-layer fn. |
| `packages/shared/lib/api/handlers/patients/onboard/handler.ts` | `POST /api/patients/onboard` (re-exported by both apps) | Same isDependent/parentPhone validation; this is the route the frontdesk form posts to. |
| `packages/shared/lib/api/handlers/doctor/patients/create/handler.ts` | `POST /api/doctor/patients/create` | Same shape + explicit `guardianId` pass-through (used when doctor confirmed match in search). |
| `packages/shared/lib/api/handlers/doctor/patients/search/handler.ts` | `GET /api/doctor/patients/search` | Returns `is_dependent`, `parent_phone`, `guardian_id` on every result so the search dropdown can group dependents under guardian. |
| `packages/shared/lib/api/handlers/patients/[id]/relationship/handler.ts` | `GET / POST /api/patients/[id]/relationship` | **NOT a dependency mechanism — name collision.** This endpoint is doctor↔patient relationship upgrade (walk_in→verified) via the privacy-code flow. Predates D-068 directional consent. |
| (no handler) | `POST /api/dependents/register` (or similar) | Does not exist. |
| (no handler) | `POST /api/delegations/grant`, `POST /api/delegations/accept`, `POST /api/delegations/revoke` | Do not exist. |

### 1.6 — Git history (commits touching dependent/caregiver concepts)

```
3cfb905  feat: fix dependent patient lifecycle — dedup, search, and family UI
1113104  UI/UX improvements: guardian linking, session form section progression, med editor redesign
a07735b  feat: interactive session form — auto-collapse, med chips, visible dependent hint
977b7ba  feat(session): UI polish, prominent dependent toggle, scroll reduction
68056e1  feat(session): P2 — caregiver/dependent toggle for walk-in patient creation
```

All five commits are clinic-side (frontdesk + doctor session), all predate the v2 identity layer (mig 073/075 era), and all operate on the legacy `patients` table. No commit in history adds dependent infrastructure to `global_patients` / `patient_clinic_records` / `patient_data_shares`. No commit in history adds dependent infrastructure to the patient app. No commit creates a delegation table.

### 1.7 — Summary of empirical state

The dependent feature is **shipped on the legacy `patients` table layer** (Layer 1 of v2 is unaware of it), **clinic-side only** (no patient-app surface), and **does not extend to delegated authority for adult-on-adult caregiving** (Pattern B is entirely unbuilt). The `global_patients` placeholder DENY-ALL policy comment from mig 073 ("Replaced by self/clinic/caregiver policies in Prompt 6") forecast a caregiver policy that was never written; mig 092–097 implemented self + clinic policies only. The audit pipeline already separates actor (`actor_user_id`) from subject (`resolved_global_patient_id`) and is ready to express delegation semantics today.

---

## Section 2 — Reconciliation: existing code vs. Mo's three answers

### 2.1 — Answer 1 (Pattern A: linked accounts)

> Children/dependents under 18 do NOT have their own `auth.users` row. They have a `global_patients` row linked to a parent's auth.users. Parent's phone is the only contact channel. Account graduates at majority. Parent can register multiple children.

**Alignment with existing code:**

| Premise component | Existing reality | Verdict |
|---|---|---|
| Child has no `auth.users` | Legacy `patients` rows for dependents have no `auth.users` link (the child has no email/phone to register with). Existing dependents are clinic-created, not self-registered. **Aligned in legacy layer; absent in v2 layer.** | Partial. |
| Child has `global_patients` row | **Untrue today.** The 3 live dependents on staging exist as legacy `patients` rows. They have no corresponding `global_patients` row because the v2 identity model is keyed by `normalized_phone NOT NULL UNIQUE`, and dependents have no phone of their own. The compatibility trigger (mig 081) would fail to mirror them. | **Divergence.** Rebuild needed. |
| Linked to parent's `auth.users` | The legacy `patients` table has `guardian_id` (FK to another `patients` row), which transitively can chain to a `claimed_user_id` if the guardian self-registered. **No direct FK from a dependent's row to the parent's auth.users.** | Divergence (indirection through a chain). |
| Parent's phone is the contact channel | Implicit via `parent_phone` + `guardian_id` — the SMS / message dispatch pipeline does not currently understand "look up parent's phone when child has no phone." | Divergence (dispatch layer unaware). |
| Graduation at majority | No code path exists. No "graduate dependent to standalone identity" function in `packages/shared/lib/data/`. No migration touches this concept. | Missing. |
| Multiple children per parent | The existing schema supports this (1:N from guardian_id), and `getMyPatients` already groups dependents under guardian. **Works in legacy; would need to be re-expressed in v2.** | Partial. |

**Verdict on Answer 1:** Premise holds at the design level, but existing code expresses it on the **legacy `patients` layer** that is being phased out (Prompt 6.5 will drop legacy patient_id columns per memory `project_clinic_id_rollout_complete.md`). On the **v2 layer that survives** (`global_patients` + `patient_clinic_records` + `patient_data_shares`), the premise is unrepresented. The dependent feature has been silently orphaned by the v2 identity rewrite; B07 is the workstream that re-grounds it on the v2 layer.

### 2.2 — Answer 2 (Two hard requirements)

> **Case A1:** Mother registers her 6-year-old at a pediatrician. Mother's phone is the contact. Mother's auth.users is the principal. Child is a `global_patients` row with `linked_to_global_patient_id` (or equivalent) pointing to mother.
>
> **Case A2:** Adult son manages his diabetic father's appointments and prescriptions. Father has his own auth.users (since he's an adult). Son is delegated authority via a separate mechanism (NOT Pattern A — this is delegated caregiving where both have auth identities).

**Case A1 reconciliation:**
- The mother registers a child today via the **clinic-side frontdesk form or doctor-session form** — not via the patient app. The existing flow creates a `patients` row with `is_dependent=true`, `parent_phone=<mother's>`, `guardian_id=<mother's patient row>`.
- Mo's stated premise — "Child is a `global_patients` row with `linked_to_global_patient_id` pointing to mother" — does not match the v2 schema today. There is no `linked_to_global_patient_id` column. There is no guardian-aware row in `global_patients`. The 3 live dependents do not have `global_patients` rows at all.
- **Action required:** new column on `global_patients` (`guardian_global_patient_id` or similar) + new column or behavior to mark the row as "minor / no own phone / contacted via guardian." Backfill the 3 live legacy dependents into `global_patients`.

**Case A2 reconciliation:**
- Mo's stated premise — "Son delegated authority via a separate mechanism" — has **zero existing implementation**. There is no delegation table, no delegation grant API, no delegation acceptance flow, no delegation UI. The son and the father, if both registered today, would be two unrelated `global_patients` rows with two separate `claimed_user_id` values pointing to two distinct `auth.users`. RLS would prevent either from seeing the other's records.
- **Action required:** new `patient_delegations` table (or similar), new grant/accept/revoke RPCs, new RLS policy that admits delegate auth.uid() as authorized for principal's records, new UI flows on patient app for both grantor (principal) and grantee (delegate).

**Verdict on Answer 2:** Case A1 is partially expressed in legacy code (clinic-side dependent registration); the v2 expression is missing. Case A2 is entirely unbuilt. Both cases require new schema, new data layer, and new UI before B07 can ship.

### 2.3 — Answer 3 (Authority delegation model with audit signature)

> Caregivers/parents have legal authority to consent on dependents' behalf. Each consent action is audited as "consented by [caregiver] on behalf of [patient]." Audit trail and authorization checks accommodate principal-vs-actor split.

**Alignment with existing audit pipeline:**

| Premise component | Existing reality | Verdict |
|---|---|---|
| Audit row captures actor distinct from subject | `audit_events.actor_user_id` (FK to auth.users) and `audit_events.resolved_global_patient_id` (GENERATED ALWAYS, derived from metadata or entity_id) are **already separate columns**. The pipeline expresses `actor_user_id != resolved_global_patient_id.claimed_user_id` natively. | **Excellent fit.** No schema change needed. |
| Audit row captures the *delegation* used | No existing column, but `metadata` is jsonb and accepts a `delegation_id` or `acting_as` field at zero schema cost. Existing audit consumers (Build 05 share lifecycle audits, Build 04 phone-change audits) already use `metadata` for ad-hoc context. | Implementable as metadata key. |
| Authority check function (`auth.uid()` is authorized to act on behalf of `subject_global_patient_id`) | **No such function exists.** Current RLS keys exclusively off `claimed_user_id = auth.uid()` (mig 093 lines 75, 95, 122, 160, 181, 207, 244). | Missing. Must build. |
| RLS policies admit delegate as authorized | Current policies do not. Adding a new INVOKER helper (`is_authorized_actor_on(global_patient_id)`) is the minimum-disruption path — it would OR-coexist with `claimed_user_id = auth.uid()` similar to how `can_clinic_access_global_patient` (D-064 helper #2) coexists with self-claim. | Missing. Must build. |
| API handlers consult delegation before mutating subject's records | Handlers today read `requireApiRole('patient')` and trust `auth.uid()` as principal. **No handler today understands "principal is X, actor is Y."** | Missing. Must add a `requireAuthorityOver(globalPatientId)` helper. |

**Verdict on Answer 3:** The premise is architecturally compatible with the existing audit pipeline (a fortunate consequence of mig 074's `actor_kind`/`actor_user_id` redesign and the `resolved_global_patient_id` GENERATED column). The premise is **not** compatible with the existing RLS or API handlers, both of which assume actor = principal. Build work is bounded to: a new authority-check helper, OR-coexistence policy edits across patient-side RLS in mig 093/094/095/096, and a `requireAuthorityOver(...)` helper used at API boundaries.

### 2.4 — Cross-answer architectural inflection

The three answers, taken together, point at a single architectural pattern:

> **An `auth.users` is a "principal" (or "actor"); a `global_patients` is a "subject." Authority is the relation between them.**

In Pattern A (parent-of-minor): authority is implicit from the `guardian_global_patient_id` link — if you can prove you're the claimed user of the parent's gp, you have authority over the child's gp. The child's gp has no `claimed_user_id` of its own; the link IS the authority.

In Pattern B (delegated caregiving between adults): authority is explicit — a row in `patient_delegations(principal_global_patient_id, delegate_user_id, capabilities, granted_at, expires_at, revoked_at, ...)` is the grant. Both gps have their own `claimed_user_id`; the delegation is parallel to those claims.

A single authority-check function `is_authorized_actor_on(global_patient_id, user_id)` returns TRUE if **any** of:
1. `user_id = global_patients.claimed_user_id` for that gp (self-claim — existing semantics);
2. `user_id` is the claimed user of a `global_patients` whose id equals this gp's `guardian_global_patient_id` (Pattern A);
3. an active row exists in `patient_delegations(principal_global_patient_id = this gp, delegate_user_id = user_id, revoked_at IS NULL, expires_at > NOW())` (Pattern B).

This function is the single gate. RLS uses it. API handlers use it. Audit-emitter helpers use it to populate `metadata.acting_as` and `metadata.authority_basis`. **One function, one OR-of-three predicate, three semantic patterns.**

### 2.5 — STOP-exception evaluation

Per protocol §STOP exceptions, this review evaluated whether to surface mid-flight:

- **(1) Existing code contradicts Mo's three answers in a way that requires Mo's ruling.** No. The existing code is on the legacy layer that's being phased out; the v2 layer is empty for this feature. There is no contradicting *implemented* model — there is only the absence of one. Build, not rebuild.
- **(2) B07 is substantially built and the review's scope changes.** No. The v2-layer build is 0%; the legacy-layer build is partial (clinic-side dependent registration). The legacy code is reusable as a UX reference but the schema must move.
- **(3) D-068 has implications that contradict authority delegation.** No. The audit pipeline (`resolved_global_patient_id` GENERATED ALWAYS) already supports actor ≠ subject, which is exactly what delegation requires.
- **(4) Architectural impossibility.** None surfaced. The OR-of-three predicate above is straightforwardly expressible in Postgres RLS via an INVOKER helper.
- **(5) Time budget.** Within budget at the time of this section's writing.

**No STOP exceptions fire. The review proceeds to design.**

---

## Section 3 — Authority model architectural design

### 3.1 — Representing "actor X is authorized to act on subject Y"

A canonical authority relation has three components (subject, actor, basis). Existing primitives:
- **subject** = `global_patients.id` (the person whose records / consent / appointments are being read or written).
- **actor** = `auth.users.id` (the human session driving the request — `auth.uid()` in DB context, `requireApiRole(...)` in API context).
- **basis** = one of `{self_claim | guardian_link | delegation_grant}`. This is what the `metadata.authority_basis` field on audit rows records, and what the helper function returns alongside the boolean for telemetry purposes.

**Recommended primary mechanism:** a SQL function `public.is_authorized_actor_on(p_global_patient_id uuid, p_user_id uuid) RETURNS boolean`, plus a richer companion `public.authority_basis_for(p_global_patient_id uuid, p_user_id uuid) RETURNS text` returning the basis enum value (or NULL when not authorized).

**Recommended schema additions** (Section 4 + Section 5 detail):
- `global_patients.guardian_global_patient_id uuid REFERENCES global_patients(id) ON DELETE SET NULL`. Nullable; non-NULL only for minors / dependents with no own auth.users.
- `patient_delegations` table with columns enumerated in Section 5.

The function consults both: a NULL-check on `guardian_global_patient_id` (Pattern A) plus a query against `patient_delegations` (Pattern B), unioned with the existing self-claim check.

### 3.2 — Capturing authority at consent time (D-068 audit trail)

D-068 emits `SHARE_GRANTED`, `SHARE_EXTENDED`, `SHARE_REVOKED`, `SHARE_AUTO_RENEWED`, `SHARE_EXPIRED`. Today these audit rows record `actor_user_id = auth.uid()` and `metadata.global_patient_id = <subject>`; the GENERATED `resolved_global_patient_id` picks that up.

For delegation, the only schema change is **two metadata keys**:
- `metadata.acting_as` — the basis enum: `self | guardian_of_minor | delegated_by_principal`.
- `metadata.authority_grant_id` — when basis is `delegated_by_principal`, the `patient_delegations.id` of the grant invoked. NULL or absent for `self` and `guardian_of_minor`.

Audit row example (Pattern B son-acts-on-father):
```json
{
  "actor_user_id": "<son's auth.users.id>",
  "actor_kind": "user",
  "action": "SHARE_GRANTED",
  "entity_type": "patient_data_shares",
  "entity_id": "<share row id>",
  "metadata": {
    "global_patient_id": "<father's gp.id>",
    "grantor_clinic_id": "...",
    "grantee_clinic_id": "...",
    "acting_as": "delegated_by_principal",
    "authority_grant_id": "<delegations row id>"
  }
}
```

Audit row example (Pattern A mother-acts-on-child):
```json
{
  "actor_user_id": "<mother's auth.users.id>",
  "actor_kind": "user",
  "action": "PCR_CREATED",
  "entity_type": "patient_clinic_records",
  "entity_id": "<child's PCR id>",
  "metadata": {
    "global_patient_id": "<child's gp.id>",
    "acting_as": "guardian_of_minor"
  }
}
```

Both compose with existing audit consumers without schema disruption. The `resolved_global_patient_id` GENERATED column correctly picks up the subject in both cases. Audit queries that filter by "actions on this person's records" use `WHERE resolved_global_patient_id = X` and pick up rows where the actor is anyone (self, guardian, delegate) — no query changes needed.

### 3.3 — Authority interaction with RLS

Current state (mig 093):
- `global_patients` SELECT policy: `claimed_user_id = auth.uid()` OR clinic-membership-via-PCR. (Lines 75–82.)
- `global_patients` UPDATE: `claimed_user_id = auth.uid()` (lines 95–96).
- `patient_clinic_records` SELECT: clinic membership OR `claimed_user_id = auth.uid()` on parent gp.
- `patient_data_shares` SELECT/INSERT: clinic-side OR `claimed_user_id = auth.uid()` on parent gp.

The minimal-disruption RLS edit pattern (matching the Build 05 / Prompt 6 PERMISSIVE-OR coexistence per memory `project_rls_rewrite_status.md`): **add a third OR clause** to the patient-side leg of each policy that already has a `claimed_user_id = auth.uid()` check. The new clause invokes the helper:

```sql
-- Old:
USING (claimed_user_id = auth.uid())
-- New:
USING (
  claimed_user_id = auth.uid()
  OR public.is_authorized_actor_on(id, auth.uid())
)
```

The helper itself — `is_authorized_actor_on` — must be **INVOKER** (per D-064 hybrid mode rationale): it must see the caller's `auth.uid()` and the rows that caller would otherwise see, and crucially it must NOT bypass RLS on its lookup tables. Reading `global_patients.guardian_global_patient_id` is safe under INVOKER as long as the caller already passes the existing self-claim or clinic-membership checks on the parent gp; for minors this is delicate (the parent's gp must be readable to the parent — true under self-claim) and for delegation the lookup is on `patient_delegations` which itself needs an RLS policy: "the principal can see delegations on themselves; the delegate can see delegations on the principal where they are the named delegate."

**Caveat — recursion risk:** `is_authorized_actor_on` invoked inside an RLS policy on `global_patients` must NOT itself read `global_patients` under RLS, or it recurses. The helper queries `global_patients` for the parent-link check. Two safe patterns:
- **(a) Mark the helper SECURITY DEFINER** with a tight `SECURITY DEFINER SET search_path` and a hand-rolled access check inside (the existing `can_clinic_access_global_patient` is the precedent — D-064 helper #2 INVOKER for cross-clinic; helper #1 was DEFINER for similar recursion reasons).
- **(b) Implement the helper in two layers** — a SECURITY DEFINER inner function that reads the raw join keys (no RLS), and an INVOKER outer function that calls it. The inner function returns only a boolean and exposes nothing else.

Option (b) is preferred for D-064-conformance: 4 DEFINER + 1 INVOKER → 5 DEFINER + 1 INVOKER (or similar). Mo's prior decision (memory `project_prompt_06_architecture_rulings`) was "hybrid 3 INVOKER + 1 DEFINER helper"; introducing a fourth DEFINER is a reasonable extension consistent with that ruling.

### 3.4 — Authority check function signature

```sql
-- Public-facing INVOKER wrapper.
CREATE OR REPLACE FUNCTION public.is_authorized_actor_on(
  p_global_patient_id uuid,
  p_user_id uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_global_patient_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public._is_authorized_actor_on_internal(p_global_patient_id, p_user_id);
END;
$$;

-- Private DEFINER inner helper (reads raw join keys, no RLS).
CREATE OR REPLACE FUNCTION public._is_authorized_actor_on_internal(
  p_global_patient_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_self        BOOLEAN;
  v_guardian    BOOLEAN;
  v_delegated   BOOLEAN;
BEGIN
  -- (1) self-claim
  SELECT (claimed_user_id = p_user_id)
    INTO v_self
    FROM public.global_patients
   WHERE id = p_global_patient_id;
  IF v_self THEN RETURN TRUE; END IF;

  -- (2) guardian-link (Pattern A): the parent gp's claimed_user_id matches.
  SELECT EXISTS (
    SELECT 1
      FROM public.global_patients child
      JOIN public.global_patients parent
        ON parent.id = child.guardian_global_patient_id
     WHERE child.id = p_global_patient_id
       AND parent.claimed_user_id = p_user_id
  ) INTO v_guardian;
  IF v_guardian THEN RETURN TRUE; END IF;

  -- (3) active delegation (Pattern B).
  SELECT EXISTS (
    SELECT 1
      FROM public.patient_delegations d
     WHERE d.principal_global_patient_id = p_global_patient_id
       AND d.delegate_user_id = p_user_id
       AND d.revoked_at IS NULL
       AND (d.expires_at IS NULL OR d.expires_at > NOW())
  ) INTO v_delegated;
  RETURN v_delegated;
END;
$$;

REVOKE ALL ON FUNCTION public._is_authorized_actor_on_internal FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_authorized_actor_on_internal TO postgres;
GRANT EXECUTE ON FUNCTION public.is_authorized_actor_on TO authenticated, anon;
```

**Invocation surfaces:**
- **RLS policies:** `OR public.is_authorized_actor_on(<col>, auth.uid())` — pattern shown in §3.3.
- **API handlers:** new shared helper `requireAuthorityOver(globalPatientId: string): Promise<{userId: string; basis: AuthorityBasis}>`. Wraps `requireApiRole('patient')` and then SELECTs the helper. Throws 403 on FALSE.
- **Server components:** thin async wrapper around the API helper.
- **Audit emission:** `emitPatientAuditWithAuthority({...})` — wraps existing audit emitters and populates `metadata.acting_as` and `metadata.authority_grant_id` from the basis lookup.

### 3.5 — Authority lifecycle

| Event | Pattern | Audit signature |
|-------|---------|-----------------|
| Guardian link created (parent registers child) | A | `GUARDIAN_LINK_CREATED`, actor=parent, subject=child gp, `metadata.guardian_global_patient_id = parent.id` |
| Guardian link transferred (e.g., custody change) | A | `GUARDIAN_LINK_TRANSFERRED`, actor=staff or court, subject=child gp, metadata records old + new guardian. Mo-ruling required (Section 8.6). |
| Guardian link severed (child reaches majority) | A | `GUARDIAN_LINK_GRADUATED`, actor=system (cron) or staff, subject=child gp. After this, child gp has its own `claimed_user_id` (or remains unclaimed). |
| Delegation granted | B | `DELEGATION_GRANTED`, actor=principal, subject=principal gp, `metadata.delegate_user_id`, `metadata.capabilities`, `metadata.expires_at` |
| Delegation accepted | B | `DELEGATION_ACCEPTED`, actor=delegate, subject=principal gp, `metadata.delegation_id` |
| Delegation revoked (by principal) | B | `DELEGATION_REVOKED`, actor=principal, `metadata.delegation_id`, `metadata.reason` |
| Delegation withdrawn (by delegate) | B | `DELEGATION_WITHDRAWN`, actor=delegate, `metadata.delegation_id`, `metadata.reason` |
| Delegation expired | B | `DELEGATION_EXPIRED`, actor=system, `metadata.delegation_id` |

Each emits a single audit row, transactional with the underlying state change, per D-062.

### 3.6 — Recovery model when authority is contested

Two contested scenarios surface (more in Section 8):

**(i) Disputed custody of a minor's records (e.g., divorced parents).** Two competing claims to be the child's guardian. Resolution path: clinic-side staff role with a `MAJOR_OPERATION` audit action `GUARDIAN_LINK_TRANSFERRED`. The transfer requires either (a) both prior + new guardian to acknowledge, OR (b) a clinic-supervisor override gated behind a separate audit row with reason text. **Mo ruling required (Section 8.6).** No automated resolution.

**(ii) Adult principal disputes a delegation grant they didn't authorize.** This should be impossible if the grant flow requires principal to initiate (POST `/delegations` with principal's own auth.uid). However a flaw — e.g., principal granted under duress and now disputes — surfaces post-hoc. Resolution: principal revokes; revocation is immediate; past audit rows remain. If the principal cannot reach their account (lost phone), the recovery story is the same as any locked-account recovery (D-077 if it exists, otherwise clinic-mediated identity proof). The delegation revocation path adds nothing new to recovery — it just compounds the existing recovery problem.

---

## Section 4 — Schema design: Pattern A (child linkage)

### 4.1 — Where the child's `global_patients` row lives

A child has a `global_patients` row, same table as adults. The differentiating fields:
- `claimed_user_id IS NULL` (child has no auth.users of their own).
- `claimed = FALSE`.
- New column `guardian_global_patient_id uuid REFERENCES global_patients(id) ON DELETE SET NULL` — non-NULL.
- New column `is_minor BOOLEAN NOT NULL DEFAULT FALSE` — TRUE when guardian linkage is the basis of authority. Distinguishes "linked but adult" (a hypothetical edge case Mo may not allow) from "linked because minor."

A child's `normalized_phone` is **NULL** (no own phone) OR **the parent's normalized_phone with a discriminator**. Two options surface:

- **Option 4.1.a — NULL phone for minors.** Drops the `normalized_phone NOT NULL` constraint on `global_patients` for `is_minor = TRUE` rows; keeps the partial unique index on `(normalized_phone) WHERE normalized_phone IS NOT NULL`. Quarantine path (mig 076) already accommodates NULL normalized_phone for the "sentinel" account_status = locked rows; the precedent is established.
- **Option 4.1.b — Synthetic phone with discriminator** (e.g., `+201XXXXXXXXX#child001`). Preserves NOT NULL but pollutes the phone column with non-phone values and breaks SMS dispatch (which would have to filter them out).

**Recommendation:** Option 4.1.a. The schema already supports NULL normalized_phone via the quarantine path; minor rows are conceptually similar (no own contact channel, contact via parent). NOT NULL was intentional for adult phones but should be relaxed for minors.

**Mo-ruling not required for this; recommendation is straightforward.**

### 4.2 — How the parent-child link is captured

Single column on `global_patients`:

```sql
ALTER TABLE public.global_patients
  ADD COLUMN guardian_global_patient_id uuid
    REFERENCES public.global_patients(id) ON DELETE SET NULL,
  ADD COLUMN is_minor BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX global_patients_guardian_idx
  ON public.global_patients(guardian_global_patient_id)
  WHERE guardian_global_patient_id IS NOT NULL;

ALTER TABLE public.global_patients
  ADD CONSTRAINT global_patients_minor_requires_guardian CHECK (
    is_minor = FALSE OR guardian_global_patient_id IS NOT NULL
  );

ALTER TABLE public.global_patients
  ADD CONSTRAINT global_patients_minor_no_own_claim CHECK (
    is_minor = FALSE OR claimed_user_id IS NULL
  );
```

The `ON DELETE SET NULL` matches the legacy `patients.guardian_id` precedent (mig 030) so the child's row survives parent deletion (becomes an orphan; clinic recovers via re-linkage flow).

The two CHECK constraints lock the invariants: a minor MUST have a guardian; a minor MUST NOT self-claim.

### 4.3 — Effect on existing tables

**`patient_clinic_records`.** A minor's PCR row is keyed by `(child_gp.id, clinic_id)` exactly like an adult's. Clinic ownership is unchanged. The clinic-app listing surfaces the child by name with a "dependent of <parent>" subtitle (already done on legacy via `guardian_name` field — Section 7). No schema change to PCR.

**`patient_data_shares`.** A minor's shares are between clinics, same as adults. The grantor of a minor's share is the clinic (Clinic A); the actor at grant time is **the parent** (whose phone+auth.uid drives the privacy-code flow). The `metadata.acting_as = guardian_of_minor` records that the share was granted by the parent on the child's behalf. **Mo-ruling required (Section 8.2):** is a minor's record visible to other clinics via D-068 sharing identically to an adult's, or is there special handling?

**`audit_events`.** Subject-derivation already works via the GENERATED `resolved_global_patient_id` — no change. Actor is the parent's `auth.uid()`. New metadata keys `acting_as` and `authority_grant_id` are added (no schema change; metadata is jsonb).

**`messaging-consent` (mig 088 + view in mig 083).** Minors do not consent themselves. The parent's consent on behalf of the minor is recorded by writing `consent_to_messaging = TRUE` on the minor's PCR row, with audit row `actor_user_id = parent`, `metadata.acting_as = guardian_of_minor`, `entity_id = <child PCR id>`. The view derives effective consent from the PCR row regardless of who set it. **Mo-ruling required (Section 8.3):** when the minor reaches an intermediate age (e.g., 14), can they grant or revoke their own messaging consent independent of guardian?

### 4.4 — Data integrity rules

- Child must have parent: enforced by `global_patients_minor_requires_guardian` CHECK.
- Parent's account deletion: `ON DELETE SET NULL` on `guardian_global_patient_id`. Triggers a follow-up flow (clinic prompted to re-link). Audit row `GUARDIAN_LINK_LOST` emitted by trigger.
- Child reaches majority: not automatic. A scheduled job + clinic / patient-app prompt drives the graduation flow; Section 6 details.
- Child accidentally registered as adult (phone given, treated as standalone): correctable via a `MERGE` — existing identity-merge mechanisms (mig 073/075 Build 02 dedup pipeline) should accept "merge child gp into existing adult gp" as a special case, or vice versa. **Tooling work — flag in Section 9 build sequence.**
- Multiple minors per guardian: 1:N from `guardian_global_patient_id`; no explicit max cap. Frontdesk + patient-app UI should warn at e.g. 10 to discourage misuse, but no DB constraint.

### 4.5 — RLS policy implications

Each existing patient-side RLS predicate of the form `claimed_user_id = auth.uid()` becomes:

```sql
USING (
  claimed_user_id = auth.uid()
  OR public.is_authorized_actor_on(id, auth.uid())
)
```

For tables that reference `global_patient_id` (PCR, patient_data_shares, clinical-domain tables via mig 080), the analogous shape:

```sql
USING (
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_clinic_records.global_patient_id
      AND (gp.claimed_user_id = auth.uid()
           OR public.is_authorized_actor_on(gp.id, auth.uid()))
  )
)
```

The helper internally checks self-claim, guardian-link, and delegation; from RLS's perspective the OR collapses to a single helper call. Mig 092 helper functions absorb this.

Audit row reads: existing patient-side audit RLS (if any) keys off `resolved_global_patient_id`; same OR-extension applies.

**Recursion safety:** as noted in §3.3, the helper's inner DEFINER reads `global_patients` without RLS to avoid recursion on the outer policy.

**RLS test matrix expansion:** the existing 177 scenarios (mig 108-era) are all built around 3 archetypes (self / clinic-staff / cross-clinic). B07 adds 2 archetypes (parent-of-minor / adult-delegate) × the existing matrix axes. Estimated +50–80 scenarios. Section 9 details.

---

## Section 5 — Schema design: Pattern B (adult delegation)

### 5.1 — Capturing the delegation

```sql
CREATE TABLE IF NOT EXISTS public.patient_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The principal (subject of the delegation): the gp whose records / consent is being delegated.
  principal_global_patient_id uuid NOT NULL
    REFERENCES public.global_patients(id) ON DELETE RESTRICT,

  -- The delegate (actor): an auth.users that has been authorized.
  -- Note: the delegate's own gp is not required by this schema (a delegate
  -- could in principle be a non-patient family member with only an auth.users
  -- account). In practice the patient-app onboarding requires gp creation
  -- before allowing delegation — so the delegate's gp exists. Captured as a
  -- denormalized convenience column for UI ergonomics:
  delegate_user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  delegate_global_patient_id uuid
    REFERENCES public.global_patients(id) ON DELETE SET NULL,

  -- Capability scope. JSONB array of capability tokens. Free-form for now;
  -- the application enforces (eslint-locked literal-union pattern à la D-008
  -- admin-scope discipline). Empty array == no capabilities (revoked or pending).
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle.
  granted_at timestamptz NOT NULL DEFAULT NOW(),
  granted_by_user_id uuid NOT NULL  -- usually = principal's claimed_user_id
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_at timestamptz,           -- delegate must accept; until then capabilities are inactive
  expires_at timestamptz,            -- NULL = no expiry
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES auth.users(id),
  revoke_reason text,

  -- Auto-renew on use? Mirrors D-068's auto-renew-on-visit behavior.
  auto_renew boolean NOT NULL DEFAULT FALSE,
  auto_renew_window_days integer,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  -- An active delegation is unique on (principal, delegate). A delegate
  -- cannot have two simultaneous active grants for the same principal.
  CONSTRAINT patient_delegations_active_unique
    EXCLUDE USING gist (
      principal_global_patient_id WITH =,
      delegate_user_id WITH =
    ) WHERE (revoked_at IS NULL),

  CONSTRAINT patient_delegations_principal_not_self CHECK (
    -- A delegate cannot be the principal themselves (would be self-claim, not delegation).
    delegate_global_patient_id IS NULL
    OR delegate_global_patient_id <> principal_global_patient_id
  ),

  CONSTRAINT patient_delegations_revoke_consistency CHECK (
    (revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
  )
);

CREATE INDEX patient_delegations_principal_active_idx
  ON public.patient_delegations (principal_global_patient_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX patient_delegations_delegate_active_idx
  ON public.patient_delegations (delegate_user_id, expires_at)
  WHERE revoked_at IS NULL;
```

Note: the EXCLUDE USING gist requires `btree_gist`. If unavailable, fall back to a partial unique index `(principal_global_patient_id, delegate_user_id) WHERE revoked_at IS NULL`.

### 5.2 — Capability scope: blanket vs. capability-scoped

**Recommendation: capability-scoped.** Blanket "act as principal" is too coarse; if the son later loses his phone, the recovery costs are catastrophic. Capability tokens (string literals, eslint-locked à la `ALLOWED_ADMIN_SCOPES` discipline per D-008 amendment 2026-05-09):

| Capability | Effect |
|------------|--------|
| `view_records` | Read principal's clinical history (records, prescriptions, vitals, labs) |
| `consent_to_share` | Initiate `SHARE_GRANTED` actions on principal's behalf at clinic check-in |
| `consent_to_messaging` | Toggle `consent_to_messaging` on principal's PCRs |
| `book_appointments` | Book / reschedule on principal's behalf |
| `receive_notifications` | SMS dispatch CCs the delegate's phone in addition to the principal's |
| `manage_medications` | Mark medications taken / refill request on principal's behalf |

A grant lists 0–N capabilities. Empty list = grant pending (delegate has accepted but principal has not yet authorized any action). Recommended initial-grant default: `['view_records', 'receive_notifications']` (lowest-power useful default).

**Mo-ruling required (Section 8.4):** what is the MVP capability set? Recommend `view_records + consent_to_messaging + receive_notifications`; `consent_to_share` and `book_appointments` deferred to post-MVP unless Mo's two-case scenario explicitly needs them.

### 5.3 — Mutual consent

**Two-step grant flow:** principal POSTs the grant (POST `/api/patient/delegations`); delegate must accept (PATCH `/api/patient/delegations/<id>/accept`). A grant with `accepted_at IS NULL` is **inactive** (capabilities not enforced by `is_authorized_actor_on`). This prevents principal from unilaterally claiming someone else as their delegate without their knowledge.

The accept step requires the delegate to be authenticated as `delegate_user_id`. Notification path: at grant time, an SMS is dispatched to the delegate's `auth.users.phone` with a deep-link to the patient-app accept-flow.

### 5.4 — Time-bounded delegation

`expires_at` nullable: NULL = no expiry; default value at grant time = `NOW() + interval '1 year'` (Egyptian context — adult caregiving relationships are often long-term but still benefit from a renewal cadence).

`auto_renew = TRUE` extends `expires_at` to `NOW() + auto_renew_window_days` whenever a capability is exercised — same pattern as D-068's auto-renew-on-visit.

The daily Vercel cron (already present per D-068's `expire-stale-shares`) gains a sibling cron `expire-stale-delegations` that emits `DELEGATION_EXPIRED` audit rows and SMS-notifies both parties.

### 5.5 — Multi-delegate scenarios

Multiple children of an elderly parent: principal can grant N delegations. The EXCLUDE constraint enforces uniqueness on `(principal, delegate)` for active rows, so each child gets one grant. Different capability sets per child are allowed (e.g., elder son has `consent_to_share`, daughter has `view_records` only).

### 5.6 — Conflict resolution between delegates

Two delegates could exercise conflicting capabilities (delegate A schedules an appointment, delegate B cancels it). Today's clinic-app appointment system enforces last-write-wins with audit-row trail; no special handling needed beyond audit visibility. Principal can revoke either grant if they observe conflict.

### 5.7 — Per-event audit signature

Each action exercising a delegation:
1. Resolves the active grant via `is_authorized_actor_on(...)`.
2. Records `metadata.acting_as = 'delegated_by_principal'` and `metadata.authority_grant_id = <delegation.id>` on the action's audit row.
3. Optionally dispatches an SMS to the principal ("[delegate name] just [action] on your behalf") — recommended for `consent_to_share` and `book_appointments`; configurable per-capability.

The principal can review every action ever taken on their behalf via a patient-app "Activity by my caregivers" view (Section 7), which is a pure audit-row query: `SELECT * FROM audit_events WHERE resolved_global_patient_id = <principal.gp.id> AND metadata->>'acting_as' = 'delegated_by_principal' ORDER BY created_at DESC`.

---

## Section 6 — Identity graduation (dependent → independent)

### 6.1 — When does the child get auth.users?

**Recommendation: at the moment they obtain their own phone number, regardless of age.** A 14-year-old with a phone who wants to manage their own appointments should not be blocked. The age is a soft prompt (the patient-app UX suggests graduation at 18); the trigger is having a phone of their own.

Mechanically: the patient-app onboarding flow detects a phone-based registration whose phone matches no existing gp, BUT for whom an existing minor gp exists with that phone as the parent's. Currently no such matching exists — the phone field is parent's-phone-only on minor rows and there's no way to indicate "actually this phone is now mine." A new field `intended_minor_phone` or a flag `phone_is_own_now` would mediate.

**Mo-ruling required (Section 8.0):** is graduation MVP, or post-MVP?

**Recommendation: defer.** Graduation introduces complex audit-rewrite questions (does the parent's audit history get re-attributed? Section 6.2 unpacks). MVP can ship with: register child → operate on child via parent → defer graduation indefinitely. When Mo wants to ship graduation, that's a focused workstream.

### 6.2 — Re-attribution of historical audit rows

Two options:

- **Option 6.2.a — Preserve history immutable.** Pre-graduation audit rows continue to show `actor_user_id = parent`, `acting_as = guardian_of_minor`. Post-graduation rows show `actor_user_id = child` with no `acting_as`. The child can read both (as the now-claimed user of their gp); the audit display in the patient app shows a visual divider at graduation date.
- **Option 6.2.b — Rewrite ownership.** Update audit rows to `actor_user_id = child` retroactively. Conceptually wrong (the parent did take those actions; the child didn't); also violates audit-immutability principles (D-062 sync-transactional + immutable).

**Recommendation: Option 6.2.a (immutable history).** Audit rows are an immutable record of who did what when; rewriting them is a falsification.

### 6.3 — Edge case: child gets phone at 14 mid-care

Child has been a minor gp linked to parent for 8 years; clinical history exists. At 14 child gets a phone and patient-app account. Two paths:

- **(a) Two gps temporarily, then merge at graduation.** Child registers with own phone → new gp created with `claimed_user_id = child.auth.uid`. The existing minor gp remains linked to parent. Clinical records continue to write to the minor gp (clinic-side flows reference it). At graduation, a `MERGE` operation collapses the two gps; the clinical records re-point to the merged gp. **Mo-ruling required (Section 8.7) — when can the parent stop being the consent gate?**

- **(b) One gp with progressive ownership.** The minor gp's `claimed_user_id` updates to point to the child's auth.users; `is_minor` flips to FALSE; `guardian_global_patient_id` is preserved (read-only history pointer). Until then, the parent retains authority via `is_authorized_actor_on`'s guardian-link branch.

**Recommendation: (b).** Avoids the merge complexity. The single gp is the patient throughout life. The transition is a state change on one row plus an `is_authorized_actor_on` reevaluation. Defer the patient-app side until graduation is MVP.

### 6.4 — Parent's view post-graduation

After graduation, the parent retains **read access for a transition window** (e.g., 30 days). The transition is a one-time `DELEGATION_GRANTED` from the now-adult child to the parent with capabilities `['view_records']` and `expires_at = NOW() + interval '30 days'`. The child can extend or revoke at their discretion.

**Mo-ruling required (Section 8.7):** transition-window behavior — automatic 30-day delegation, or zero-day (immediate cutoff)?

Section 6 is **DEFERRED to post-MVP** by recommendation. Pre-MVP, the dependent feature ships without graduation; minors stay minors until Mo opens the graduation workstream.

---

## Section 7 — UI/UX surfaces required

### 7.1 — Patient app

| Surface | Path | Purpose | Existing? |
|---------|------|---------|-----------|
| Account switcher (parent ↔ child) | Top-of-app dropdown / "Viewing as" | Switch active subject context | None — must build |
| Register a dependent | `apps/patient/app/(patient)/patient/dependents/register` | Mother registers child; sets minor gp + guardian link | None — must build |
| Dependent list | `apps/patient/app/(patient)/patient/dependents` | View all linked children | None |
| Dependent detail (child's records, viewed as parent) | `apps/patient/app/(patient)/patient/dependents/[id]` | Same as patient dashboard but subject = child | None |
| Delegations: outgoing (I delegate) | `apps/patient/app/(patient)/patient/delegations/granted` | Manage who can act on my behalf | None |
| Delegations: incoming (I am delegate) | `apps/patient/app/(patient)/patient/delegations/received` | Manage whose records I can act on | None |
| Accept delegation invite | `apps/patient/app/(patient)/patient/delegations/[id]/accept` | Delegate accepts a grant | None |
| Activity feed: actions by my caregivers | `apps/patient/app/(patient)/patient/activity/by-others` | Principal reviews delegate-driven audit rows | None |
| Graduation flow | `apps/patient/app/(patient)/patient/account/graduate` | Child claims own gp at majority | Deferred to post-MVP |

### 7.2 — Clinic app

| Surface | Need | Existing? |
|---------|------|-----------|
| "Patient is dependent of [name + phone]" indicator on patient detail | Required — clinic-side workflow assumes contact = parent | Partial: `guardian_name` shown in PatientSelector; not yet shown on patient-detail page in apps/clinic |
| Frontdesk register-dependent flow | Required — currently exists but writes to legacy `patients` (mig 030 era), needs to be migrated to write to `global_patients` with new columns | Partial (legacy) |
| Doctor session "patient is dependent" indicator | Required — affects prescription writing (pediatric dosing) | Read-only display today; no clinical gating |
| Frontdesk register-delegate-relationship | Optional MVP — can clinic staff initiate a delegation grant for the patient? | None; recommend deferring to patient-app flow |
| Audit visibility "this action was by [delegate] on behalf of [principal]" | Required for clinic-side audit log | Audit rows already carry the data; UI must surface |

### 7.3 — Frontdesk registration flow

Two paths:

- **Path 1 (existing, legacy): walk-in + adult.** Phone-based registration. No change.
- **Path 2 (existing, legacy): walk-in + dependent.** Toggle is_dependent + parent_phone + optional guardian search. **Migrate to new schema:** create minor gp + guardian gp link instead of legacy patients row.

Frontdesk + doctor session forms must remain backward-compatible during the v2 cutover; the existing UI is the entry point and will carry through. The data layer changes underneath.

### 7.4 — Doctor session

Already surfaces dependent-type subtype (`child | elderly | special`) per `SessionForm.tsx` line 235. **For B07: add prescription-writing safeguards** — when `is_minor = TRUE` (or dependent-type = `child`), the prescription form should:
- Suggest pediatric dosing for known meds (existing `drug-interactions.ts` has age-aware metadata for some interactions; expand).
- Block adult-only drugs with a confirmation modal if doctor overrides.
- Display patient age prominently.

This is more of a clinical-safety workstream than identity-architecture, but B07 is the natural pairing. **Mo-ruling required (Section 8 — does pediatric dosing belong in B07 or a separate workstream?)**.

---

## Section 8 — Edge cases and decisions for Mo's ruling

### 8.0 — Is graduation in MVP?

Options: (a) MVP includes graduation; (b) MVP excludes graduation, defers to post-MVP; (c) MVP includes graduation as one-way (minor → adult) with no automatic backward compatibility.

**Recommendation: (b).** Graduation is a non-trivial product flow with audit-rewrite, transition-window, and consent-handover questions. Pre-MVP, every minor stays a minor.

### 8.1 — `global_patients.normalized_phone` for minors: NULL or synthetic?

Options: (a) NULL — relax NOT NULL constraint for minors only; (b) synthetic discriminator on parent's phone; (c) require minor phone at registration but allow it to be parent's (with a flag).

**Recommendation: (a)** per §4.1. Quarantine path precedent.

### 8.2 — Are minors' records visible via D-068 cross-clinic sharing identically to adults'?

Options: (a) yes — same flow, parent grants on behalf; (b) no — minor records are clinic-only until 18; (c) yes but with extra audit row + SMS to parent on every share.

**Recommendation: (a)** with parent acting via `acting_as = guardian_of_minor`. Egyptian healthcare has the same cross-clinic patterns for children (pediatrician → specialist referral) as adults; restricting would create a UX cliff. **Mo-ruling required.**

### 8.3 — Messaging consent for minors

Options: (a) parent consents; consent stays parent-driven until graduation; (b) parent consents until age 14, then minor can override parent; (c) minors get no messaging — clinic dispatches all messages to parent's phone.

**Recommendation: (c) for MVP.** Simplest: minor's messaging consent is irrelevant because dispatch always goes to parent's phone. Defer the "minor takes over consent at 14" question to post-MVP. **Mo-ruling required.**

### 8.4 — MVP capability set for delegations

Options listed in §5.2. **Recommendation:** `view_records + consent_to_messaging + receive_notifications` for MVP. `consent_to_share` and `book_appointments` post-MVP. Mo's stated case A2 (son manages father's appointments and prescriptions) implies `book_appointments` and `manage_medications` need to be MVP after all. **Mo-ruling required.**

### 8.5 — Audit retention for graduated dependents

Options: (a) preserve full history immutable, attached to the (now-adult) gp; (b) partition into pre/post-graduation, label the divider; (c) drop pre-graduation rows (PROHIBITED — falsifies record).

**Recommendation: (a) with (b)'s visual divider in the patient-app activity feed.**

### 8.6 — Disputed custody / contested guardian transfer

Options: (a) clinic-supervisor override gated behind `MAJOR_OPERATION` audit row (requires reason); (b) two-party acknowledgment (both old + new guardian must accept); (c) court-order import via clinic-staff role with attached document.

**Recommendation: (a) for MVP**, knowing that real custody disputes need clinic-side staff involvement and can't be self-served. (c) is post-MVP. **Mo-ruling required.**

### 8.7 — Polygamous household (multiple wives, single husband phone)

Options: (a) Pattern A — each wife's children link to the husband's gp as guardian; husband is sole authority; (b) Pattern A on father's side + Pattern B (delegation) so each mother is a delegate on her own children's records; (c) explicit multi-guardian schema (`guardian_global_patient_ids uuid[]` array column).

**Recommendation: (b).** Pattern A names the legal guardian (typically father in this context); Pattern B captures the operational caregiver (typically mother). Two-mechanism handling is more honest than fudging multi-guardian onto Pattern A. **Mo-ruling required — this is a culture-laden decision.**

### 8.8 — Authentication recovery: parent loses phone

If the parent's auth.users.phone is lost / deactivated, the parent's gp is unrecoverable until they re-prove identity. **The minor's records are orphaned during that window** because no auth.uid passes the guardian-link check.

Options: (a) clinic-staff temporary override (with audit + reason); (b) any other adult with `is_authorized_actor_on` (e.g., a delegate of the parent) can also act on the parent's minor; (c) a "backup guardian" per minor (second `guardian_global_patient_id_alt` column).

**Recommendation: (b)** because it composes with existing primitives — the parent grants a delegation to a backup adult (e.g., spouse), and `is_authorized_actor_on` returns TRUE for either the parent's auth or the delegate's auth. **Mo-ruling required — does the helper recurse "delegate of guardian" naturally, or only direct guardian?**

This is a subtle architectural question: should `is_authorized_actor_on` chain through guardian → guardian's-delegations? If yes, the helper becomes recursive and slower. If no, the recovery path requires explicit "backup guardian" semantics.

**Recommendation: chain. The helper UNIONs: self ∪ guardian-self ∪ guardian-delegation ∪ self-delegation.** Two SQL EXISTS clauses suffice without true recursion (max depth = 2).

### 8.9 — Pharmacy / lab integration (B09 future)

When B09 ships, fulfillment (pickup, dispense) needs an authorization model. A child with no auth.users cannot show up at a pharmacy with their own credential. Options: (a) the parent shows credential and is authorized via `consent_to_pickup` capability on a delegation OR the guardian-link; (b) any-adult-with-prescription-PIN model (out of scope here); (c) clinic-issued pickup token tied to a specific delegate.

**Recommendation: defer fully to B09 design phase.** The authority-check helper is the right foundation; capabilities will extend to include pickup / dispense actions.

### 8.10 — Fraud: a malicious actor registers themselves as a fake child to game the system

Risk: actor A registers a fake "minor child" with their own care so they can double-bill or stack consent. Mitigation: (a) clinic-side staff confirm the dependent at first visit (existing flow already requires staff to type the parent's phone and confirm); (b) audit + flag if a single auth.uid registers >N minors; (c) require clinic-side validation step before a minor gp can be claimed-by-extension.

**Recommendation: (a) + (b).** Existing flows suffice; add a soft cap with audit-flag at N=10 minors per single auth.uid.

---

## Section 9 — Build sequence proposal

Phasing follows the Build 02 / 03 / 04 / 05 pattern with explicit pre-flight + per-layer + sign-off:

### Phase A — pre-flight inventory + schema spec
**Deliverable:** the document you are reading + Mo's rulings on Section 8 questions consolidated into a `B07-spec.md`.
**Estimated:** 1 cowork session (this review) + 1 session for spec consolidation post-rulings.
**Already done:** this review.

### Phase B — schema migrations
**Deliverable:** mig 109 (`global_patients.guardian_global_patient_id` + `is_minor` + CHECK constraints + relax `normalized_phone` NOT NULL); mig 110 (`patient_delegations` table); mig 111 (audit-action label additions: GUARDIAN_LINK_*, DELEGATION_*).
**Estimated:** 1 session (3 migs at B02-B05 pace).
**Dependencies:** Phase A spec.
**New work / existing:** all new — no existing migrations to extend.

### Phase C — data layer (`packages/shared/lib/data/`)
**Deliverable:** `dependents.ts` (create-minor-gp, list-by-guardian, transfer-guardian); `delegations.ts` (grant, accept, revoke, list-active, expire-stale); extend `global-patients.ts` to surface guardian and minor flags; extend `audit.ts` to emit with `acting_as` / `authority_grant_id` keys.
**Estimated:** 1–2 sessions.
**New work / existing:** new files; small extensions to global-patients.ts and audit.ts.

### Phase D — RLS policies + authority check function
**Deliverable:** mig 112 (`is_authorized_actor_on` + inner DEFINER helper); mig 113–115 (extend mig 093/094/095/096 patient-side policies with `OR is_authorized_actor_on(...)` per the §4.5 pattern).
**Estimated:** 1 session.
**Dependencies:** Phase B.
**Risk:** RLS recursion (mitigated via DEFINER inner helper per §3.3); mig 094a precedent shows this is operationally tractable.

### Phase E — API handlers
**Deliverable:** `requireAuthorityOver(globalPatientId)` shared helper (`packages/shared/lib/auth/authority.ts`); new endpoints `POST /api/patient/dependents/register`, `GET /api/patient/dependents`, `POST /api/patient/delegations`, `PATCH /api/patient/delegations/[id]/accept|revoke`, `GET /api/patient/delegations/granted|received`. Migration of existing `/api/patients/onboard` to write minor gps via Phase C data layer when `isDependent=true`.
**Estimated:** 1–2 sessions.
**Dependencies:** Phase C, D.

### Phase F — UI components (patient app)
**Deliverable:** `apps/patient/app/(patient)/patient/dependents/*` routes, `apps/patient/app/(patient)/patient/delegations/*` routes, account-switcher component, dependent-detail page (reuses dashboard with `subjectGpId` prop).
**Estimated:** 2–3 sessions (largest UI surface; most novel for this app).
**Dependencies:** Phase E.

### Phase G — UI components (clinic app)
**Deliverable:** patient-detail "dependent of [name]" indicator (extend existing `guardian_name` surfacing); doctor-session pediatric-dosing safeguards (paired clinical workstream — may split out); frontdesk dependent flow migration to v2 schema (no UX change, data-layer change underneath).
**Estimated:** 1–2 sessions.
**Dependencies:** Phase E.

### Phase H — RLS test matrix expansion
**Deliverable:** add archetypes `parent_of_minor` + `adult_delegate` to `rls_test_*` fixtures; extend the 177-scenario matrix (per mig 108-era smoke probe) to ~230–250 scenarios; run `run_no = 2.x` against staging.
**Estimated:** 1 session.
**Dependencies:** Phase D.

### Phase I — integration testing
**Deliverable:** end-to-end smoke through the two scenarios Mo named: (A1) mother registers 6-year-old, books appointment, consents to share at second clinic, receives audit row; (A2) son grants delegation, accepts, schedules father's appointment, audit row visible to father in patient-app activity feed.
**Estimated:** 1 session.

### Phase J — sign-off
**Deliverable:** STATE_OF_WORK + PROGRAM_STATE + DECISIONS_LOG (D-NNN entries) + Build 07 results doc, paralleling B05 closure pattern.
**Estimated:** 0.5 session.

**Total estimated effort:** ~10–13 sessions, in the 4–6 week range at Mo's working cadence (2–3 sessions/week from B02–B05 evidence). Risk-adjusted: 6–8 weeks.

**Dependencies on other workstreams:** none blocking. Pairs naturally with Prompt 6.5 (legacy `patients` cleanup) — Phase B's minor-gp creation should land before Prompt 6.5 drops legacy `patient_id` columns.

**Risks:**
- RLS recursion in `is_authorized_actor_on` (mitigated via DEFINER inner helper).
- Backfill of 3 live legacy dependents into v2 schema (small N; one-off migration job).
- UI complexity in patient app (account switcher pattern is novel for this app).
- Graduation-flow questions left unresolved if Mo defers; B07 ships incomplete by design.

---

## Section 10 — Critical gaps / open questions for Mo

Numbered list. Each requires Mo's ruling before B07 build can kick off.

1. **§8.0 — Is graduation in MVP?** Recommendation: defer post-MVP. **Decision needed.**
2. **§8.2 — Are minors' records cross-clinic-shareable identically to adults' under D-068?** Recommendation: yes, parent acts as `acting_as = guardian_of_minor`. **Decision needed.**
3. **§8.3 — Messaging consent for minors:** parent-driven, age-tiered, or clinic-routes-to-parent-phone-always? Recommendation: clinic-routes-to-parent for MVP. **Decision needed.**
4. **§8.4 — MVP capability set for delegations.** Mo's case A2 (son manages father's appointments + prescriptions) implies `book_appointments` and `manage_medications` are MVP. Recommendation: include those. **Decision needed.**
5. **§8.6 — Disputed custody / guardian transfer:** clinic-supervisor override or two-party acknowledgment for MVP? Recommendation: clinic-supervisor override with `MAJOR_OPERATION` audit. **Decision needed.**
6. **§8.7 — Polygamous-household pattern:** Pattern A only or Pattern A + Pattern B? Recommendation: Pattern A names guardian, Pattern B captures operational caregiver(s). **Decision needed; culturally sensitive.**
7. **§8.8 — Authentication recovery and `is_authorized_actor_on` recursion through guardian's-delegations:** chain or no-chain? Recommendation: chain (max depth 2). **Decision needed.**
8. **§7.4 — Pediatric dosing safeguards:** part of B07 or separate clinical-safety workstream? Recommendation: separate workstream paired with B07's UI — surface the `is_minor` flag in B07; safeguards in B08 or sibling. **Decision needed.**
9. **§3.3 — Helper architecture: 5 DEFINER + 1 INVOKER (extending D-064 ruling) or some other shape?** Recommendation: extend, with the new helper following the same INVOKER-wrapper / DEFINER-inner pattern. **Decision needed.**
10. **Backfill plan for 3 live legacy dependents.** They're on the legacy `patients` table with `guardian_id`. Phase B mig must create v2 minor gps + transfer the `guardian_global_patient_id` link from `guardian_id`. **Decision needed:** keep legacy rows for compat triggers (mig 081) until Prompt 6.5, or remove immediately?

---

## Closing

This document is the architectural foundation for the B07 build. It does not prescribe code; it describes the empirical state of the codebase, the gap between that state and Mo's stated thesis, and an architectural approach that bridges the gap. Mo's ten rulings above unblock Phase B (schema migrations) and the rest of the B07 build sequence.

Per REVIEW_CRITERIA §3 surface format, the next surface to chat carries the executive summary, the decision-log summary, and the pre-push state for the two new docs (this one + the decisions log) plus the sympathetic STATE_OF_WORK / PROGRAM_STATE updates.
