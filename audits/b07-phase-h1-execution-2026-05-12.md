# B07 Phase H.1 — Scenario amendments + matrix re-run at run_no = 4.1 (2026-05-12)

Builds on Phase H (`7abf314`). Closes the 4 findings from Phase H per Mo's
empirically-verified triage rulings. Single commit; ~50 min session.

## Executive summary

| | |
|---|---|
| Commit | (TBD — set at push) |
| run_no = 4.1 total | **192** |
| run_no = 4.1 pass | **192** |
| run_no = 4.1 fail | **0** |
| Divergence vs run_no = 4.0 (188 non-amended scenarios) | **0** |
| Tables covered | 26 |
| Distinct scenarios | 28 |
| Sandbox gates | 4/4 clean |
| Findings closed | 4 (S26-4, S26-5, S28-3, S28-5) |

## 1. Per-amendment report

### S26-4 — guardian SELECTs minor's DPR row

| | run_no=4.0 | run_no=4.1 |
|---|---|---|
| expected_outcome | SUCCESS | **FAIL** |
| actual_outcome | FAIL | FAIL |
| pass? | NO | **YES** |

**Amendment**: expected_outcome flipped SUCCESS → FAIL in matrix Section 26.
Description updated: "guardian BLOCKED from minor's DPR row (Phase D scope
intentionally excludes DPR — internal clinic plumbing)".

**Rationale**: Per Mo's empirically-verified ruling, Phase D's
`is_authorized_actor_on` OR-of-three does NOT extend to
`doctor_patient_relationships`. Mig 113-116 design intentionally targets
clinical-content tables (gp / PCR / clinical_notes / etc.); DPR is the
doctor-to-patient routing table for clinic-internal scoping, not for
guardian/delegate authority extension. The scenario now correctly tests
the "guardian does NOT have access to internal clinic plumbing" invariant.

### S26-5 — guardian SELECTs minor's legacy `patients` row

| | run_no=4.0 | run_no=4.1 |
|---|---|---|
| expected_outcome | SUCCESS | **FAIL** |
| actual_outcome | FAIL | FAIL |
| pass? | NO | **YES** |

**Amendment**: expected_outcome flipped SUCCESS → FAIL in matrix Section 26.
Description updated: "guardian BLOCKED from minor's legacy patients row
(legacy RLS pre-dates Phase D; obsolete post-prompt-6.5)".

**Rationale**: Per Mo's ruling, legacy `patients` RLS (from mig 010) does
NOT honor `is_authorized_actor_on`. Guardians access minor data via
`patient_clinic_records` (mig 115 extended) and `global_patients`
(mig 114 extended) — the v2 surface — not via the legacy `patients`
table that is on the deprecation track for prompt 6.5. The scenario
remains useful as a "legacy RLS isn't being silently widened" sentinel
until prompt 6.5 ships, at which point it becomes obsolete and can be
removed alongside the table itself.

### S28-3 — doctor_b SELECTs minor_m2 gp via active share

| | run_no=4.0 | run_no=4.1 |
|---|---|---|
| expected_outcome | SUCCESS | SUCCESS |
| actual_outcome | FAIL | **SUCCESS** |
| pass? | NO | **YES** |

**Amendment**: fixture amendment. `rls_test_seed_b07_phase_h()` extended to
create a PCR row for `minor_m2` at clinic_b in addition to clinic_a.
Description updated: "doctor_b SELECTs minor_m2 gp (active share to
clinic_b; PCR-at-grantee post-consumed)".

**Rationale**: Per Mo's ruling, active share alone does NOT grant gp
visibility. The `user_has_clinic_path_to_gp` helper requires PCR-at-grantee
(created by share consumption via mig 091's atomic `create_shares_for_grantors`
RPC). The Phase H fixtures only created PCR rows at the grantor clinic;
the scenario tested the post-share-EXISTENCE state but the actual
visibility contract requires post-share-CONSUMPTION state (where the
grantee clinic has its own PCR row from the share-acceptance flow).

The amendment is **NOT a change to the share semantics** — it's a fixture
correction to represent the architecturally-correct post-consumed state.

### S28-5 — doctor_b SELECTs share_grantor adult gp via active share

| | run_no=4.0 | run_no=4.1 |
|---|---|---|
| expected_outcome | SUCCESS | SUCCESS |
| actual_outcome | FAIL | **SUCCESS** |
| pass? | NO | **YES** |

**Amendment**: same as S28-3 — fixture amendment to add PCR-at-clinic_b
for `share_grantor` adult.

**Rationale**: identical to S28-3 (share alone insufficient; PCR-at-grantee
required post-share-consumption).

## 2. Phase H findings — final status

| Finding | Status | Resolution |
|---|---|---|
| F#1 (S26-4 — guardian on DPR) | **RESOLVED** | Expected_outcome flip (DPR is intentionally out of Phase D scope) |
| F#2 (S26-5 — guardian on legacy patients) | **RESOLVED** | Expected_outcome flip + obsolescence note pointing at prompt 6.5 |
| F#3 (S28-3 + S28-5 — share-based cross-clinic visibility) | **RESOLVED** | Fixture amendment — seed now creates PCR-at-grantee representing post-share-consumed state |

All 4 findings from Phase H are closed at Phase H.1.

## 3. Verification

### Section 5 sandbox gates

| Gate | Result |
|---|---|
| root tsc | exit 0 |
| clinic tsc | exit 0 |
| patient tsc | exit 0 |
| lint:scopes | exit 0 |

### Matrix execution at run_no = 4.1

| Aspect | Value |
|---|---|
| Total scenarios at run_no=4.1 | 192 |
| Failures | 0 |
| Distinct scenarios | 28 |
| Tables covered | 26 |
| Divergence vs run_no=4.0 baseline (188 non-amended scenarios) | 0 |

Verification SQL:

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE actual_outcome <> expected_outcome) AS failures,
  COUNT(DISTINCT scenario) AS distinct_scenarios
FROM public._rls_test_results WHERE run_no = 4.1;
-- → 192, 0, 28
```

Divergence check (excludes the 4 amended scenarios — their outcomes are by
design different at 4.1 vs 4.0):

```sql
SELECT COUNT(*) AS scenarios_compared,
       COUNT(*) FILTER (WHERE r4.actual_outcome IS DISTINCT FROM r41.actual_outcome) AS divergent_scenarios
FROM public._rls_test_results r41
LEFT JOIN public._rls_test_results r4
  ON r4.run_no = 4.0 AND r4.scenario = r41.scenario AND r4.table_name = r41.table_name
WHERE r41.run_no = 4.1
  AND r41.scenario NOT IN ('S26-4', 'S26-5', 'S28-3', 'S28-5');
-- → 188, 0
```

## 4. Decision log

1. **S26-4: expected_outcome flip, not RLS extension.** DPR is internal
   clinic plumbing per Mo's ruling. Extending Phase D's authority helper
   to DPR would conflate two distinct authority axes (guardian-on-patient-
   data vs doctor-on-clinic-routing) and add scope to mig 113-116 that
   the design intentionally excluded.

2. **S26-5: expected_outcome flip + obsolescence annotation.** Legacy
   `patients` is on prompt-6.5 deprecation track. Extending Phase D RLS
   to it would create dead code at deprecation. Scenario remains useful
   as a sentinel against silent RLS widening until prompt 6.5 ships.

3. **S28-3 + S28-5: fixture amendment, not RLS amendment.** Active share
   alone does not grant gp visibility — the helper
   `user_has_clinic_path_to_gp` requires PCR-at-grantee. The Phase H
   fixtures tested the post-share-EXISTENCE state; the actual visibility
   contract is post-share-CONSUMPTION (PCR-at-grantee created by mig 091
   RPC). Fixture correction makes the scenario test the right state.

4. **Single seed function `rls_test_seed_b07_phase_h()` (not a v2 split).**
   Considered creating a separate `rls_test_seed_b07_phase_h_v2()` to
   preserve the original fixture shape for reproducibility. Decided against:
   the seed function is test infrastructure, not a versioned API. Future
   amendments will follow the same pattern (edit the function directly +
   bump matrix run_no).

5. **`v_run NUMERIC := 3.0` inline-with-`v_table` lines were unaddressed in
   Phase H.** Phase H's sed bumped `v_run NUMERIC := 3.0;` (standalone) → 4.0
   in only 3 spots — Sections 26-28. The 21 existing sections (1-25) kept
   `v_run NUMERIC := 3.0` baked in because their declaration format is
   `v_table TEXT := '...'; v_run NUMERIC := 3.0;` (inline). Phase H's
   carry-forward INSERT-SELECT masked this — the matrix file would not
   actually have run those sections at 4.0 if executed. Phase H.1 fixes
   both bumps (3.0 → 4.1 in all 21 inline lines + standalone lines via
   Edit replace_all). Future phases must verify both declaration forms.

6. **Section 0 cleanup block preserved verbatim from Phase H.** B07 prefix
   cleanup + sms_reminders cleanup + teardown + seed + b07_seed call.
   Lesson #21 codifies this pattern.

7. **STOP exception #1/#2/#3 NOT tripped.** S28-3/S28-5 now PASS post-
   fixture-amendment (STOP #1 was "if scenarios still fail, deeper
   architectural issue"); no other scenarios diverged from 4.0 baseline
   (STOP #2); Lesson #21 codification did not surface a broader teardown
   refactor need (STOP #3).

## 5. Lesson #21 codified

Per the prompt's verbatim text. Added to `audits/EXECUTION_PROMPTS.md`
under "Empirical lessons" between Lesson #19 and the prompt-index block.
Reserved Lesson #20 as a placeholder noting the promotion (Phase H surfaced
the gap but didn't codify until Phase H.1 reproduced + closed it).

## 6. Sympathetic doc updates

- `audits/rls-test-matrix-reconstructed.sql` — header note appended for
  2026-05-12 run_no = 4.1 re-run; v_run bumped 3.0→4.1 (inline-with-
  v_table form, 21 places) AND 4.0→4.1 (standalone form, 3 places);
  Section 0 DELETE clause updated to run_no = 4.1; S26-4 + S26-5 scenarios
  amended with new expected_outcome + description; S28-3 + S28-5 scenarios
  description updated (no expected change).
- `audits/EXECUTION_PROMPTS.md` — Lesson #21 added (verbatim per prompt);
  Lesson #20 reserved.
- `audits/b07-phase-h-execution-2026-05-11.md` — findings F#1/F#2/F#3
  status: RESOLVED at Phase H.1 (cross-reference to this doc).
- `audits/b07-phase-h1-execution-2026-05-12.md` — this file (NEW).
- `audits/STATE_OF_WORK.md` — Phase H.1 → Completed entry.
- `audits/PROGRAM_STATE.md` — Phase H.1 entry; Phase I queued.

## 7. Phase I readiness (post-Phase-H.1)

**B07 RLS verification is now complete.** All architectural archetypes
covered at run_no = 4.1: self ∪ guardian-of-minor ∪ delegate-with-capability
∪ cross-clinic-via-share, with 192/192 PASS and zero baseline divergence.

Phase I (integration smoke for Mo's A1 + A2 cases) is **unblocked**.

- A1 case: mother + 6yo via clinic-app frontdesk register → patient-app
  account switcher → minor's records visible/editable
- A2 case: adult son + father via patient-app delegate grant → father
  accepts → father reads son's records via delegate path

Estimated 3 hours per the combined-batch prompt.

## 8. Pre-push state

Files staged for commit:
- `audits/rls-test-matrix-reconstructed.sql` (modified — header + v_run bumps + scenario amendments)
- `audits/EXECUTION_PROMPTS.md` (modified — Lesson #21)
- `audits/b07-phase-h-execution-2026-05-11.md` (modified — findings RESOLVED)
- `audits/b07-phase-h1-execution-2026-05-12.md` (NEW — this file)
- `audits/STATE_OF_WORK.md` (modified — Phase H.1 entry)
- `audits/PROGRAM_STATE.md` (modified — Phase H.1 entry)

Staging-side artifact updated: `public.rls_test_seed_b07_phase_h()`
amended to include PCR-at-clinic_b for minor_m2 and share_grantor.
Function exists only on staging (not in a migration file, per Phase H's
no-migration-for-test-tooling pattern).
