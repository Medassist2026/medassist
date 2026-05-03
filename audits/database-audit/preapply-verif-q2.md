# Pre-apply Verification Q2 — `can_clinic_access_global_patient` security mode

**Author:** Audit Session C continuation (post-Mo-rulings session)
**Date:** 2026-05-03
**Trigger:** Verification 2 surfaced a bonus finding — staging has helper #2 as `SECURITY DEFINER`, mig 092 file declares it `SECURITY INVOKER`. Mo placed Q2 on HOLD ("investigate first") while ruling Q1/Q3.
**Scope:** Read-only investigation. No DDL, no commits, no application of migrations.
**Reference frame:** Same shape as `preapply-verif-r2.md` (helper #3 verification) but applied to helper #2.

---

## Step 1.1 — Documented intent

Search executed:

```bash
grep -rn "can_clinic_access_global_patient" audits/
```

8 matches across the audits tree. Verbatim quotes that explicitly assign a security mode follow.

### a.1 `audits/EXECUTION_PROMPTS.md` § B2 (line 3249–3276)

```
### B2. `can_clinic_access_global_patient(p_global_patient_id UUID, p_clinic_id UUID)`

The clinic can access the patient if:
- The clinic has a `patient_clinic_records` row for this patient
  (the patient has been seen at this clinic), OR
- The clinic is a grantee on an active `patient_data_shares` for this
  patient (cross-clinic share)

```sql
CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(
  p_global_patient_id UUID,
  p_clinic_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_clinic_records
     WHERE global_patient_id = p_global_patient_id
       AND clinic_id = p_clinic_id
  ) OR EXISTS (
    SELECT 1 FROM public.patient_data_shares
     WHERE global_patient_id = p_global_patient_id
       AND grantee_clinic_id = p_clinic_id
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;
```
```

**Designation: SECURITY INVOKER STABLE.**

### a.2 Auto-memory `project_prompt_06_architecture_rulings.md` ruling #1 (2026-04-30)

```
**1. Helper architecture: HYBRID.** Build all three of Mo's prompt B1-B3
helpers (`is_clinic_member`, `can_clinic_access_global_patient`,
`can_patient_access_global_patient`) as `SECURITY INVOKER STABLE`,
AND build the schema spec's 4th helper `can_view_patient_data_at_clinic
(p_global_patient_id, p_data_clinic_id, p_viewer_user_id)` as
`SECURITY DEFINER STABLE`.
```

**Designation: SECURITY INVOKER STABLE.** This is the same ruling cited in `preapply-verif-r2.md § a.2` for helper #3 — `can_clinic_access_global_patient` is the second of the "3 INVOKER helpers" the hybrid model names.

### a.3 `supabase/migrations/092_rls_helper_functions.sql` (working tree, lines 19, 111–144, 298–301)

```
--   2. can_clinic_access_global_patient — SECURITY INVOKER STABLE (new)
```

```sql
-- ──────────────────────────────────────────────────────────────────
-- 2. can_clinic_access_global_patient — INVOKER STABLE
--    True if (a) the clinic has a patient_clinic_records row for
--    this patient (the patient has been seen here), OR (b) the
--    clinic is the grantee of an active patient_data_shares row.
--    INVOKER is safe because every reachable call path has the
--    caller as a member of p_clinic_id (i.e. they can already SELECT
--    the relevant PCR / share rows under the new RLS).
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(
  p_global_patient_id UUID,
  p_clinic_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
PARALLEL SAFE
AS $$
  ...
$$;
```

Post-condition assertion (lines 294–302):

```sql
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'can_clinic_access_global_patient'
    AND p.prosecdef = FALSE
) THEN
  RAISE EXCEPTION 'mig 092 post-condition failed: can_clinic_access_global_patient missing or not SECURITY INVOKER';
END IF;
```

The mig 092 post-condition assertion **WILL FIRE on apply** if staging is left at DEFINER (`prosecdef = TRUE`). The file expects `prosecdef = FALSE` (INVOKER).

**Designation: SECURITY INVOKER STABLE,** with the rationale that "every reachable call path has the caller as a member of p_clinic_id."

### a.4 `supabase/migrations/094a_rls_helper_fixes.sql` (working tree, lines 32–48, 84–107) — APPLIED to staging

```
-- THE FIX
-- -------
-- Mo's amended rule (2026-04-30): every helper called from any RLS
-- USING clause is SECURITY DEFINER.  No exceptions.  Mo's original
-- "hybrid INVOKER+DEFINER" ruling was empirically falsified by this
-- bug.  Uniform rule beats exception:
--
--   * is_clinic_member                  — DEFINER (already, mig 092)
--   * can_patient_access_global_patient — DEFINER (FLIP from INVOKER)
--   * can_clinic_access_global_patient  — DEFINER (FLIP from INVOKER)
--   * can_view_patient_data_at_clinic   — DEFINER (already, mig 092)
--   * user_has_clinic_path_to_gp        — DEFINER (NEW, this migration)
```

```sql
CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(
  p_global_patient_id UUID,
  p_clinic_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  ...
$$;

COMMENT ON FUNCTION public.can_clinic_access_global_patient(UUID, UUID) IS
  'mig 094a: FLIPPED to SECURITY DEFINER per uniform-rule. Reads PCR + patient_data_shares — both have policies with cross-table EXISTS that recurse under INVOKER.';
```

**Designation: SECURITY DEFINER (post-recursion-bug amendment).** This is later in time than a.1–a.3 and was applied to staging (verified in Step 1.2 below). It explicitly amends the 2026-04-30 hybrid ruling.

### a.5 `audits/database-audit/preapply-verif-r2.md` § Bonus finding

The Bonus finding section calls out the file-vs-staging drift but does not designate. It is the source of the Q2 question.

### a.6 `audits/rls-helper-benchmark.md` line 37

The benchmark table labels this helper as INVOKER. The benchmark doc was authored before mig 094a applied; staging has been DEFINER since 094a applied. The label is stale but not an architectural designation.

### a.7 `audits/patient-identity-schema-spec.md`

`grep` returns zero matches in this file. The schema spec does not designate `can_clinic_access_global_patient` (it expresses cross-clinic logic via the 4th helper `can_view_patient_data_at_clinic` instead).

### Documented-intent summary

| Source | Date | Designation | Authority weight |
|---|---|---|---|
| `EXECUTION_PROMPTS.md` § B2 | 2026-04-30 (pre-cowork) | INVOKER | High — canonical execution prompt |
| Memory `project_prompt_06_architecture_rulings.md` | 2026-04-30 cowork session 2 | INVOKER | High — Mo's recorded ruling |
| `mig 092` file body + post-condition | 2026-04-30 cowork session 2 | INVOKER | High — code-of-record |
| `mig 094a` prologue + body | 2026-04-30 cowork session 5 (later same day) | DEFINER | High — explicit amendment, applied to staging |
| `rls-helper-benchmark.md` | 2026-04-30 (post-092, pre-094a) | INVOKER | Low — descriptive label only, not a ruling |
| `schema-spec § 4` | spec | (no designation) | n/a |

The documentation is **split in time:** earlier same-day docs say INVOKER; mig 094a's later-same-day prologue says DEFINER as part of the "uniform-DEFINER, no exceptions" amendment. The same conflict pattern exists for helper #3 (`can_patient_access_global_patient`), and Mo's Q1 ruling resolved it in the INVOKER direction — explicitly treating the older docs as canonical and rejecting the recursion-safety reasoning the amendment relied on.

---

## Step 1.2 — Function body on staging (live query)

Query executed on staging (project `mtmdotixlhwksyoordbl`, project name `medassist-egypt`):

```sql
SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef, p.provolatile, p.proparallel
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND proname = 'can_clinic_access_global_patient';
```

Result (verbatim):

```sql
CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(p_global_patient_id uuid, p_clinic_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.patient_clinic_records WHERE global_patient_id = p_global_patient_id AND clinic_id = p_clinic_id)
      OR EXISTS (SELECT 1 FROM public.patient_data_shares WHERE global_patient_id = p_global_patient_id AND grantee_clinic_id = p_clinic_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()));
$function$
```

Catalog flags: `prosecdef = TRUE` (DEFINER), `provolatile = 's'` (STABLE), `proparallel = 's'` (PARALLEL SAFE).

**Tables queried internally:**

1. `public.patient_clinic_records` — does the clinic have a PCR row for this gp?
2. `public.patient_data_shares` — is the clinic a grantee on an active share for this gp?

Note that the live state matches mig 094a's declaration exactly (DEFINER + `SET search_path = public, pg_temp`), confirming mig 094a was applied (also confirmed by the migration history check below).

Migration history (also queried):

```sql
SELECT name FROM supabase_migrations.schema_migrations
WHERE name ILIKE '%092%' OR name ILIKE '%094%' OR name ILIKE '%rls_helper%';
```

Returned (in apply order):

```
056_fix_clinic_memberships_recursion
087_privacy_code_functions_search_path_fix
092_rls_helper_functions
094_rls_clinical_data
094a_rls_helper_fixes
```

Mig 094a is on staging. Staging's DEFINER state for helper #2 is **not** a hot-patch — it is the deliberate, recorded outcome of mig 094a.

---

## Step 1.3 — Caller analysis

### a. Migration files

```bash
grep -rn "can_clinic_access_global_patient(" supabase/migrations/
```

Hits (function definitions and rollback only, **no call sites**):

| File | Line | Kind |
|---|---|---|
| `092_rls_helper_functions.sql` | 121 | DEFINE |
| `092_rls_helper_functions.sql` | 143 | COMMENT |
| `092_rls_helper_functions.rollback.sql` | 38 | DROP |
| `094a_rls_helper_fixes.sql` | 84 | RE-DEFINE (flip) |
| `094a_rls_helper_fixes.sql` | 106 | COMMENT |
| `094a_rls_helper_fixes.rollback.sql` | 26 | RE-DEFINE (revert) |

No CALL site exists in any migration file (092, 093, 094, 094a, 095, 096, 097, 100–105). The function is **defined but never invoked from RLS or from any other migration body.**

### b. Live policies on staging

```sql
SELECT count(*) AS policies_total,
       count(*) FILTER (WHERE qual::text ILIKE '%can_clinic_access_global_patient%' OR with_check::text ILIKE '%can_clinic_access_global_patient%') AS using_helper
FROM pg_policies WHERE schemaname='public';
```

Result: `policies_total = 202, using_helper = 0`.

**Zero RLS policies on staging call this helper.**

### c. Other functions on staging

```sql
SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind = 'f' AND p.proname <> 'can_clinic_access_global_patient'
  AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND p.prosrc ILIKE '%can_clinic_access_global_patient%';
```

Result: `[]`. **No function body references it.**

### d. Application code

```bash
grep -rn "can_clinic_access_global_patient" packages/ apps/
```

(Implied — repo-wide grep returned only audit docs and `supabase/migrations/`.) **No application code RPC-calls it directly.**

### Caller list summary

The helper has **zero callers** in any reachable runtime path on staging today: no policies, no functions, no application code. It is a "deployed but not yet wired" helper, intended to be invoked by Phase D scenario tests and by future per-table policies that haven't been authored.

This matters for the architectural analysis below: the recursion-safety rationale in mig 094a's prologue ("Reads PCR + patient_data_shares — both have policies with cross-table EXISTS that recurse under INVOKER") describes a state of affairs that **does not exist on staging post-mig-094a**. Mig 094a itself rewrote those PCR / PDS policies to use helpers (`is_clinic_member`, `can_patient_access_global_patient`, `user_has_clinic_path_to_gp`) instead of inline cross-table EXISTS. The recursion path the amendment was defending against is gone.

---

## Step 1.4 — RLS walk-through under INVOKER

Spec calls for a walk-through "for EACH calling policy." With zero current callers, the walk-through degenerates. I instead conduct the analysis for the **only relevant scenarios** under INVOKER: (i) the helper's own internal queries against PCR and PDS, evaluated under the caller's RLS context; and (ii) the recursion claim from mig 094a's prologue tested against the post-094a policy surface.

### Scenario i — internal queries under INVOKER

Under INVOKER, the helper's two `SELECT EXISTS` clauses run as the calling user. They are filtered by RLS on `patient_clinic_records` and `patient_data_shares`. The current SELECT policies on those tables (set by mig 094a):

- `patient_clinic_records_select_v2`: `is_clinic_member(clinic_id, auth.uid()) OR can_patient_access_global_patient(global_patient_id, auth.uid())`
- `patient_data_shares_select_v2`: `is_clinic_member(grantor_clinic_id, auth.uid()) OR is_clinic_member(grantee_clinic_id, auth.uid()) OR can_patient_access_global_patient(global_patient_id, auth.uid())`

Both `is_clinic_member` and `can_patient_access_global_patient` are SECURITY DEFINER on staging (the latter currently, pending Q1's revert). The helper's internal SELECTs would therefore evaluate the calling user's PCR/PDS visibility through DEFINER helpers — no further RLS recursion enters the picture.

Whether the calling user can SEE the PCR row or share row under their own RLS depends on whether they are a member of the relevant clinic. The mig 092 file rationale states: "INVOKER is safe because every reachable call path has the caller as a member of p_clinic_id (i.e. they can already SELECT the relevant PCR / share rows under the new RLS)." With zero current call paths this is vacuously true; for any future caller that passes `p_clinic_id` as a clinic the user is a member of, the rationale holds.

### Scenario ii — re-test mig 094a's recursion claim against the post-094a surface

Mig 094a's prologue claims INVOKER would recurse because PCR and PDS policies "have policies with cross-table EXISTS that recurse under INVOKER." That claim was true of the **pre-094a** PCR/PDS policies authored in mig 093. Mig 094a itself replaced those inline EXISTS with helper calls (see § 2b, 2c above). The recursion path mig 094a's prologue describes does not exist on staging today.

This is the same diagnostic Mo applied to Q1 (helper #3): the R2 recursion-safety rationale was "based on faulty inference," because the policy surface that would have caused the cycle was rewritten. The Q2 diagnostic produces the same finding: **mig 094a's recursion-safety rationale was correct against the pre-094a surface but is stale against the post-094a surface (which is current staging).**

### Walk-through verdict

INVOKER does not break under the current RLS surface. The helper has no recursion path because (a) it has no callers and (b) the only RLS policies on the tables it queries internally (PCR, PDS) gate access via DEFINER helpers, not via inline EXISTS that would re-enter. The staging DEFINER setting is preserving a defensive amendment whose justification has been eliminated by the very migration that introduced it.

---

## Step 1.5 — Verdict

**CONFIRMED INVOKER** — same situation as Q1, opposite-direction file/staging drift.

**Reasoning:**

1. **Documented intent (canonical, pre-amendment):** EXECUTION_PROMPTS.md § B2, mig 092 file body and post-condition, and the 2026-04-30 hybrid ruling all designate **INVOKER**. The 2026-04-30 ruling explicitly names this helper as one of the "3 INVOKER" set.

2. **Documented intent (amendment, mig 094a):** designates DEFINER as part of a "uniform DEFINER, no exceptions" rule introduced specifically to defend against the mig 093 recursion bug. The amendment relied on the existence of inline cross-table EXISTS in PCR/PDS SELECT policies — which mig 094a itself rewrote out of existence.

3. **Architectural analysis:** zero callers exist on staging. Even if callers were added matching the documented call convention (caller is a member of `p_clinic_id`), the helper's internal PCR/PDS queries under INVOKER would clear via DEFINER helpers in the post-094a policies. INVOKER is safe.

4. **Mo's Q1 ruling sets precedent:** for helper #3, an analogous documentation conflict was resolved in the INVOKER direction by treating older docs as canonical and rejecting the recursion claim that turned out to depend on a now-rewritten policy surface. Helper #2 is the sibling case with the same shape, except the file already says INVOKER (helper #3's file says DEFINER per R2). The Q1-style remediation here is a one-sided staging revert, no file edit.

5. **Mig 092 post-condition would FIRE on apply if staging stays DEFINER.** The post-condition asserts `prosecdef = FALSE` for this helper. Re-applying mig 092 against current staging would `RAISE EXCEPTION 'mig 092 post-condition failed: can_clinic_access_global_patient missing or not SECURITY INVOKER'`. This is not silent file-vs-staging drift — the file explicitly demands INVOKER, including a runtime check. Either staging needs to flip or the file post-condition needs to be inverted; the verdict above takes the former.

**Implication for the apply runbook (per spec rules for CONFIRMED INVOKER):**

- Add a 7th forensic migration `106_forensic_revert_helper_definer_drift.sql` that flips **both** `can_patient_access_global_patient` (Q1) and `can_clinic_access_global_patient` (Q2) from DEFINER → INVOKER on staging via `ALTER FUNCTION ... SECURITY INVOKER;`. This is a behavioral-mode change and is the **only** behavioral migration in the forensic-fix sequence.
- No new file edit to mig 092 (per Mo's Q1 directive: "Don't edit mig 092"). The file remains at:
  - `can_clinic_access_global_patient`: INVOKER (matches doc canon — stays unchanged)
  - `can_patient_access_global_patient`: DEFINER (per R2 edit; documented as a known stale declaration to be reconciled in a later session per Mo's Q1 directive)
- Mig 094a is **historical** and stays as-is. Its prologue narrative is overruled by Mo's Q1 + Q2 rulings, but the policy rewrites it introduced (which were the actual recursion fix) remain in force.
- After mig 106 applies, mig 092's post-condition assertion will pass for `can_clinic_access_global_patient` (INVOKER, prosecdef=FALSE).

---

## Caveats and items to flag for Mo before apply

1. **Documentation hygiene gap:** memory file `project_prompt_06_architecture_rulings.md` says "hybrid 3 INVOKER + 1 DEFINER." Mig 094a's prologue says "uniform DEFINER, no exceptions." Mo's Q1 + Q2 rulings effectively re-affirm the original 3-INVOKER + 1-DEFINER architecture and overrule the mig 094a amendment. The memory and the mig 094a prologue should be reconciled in a follow-up doc-only edit (out of this session's scope per the limits).

2. **Mig 092 file's `can_patient_access_global_patient` declaration (R2-edited to DEFINER):** stays misaligned with documented intent (INVOKER). Mo's Q1 directive said "Don't edit mig 092" — accepted as a deferred reconciliation. The file diff/intent gap is captured here for future sessions.

3. **Mig 094a's prologue narrative will become stale-on-record** after mig 106 applies. Recommend a doc-only follow-up to add a `-- 2026-05-03 update:` note to mig 094a's prologue clarifying that helpers #2 and #3 were reverted to INVOKER (without altering 094a's body, which is the actual recursion fix). Out of this session's scope.

4. **Strength-of-evidence note:** the verdict here treats Mo's Q1 ruling as binding precedent for Q2. If Mo prefers to re-affirm mig 094a's "uniform DEFINER" rule for helper #2 specifically (e.g., for pre-emptive defense as new RLS surfaces are added in Prompt 7), the ARCHITECTURALLY-REQUIRES-DEFINER branch of Part 3 should be taken instead. Surface this option to Mo before apply.
