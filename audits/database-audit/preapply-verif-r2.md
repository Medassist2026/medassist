# Pre-Apply Verification — R2 Ruling Lineage for `can_patient_access_global_patient`

**Captured:** 2026-05-03
**Verifier:** Pre-apply read-only verification session
**Source of truth:** `audits/EXECUTION_PROMPTS.md`, `project_prompt_06_architecture_rulings.md` (auto-memory), `patient-identity-schema-spec.md`, mig 092 working-tree file, live `pg_get_functiondef()` on staging.

---

## Verdict: **CONTRADICTED**

The R2 ruling — that `can_patient_access_global_patient` "was always intended to be SECURITY DEFINER (the '1 DEFINER helper' of the Prompt 6 hybrid model)" — is contradicted by the documented record. Two independent written sources predating the audit explicitly designate this helper as **SECURITY INVOKER**. The "1 DEFINER helper" in the documented hybrid model is `can_view_patient_data_at_clinic`, not `can_patient_access_global_patient`.

The architectural recursion argument the mig 092 file edit invokes ("INVOKER would re-enter the same authorization path — DEFINER cuts the cycle") does **not hold against current staging policies** — `global_patients_select_v2` uses `claimed_user_id = auth.uid()` directly, not via this helper, so there is no cycle to cut.

**Recommendation: PAUSE the mig 092 in-place file edit. Escalate.**

---

## a) Documented intent (verbatim quotes)

### a.1 EXECUTION_PROMPTS.md § Phase B / B3 — explicit INVOKER

`audits/EXECUTION_PROMPTS.md` lines 3279–3298:

```
### B3. `can_patient_access_global_patient(p_global_patient_id UUID, p_user_id UUID)`

The user can access patient data if:
- They are the claimed user for this global_patient

```sql
CREATE OR REPLACE FUNCTION public.can_patient_access_global_patient(
  p_global_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_patients
     WHERE id = p_global_patient_id
       AND claimed_user_id = p_user_id
  );
$$;
```
```

The helper is unambiguously specified as `SECURITY INVOKER`.

### a.2 Auto-memory `project_prompt_06_architecture_rulings.md` ruling #1 (2026-04-30) — hybrid 3 INVOKER + 1 DEFINER

```
**1. Helper architecture: HYBRID.** Build all three of Mo's prompt B1-B3
helpers (`is_clinic_member`, `can_clinic_access_global_patient`,
`can_patient_access_global_patient`) as `SECURITY INVOKER STABLE`,
AND build the schema spec's 4th helper `can_view_patient_data_at_clinic
(p_global_patient_id, p_data_clinic_id, p_viewer_user_id)` as
`SECURITY DEFINER STABLE`.
```

The "1 DEFINER helper" of the hybrid model is **explicitly named `can_view_patient_data_at_clinic`**. `can_patient_access_global_patient` is one of the three INVOKER helpers.

### a.3 Patient-identity schema spec § 4

`audits/patient-identity-schema-spec.md` only specifies a security mode for `can_view_patient_data_at_clinic` (DEFINER, line 602). It does not constrain the security mode of `can_patient_access_global_patient`. So the schema spec is silent on B3, and the ruling above governs.

### a.4 Mig 092 working-tree file (the in-place edit under review)

`supabase/migrations/092_rls_helper_functions.sql` lines 18–33 (the file edit currently being verified) describes its own intent:

```
3. can_patient_access_global_patient — SECURITY DEFINER STABLE (was INVOKER in
                                       this file; staging has been DEFINER
                                       since the original deploy. This file
                                       edit aligns the declaration with
                                       deployed reality. R2 confirms DEFINER
                                       is intentional ...)
```

This is the R2 claim itself. Note that it is **the only documentary source** that asserts DEFINER intent. Both predating sources (a.1 and a.2) say INVOKER.

The file's lines 156–168 invoke an architectural-necessity argument:

```
Why DEFINER, not INVOKER: this helper is called from policies
on tables whose SELECT permission for the claimed patient is
itself granted via this helper (privacy_code_attempts mig 094a,
see comment "uses can_patient_access_global_patient ... clinic
OWNER OR claimed-patient" in that file). Under INVOKER the
helper's internal SELECT on global_patients would re-enter the
same authorization path — DEFINER cuts the cycle.
```

This argument does not hold; see section (b).

---

## b) Architectural necessity

### b.1 Function body (live, identical to file body)

```sql
SELECT EXISTS (
  SELECT 1 FROM public.global_patients
  WHERE id = p_global_patient_id
    AND claimed_user_id = p_user_id
);
```

The helper joins exactly one table: `global_patients`. Whether INVOKER works depends entirely on `global_patients`' SELECT policy.

### b.2 `global_patients` SELECT policy on staging (live, queried 2026-05-03)

```sql
USING ((claimed_user_id = auth.uid()) OR user_has_clinic_path_to_gp(id, auth.uid()))
```

The patient-self branch is `claimed_user_id = auth.uid()` **directly** — it does NOT call `can_patient_access_global_patient`. There is therefore no recursion when the helper, running under INVOKER, queries `global_patients` for its own claimed-by-me row.

### b.3 Walk-through under INVOKER (claimed-patient call site)

1. Patient (auth.uid() = X) calls a downstream policy that invokes `can_patient_access_global_patient(gpid, X)`.
2. INVOKER helper runs `SELECT 1 FROM global_patients WHERE id = gpid AND claimed_user_id = X` under the patient's RLS context.
3. `global_patients_select_v2` evaluates `(claimed_user_id = auth.uid()) OR user_has_clinic_path_to_gp(id, auth.uid())`. The first branch matches (`X = X`); row is visible.
4. Helper returns TRUE. ✅ No cycle.

### b.4 Walk-through under INVOKER (clinic-owner call site, e.g., privacy_code_attempts)

1. Owner (auth.uid() = O) calls policy `can_patient_access_global_patient(gpid, O) OR (clinic-owner EXISTS …)`.
2. INVOKER helper runs `SELECT 1 FROM global_patients WHERE id = gpid AND claimed_user_id = O`.
3. `global_patients_select_v2`: `claimed_user_id (=patient X) ≠ O`; falls through to `user_has_clinic_path_to_gp(id, O)`. If owner has a clinic path to this patient (membership + PCR), row is visible. Helper returns FALSE (because `claimed_user_id ≠ O`), and the OR's second clause (clinic-owner EXISTS) carries the policy. ✅
4. If owner has no clinic path: row is invisible to the helper's SELECT, helper returns FALSE; OR's second clause still evaluates and allows or rejects on its own merits. ✅

In neither case does the call to `can_patient_access_global_patient` recurse back into itself, because no policy on `global_patients` references this helper.

### b.5 Conclusion on architectural necessity

DEFINER is **architecturally OPTIONAL**, not REQUIRED. Both INVOKER and DEFINER produce correct results given current `global_patients` RLS. The cycle-breaking rationale in mig 092's file edit (section a.4) is **factually incorrect** for the current policy set.

A defensive case for DEFINER could be made: if `global_patients_select_v2` is ever rewritten to call this helper (rather than inlining `claimed_user_id = auth.uid()`), DEFINER would prevent a future regression. But that is forward-looking insurance, not the documented intent, and is not the argument the file makes.

---

## c) Verdict

**CONTRADICTED** — Documented intent (EXECUTION_PROMPTS.md § B3 + the 2026-04-30 hybrid-model ruling) explicitly designates `can_patient_access_global_patient` as **SECURITY INVOKER**. Architectural necessity does not require DEFINER under the current `global_patients` policy. Staging's DEFINER state is drift, not intent.

Per the spec criteria, this verdict triggers: **PAUSE mig 092 edit, escalate.**

---

## Bonus finding — `can_clinic_access_global_patient` drift (mig 092 file ≠ live)

While verifying the four helpers, a second material discrepancy surfaced. The mig 092 working-tree file declares helper #2 as `SECURITY INVOKER` (line 127). Staging has it as `SECURITY DEFINER`.

Live state, queried 2026-05-03:

| Helper | EXECUTION_PROMPTS.md / 2026-04-30 ruling | mig 092 file (working tree) | Staging live | File-vs-live drift on apply |
|---|---|---|---|---|
| `is_clinic_member` | INVOKER → DEFINER (recursion deviation, doc'd in file lines 36–46) | DEFINER | DEFINER | none |
| `can_clinic_access_global_patient` | INVOKER | INVOKER | **DEFINER** | **flips DEFINER → INVOKER on apply** |
| `can_patient_access_global_patient` | INVOKER | DEFINER (R2 edit) | DEFINER | none on apply, but contradicts documented intent |
| `can_view_patient_data_at_clinic` | DEFINER | DEFINER | DEFINER | none |

Session C's claim that "the 087 and 092 file edits are no-ops against staging (live state already matches)" is **false for `can_clinic_access_global_patient`**. Applying the file via `CREATE OR REPLACE FUNCTION` would silently flip its security mode from DEFINER to INVOKER on staging — the opposite direction of the R2 edit, and not a no-op.

This is independent of R2 but informs the decision: the 092 file as currently written is not safely re-appliable as a no-op, even setting R2 aside.

---

## Recommended next step

Before applying mig 092 in-place to staging:

1. **Resolve R2.** Either (i) revert `can_patient_access_global_patient` to INVOKER per the documented ruling (and revert staging's DEFINER state to match), or (ii) explicitly amend the 2026-04-30 hybrid ruling to say "actually 2 INVOKER + 2 DEFINER" with a written rationale that does not depend on the false recursion claim. Update the ruling memory and PROMPTS document to match whichever direction is chosen.
2. **Resolve the bonus finding.** Decide whether `can_clinic_access_global_patient` should be INVOKER (per docs and the file) or DEFINER (per staging). The two-sentence comment in the mig 092 file ("INVOKER is safe because every reachable call path has the caller as a member of p_clinic_id") is the documented intent — but if staging has been operating as DEFINER without harm, flipping it back is risk that needs explicit acceptance.
3. **Do not write the apply runbook** until both are resolved. The runbook's Step 3 expectation ("Live function bodies should not change because the file edits are no-ops on staging") would fire its STOP trigger on at least one helper today.

Pending resolution, **mig 092 should not be applied** in its current form.
