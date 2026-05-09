# B07 Phase B Execution Log — 2026-05-10

Phase B of the B07 build (Dependent Accounts: Pattern A child linkage + Pattern B
adult delegation). Schema migrations only. Authority: Phase B prompt (2026-05-10),
operating on top of architectural review commit `07fcbf8`.

This log captures all meaningful trade-offs encountered during autonomous
execution, plus the empirical reveals where the architectural review (a
document on `origin/main`) had drifted from live staging schema.

---

## Decision 1: Mig 109 CHECK shape — drop "adults must have phone" CHECK

**Migration:** mig 109
**Date:** 2026-05-10 (pre-work investigation)
**Context:** Pre-work verification revealed `global_patients.normalized_phone` is
already nullable on staging, contradicting the architectural review's premise
that it was `NOT NULL`. Three NULL-phone gp rows already exist. Surfaced as
STOP exception #1 to Mo; ruling Q1 → Option D (investigate first, then decide).

**Investigation:** `grep -rn 'normalized_phone' supabase/migrations/*.sql`
located the relaxation at **mig 076 §076.0**
(`076_quarantine_resolution.sql`, lines 54-64). The mig 076 header documents
the rationale at length: it implements the "PATH B sentinel" pattern, where
quarantine rows that fail phone normalization (test seeds with malformed
phones, US-test numbers, country-mismatch entries) get a `global_patients`
sentinel with `normalized_phone = NULL`, `account_status = 'locked'`,
`legacy_phone = <raw>`. The relaxation is **deliberate and load-bearing** for
this pattern.

**Options considered:**
1. Option A — Add CHECK `normalized_phone IS NOT NULL OR is_minor = TRUE OR account_status <> 'active'`. Pros: enforces the original "adults must have phone" intent at the schema level while accommodating sentinels. Cons: adds `account_status` to a phone-shape predicate, which couples concerns; deviates from architectural review §4.
2. Option B — Drop the "adults must have phone" CHECK from mig 109 entirely. Rely on the existing convention (NULL phone implies a sentinel/minor) plus app-layer enforcement plus the existing `global_patients_phone_e164_chk` (which is NULL-permissive but enforces format when present). Pros: simplest; honors the schema's intentional flexibility from mig 076. Cons: weaker schema-level guarantee about "active claimed adults must have a phone" — but this guarantee is already weak post-mig-076 anyway.
3. Option C — Manually fix the `noah hasan` row before mig 109. Pros: keeps the strict CHECK shape. Cons: scope creep, mixes data hygiene into a schema migration.

**Decision:** Option B.

**Reasoning:** Per Mo's Q1 ruling — "If the relaxation was deliberate
(quarantine, locked-gp data hygiene): adopt Option B. Don't add the 'adults
must have phone' CHECK in mig 109." The mig 076 header is unambiguous about
intent ("the schema spec models normalized_phone as nullable for the sentinel
case"). Mig 109 adds only the minor-specific CHECKs:
- `global_patients_minor_requires_guardian_chk`: `is_minor = FALSE OR guardian_global_patient_id IS NOT NULL`
- `global_patients_minor_no_self_claim_chk`: `is_minor = FALSE OR claimed_user_id IS NULL`

**Trade-offs accepted:** No schema-level enforcement that a claimed adult gp
has a phone. This was already the case post-mig-076 — Phase B doesn't
regress; it just declines to introduce a new constraint that would conflict
with existing convention.

**Risks:** A future "claim adult account" path could in principle write a
claimed gp with NULL phone. Mitigated by app-layer claim flow, which always
takes a phone as input (this is the registration premise). If we want a
schema-level guarantee later, we can add it as a separate migration once
existing data hygiene allows it.

---

## Decision 2: Active-uniqueness via partial unique index, not EXCLUDE

**Migration:** mig 110
**Date:** 2026-05-10
**Context:** Architectural review §5 specified
`EXCLUDE USING gist (principal_global_patient_id WITH =, delegate_user_id WITH =) WHERE (revoked_at IS NULL)`
to prevent duplicate active delegations. EXCLUDE with uuid `=` operators
requires the `btree_gist` extension.

**Investigation:** `SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`
on staging returns 0 rows. `btree_gist` is **not enabled**. The Phase B prompt
explicitly anticipates this case: "If `btree_gist` extension is unavailable
on staging, fall back to a partial unique index … and document the fallback
in the migration's header comment."

**Options considered:**
1. Option A — Enable `btree_gist` extension, then use the EXCLUDE constraint as designed. Pros: matches review §5 verbatim. Cons: enables a new extension on staging (and eventually production) for a single use case; extension-management is a release-coordination question that doesn't belong inside a Phase B schema migration.
2. Option B — Partial unique index `CREATE UNIQUE INDEX patient_delegations_active_unique ON patient_delegations(principal_global_patient_id, delegate_user_id) WHERE revoked_at IS NULL`. Pros: functionally equivalent for this use case (prevents duplicate active rows); uses only standard btree; documented as the prompt's pre-authorized fallback. Cons: doesn't extend to non-equality predicates (irrelevant here).

**Decision:** Option B (partial unique index).

**Reasoning:** Phase B prompt pre-authorizes the fallback. Functional
equivalence: both reject `INSERT … (principal=X, delegate=Y, revoked_at IS NULL)`
when an active row already exists for the same `(X, Y)` pair, and both allow
multiple revoked rows for the same pair. No use case in B07 needs the
EXCLUDE-only properties (range overlap, custom operators).

**Trade-offs accepted:** Lose the option to add additional `WITH` clauses
without rewriting the constraint as EXCLUDE. None of the planned phases need
this.

**Risks:** Future "delegation timing windows" (e.g., overlapping date ranges
for the same principal/delegate) would need EXCLUDE. Out of scope; revisitable
when/if needed.

---

## Decision 3: Mig 112 not needed — mig 081 is a clinical-tables compat shim

**Migration:** mig 112 (conditional)
**Date:** 2026-05-10
**Context:** Phase B prompt instructed an investigation of mig 081 to
determine whether the compat triggers needed amendment for minor-shaped
`global_patients` rows.

**Investigation:** Read full body of `081_compatibility_triggers.sql`.
The migration adds three trigger functions and 11 BEFORE INSERT/UPDATE
triggers, all on **clinical tables**: `clinical_notes`, `prescription_items`,
`appointments`, `lab_orders`, `imaging_orders`, `vital_signs`,
`patient_consent_grants`, `doctor_patient_relationships`,
`patient_visibility`, `lab_results`, `patient_phone_history`. The triggers
derive `global_patient_id` from `patient_id` (legacy code path) or vice
versa (new code path) for these clinical tables only.

The trigger system has **zero** logic touching `is_dependent`, `is_minor`,
`normalized_phone`, or `parent_phone`. It does not create, read, or modify
`patients` or `global_patients` rows.

**Options considered:**
1. Ship mig 112 as a no-op or comment-only migration to document this finding. Pros: leaves an explicit record in the migration sequence. Cons: pollutes the migration ledger with a no-op.
2. Skip mig 112 entirely; document the finding here in the decision log. Pros: clean migration ledger; finding still durably recorded.

**Decision:** Skip mig 112.

**Reasoning:** Mig 081's structural scope (clinical-table compat shim) is
disjoint from the dependent-account schema concerns (patients/global_patients).
The conditional in the Phase B prompt was prudent ("verify the assumption")
but the assumption proved unfounded — there is no patients-side compat trigger
in mig 081 to amend. The decision-log entry is the durable record.

**Trade-offs accepted:** None.

**Risks:** None for Phase B. If a future audit or onboarding doc claims
"mig 081 has patients-side compat triggers", that claim is wrong; the truth is
this entry plus the file body.

---

## Decision 4: Mig 111 dependent #1 backfill — Pattern (Option A) per Mo Q2

**Migration:** mig 111
**Date:** 2026-05-10
**Context:** Pre-work verification revealed dependent #1 (فاطمة أحمد) cannot
have a guardian resolved automatically: `guardian_id IS NULL`, and phone-lookup
on `parent_phone = +201234567890` returns the child's OWN gp (because the
child's gp's `normalized_phone` was set to the parent's phone, an old data
convention). No separate parent gp exists. Surfaced as STOP exception #4 to Mo;
ruling Q2 → Option A.

**Mo's specified pattern:**
1. Create new parent gp for `+201234567890`:
   - `display_name = 'ولي أمر فاطمة أحمد'` (placeholder, correctable later)
   - `is_minor = FALSE`, `claimed = FALSE`, `claimed_user_id = NULL`
   - `account_status = 'active'`
2. Update child's gp (`6036cd97…`):
   - `normalized_phone = NULL` (release the parent's phone from the child gp)
   - `is_minor = TRUE`
   - `guardian_global_patient_id = <new parent gp id>`
3. Emit audit event `BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION` with
   `actor_kind = 'migration'`, `actor_user_id = NULL`, metadata containing
   both gp ids and the phone-lookup result that justified the reconstruction.

**Decision:** Implemented exactly per Mo's specification. The new parent gp
is created **before** the child gp is flipped to `is_minor = TRUE`, so the
mig 109 CHECK `is_minor = FALSE OR guardian_global_patient_id IS NOT NULL`
passes throughout (single transaction).

**Trade-offs accepted:** The placeholder display_name `'ولي أمر فاطمة أحمد'`
("Guardian of Fatima Ahmed") is non-canonical identity data. Per Mo, the
"patient profile edit" path lets clinic frontdesk correct it when the parent
visits in person.

**Risks:** If two clinics independently see this parent later and try to
register a NEW gp at `+201234567890`, they'll find this placeholder gp via
phone lookup and may merge or update names. Acceptable — the gp is just a
phone-anchored identity ledger row; identity correction is the same
operational flow that exists for any patient.

---

## Decision 5: Smoke probes inline (DO blocks), not separate verification migrations

**Migration:** all (109, 110, 111)
**Date:** 2026-05-10
**Context:** Phase B prompt requires inline smoke probes. Two implementation
shapes: anonymous DO blocks at the end of each migration, vs. separate
verification migrations.

**Decision:** Inline `DO $$ … $$` blocks, with clean teardown of test rows
inside the same block.

**Reasoning:** Atomic with the schema change (rollback removes the probe
artifact along with the schema artifact). Matches the pattern already
established by migs 071, 074, 075, 077, 089 (all use inline DO blocks for
smoke / verification).

**Trade-offs accepted:** Probes execute at apply time, not on demand. If a
production-time probe is needed later, that's a separate verification SQL
file; doesn't belong inside the migration.

**Risks:** A probe failure aborts the migration mid-apply, leaving partial
schema state. Acceptable: the migration runner reports the error, and
re-running re-applies cleanly because the schema additions use `IF NOT EXISTS`
guards or run before the probe.

---

## Decision 6: `global_patients` schema baseline drift (annotation deferred)

**Migration:** N/A (empirical reveal)
**Date:** 2026-05-10
**Context:** Two factual claims in `audits/B07-architectural-review-2026-05-10.md`
(commit `07fcbf8`) drifted from live staging:

1. Review §3 / §4 claim `global_patients.normalized_phone TEXT NOT NULL`.
   Live staging: nullable since mig 076 (2026-04-29).
2. Review §6 claim "1 such case" of `is_dependent ∧ guardian_id IS NULL ∧ parent_phone IS NOT NULL`. Live staging: 2 such cases.

**Decision:** Document here; don't block Phase B; surface as a follow-up
annotation commit candidate after Phase B ships, per Mo Q3 ruling.

**Reasoning:** The architectural rulings (the 17 in the prompt) are intact;
the drift is factual, not architectural. Per Lesson #16 ("verify every
architectural claim against ground truth"), the empirical baseline I work
from is what staging actually has, not what the review document claimed.

**Trade-offs accepted:** Architecture review doc on `origin/main` is partially
stale until the follow-up commit lands.

**Risks:** A future reviewer of `07fcbf8` reading the doc in isolation could
believe the stale claims. Mitigated by this log entry plus the commit message
referencing it.

---

## Decision 7: "noah hasan" gp — out of Phase B scope

**Migration:** N/A (data hygiene)
**Date:** 2026-05-10
**Context:** Pre-work verification surfaced a 3rd NULL-phone gp (`784de785…`)
linked to non-dependent patient "noah hasan" (`bbb7c45a…`). Patient's `phone`
is `010343485734345` — 15 digits, malformed. Patient `is_canonical = FALSE`,
`account_status = 'active'`, gp `account_status = 'locked'`.

**Decision:** Do not touch in Phase B. Surfaced for future cleanup
(candidate for Prompt 6.5 / Legacy Cleanup, or a separate data-hygiene
workstream). Per Mo's explicit ruling.

**Reasoning:** The locked sentinel-shaped gp is the load-bearing artifact of
mig 076's PATH B convention. Mig 109 doesn't add any constraint that would
violate on this row (Decision 1 rules out the `normalized_phone IS NOT NULL OR
is_minor = TRUE` CHECK that would have caught it).

**Risks:** The non-canonical patient row may need eventual reconciliation
(merge, delete, or resurface). Tracked as a known cleanup item, not a Phase B
blocker.

---

## Decision 8: Smoke-probe `updated_at` advancement requires seeding old timestamp

**Migration:** mig 110
**Date:** 2026-05-10
**Context:** First mig 110 apply attempt failed at smoke probe POS-2:
*"updated_at trigger did not advance the timestamp"*. The trigger function
`patient_delegations_touch_updated_at` correctly sets `NEW.updated_at := NOW()`,
but `NOW()` returns transaction-start time, not wall-clock time, so the
post-UPDATE value equals the post-INSERT value within the same transaction.
`pg_sleep(0.05)` does not advance `NOW()` — that's `clock_timestamp()`'s
behavior.

**Decision:** INSERT the smoke-probe row with an explicit
`updated_at = '2000-01-01'::timestamptz`, then UPDATE, then verify the
trigger advanced the field to "anything other than 2000-01-01" and "close
to NOW()".

**Reasoning:** The trigger is correct as written and matches the established
pattern across `touch_global_patients_updated_at`,
`patient_clinic_records_touch_updated_at`, etc. The fix belongs in the
smoke probe, not the trigger.

**Trade-offs accepted:** Smoke probe makes a `2000-01-01` test value
visible briefly in audit-trail noise (the row is inserted with that
timestamp before being UPDATE'd, all in one transaction; row is then
DELETE'd at end of probe). No persistent artifact.

**Risks:** None.

**Lesson:** Worth surfacing in `audits/EXECUTION_PROMPTS.md` if/when
authoring future migrations whose smoke probe tests `updated_at` semantics
— the "seed an old timestamp" pattern is what works.

---

## Decision 9: Three-step ordering for dependent #1 reconstruction

**Migration:** mig 111
**Date:** 2026-05-10
**Context:** First mig 111 apply attempt failed at the dep #1 reconstruction
step: *"duplicate key value violates unique constraint
`global_patients_normalized_phone_uniq`"*. The child gp for dep #1
(`6036cd97…`) currently holds `+201234567890` in `normalized_phone`. The
reconstruction tries to INSERT a new parent gp at the same phone, which
collides on the unique index.

**Decision:** Three-step ordering for the reconstruction branch:
1. Release the child gp's phone (`UPDATE … SET normalized_phone = NULL`)
2. INSERT the new parent gp at `+201234567890`
3. UPDATE the child gp to `is_minor = TRUE,
   guardian_global_patient_id = <new parent gp id>` (also sets
   `normalized_phone = NULL` for idempotency, though it's already NULL).

**Reasoning:** Step 1 is the prerequisite for step 2 (frees the unique-index
slot). Step 1 alone doesn't violate any CHECK (mig 109's CHECKs are minor-
shape and self-claim shape; setting normalized_phone to NULL on a
non-minor row is fine). Step 2 satisfies the unique index. Step 3 sets
is_minor=TRUE while guardian is set, satisfying CHECK 109.2. All three
steps run in one transaction, so external observers see only the final
state.

**Trade-offs accepted:** A more complex reconstruction sequence than the
2-step "INSERT parent then UPDATE child" the architectural review §6
implied. The complication is an empirical consequence of the dep #1
data shape that the review didn't anticipate.

**Risks:** If step 2 fails (e.g., new INSERT violates a CHECK we hadn't
anticipated), the transaction rolls back including step 1's phone release,
returning the child gp to its original (parent-phone) state. Acceptable.

---

## Decision 10: `audit_events.resolved_global_patient_id` is a generated column

**Migration:** mig 111 (empirical reveal during smoke probe iteration)
**Date:** 2026-05-10
**Context:** First mig 111 apply attempt failed at the very first audit
INSERT: *"cannot insert a non-DEFAULT value into column
`resolved_global_patient_id`. Column is a generated column."* Pre-work
verification missed this — the column was not flagged as generated in any
prior memory note, and the column shows as a regular `uuid` column in
`information_schema.columns`'s standard projection.

**Generation expression** (from `information_schema.columns.generation_expression`):

    COALESCE(
      (NULLIF((metadata ->> 'global_patient_id'::text), ''::text))::uuid,
      CASE WHEN (entity_type = 'global_patients'::text) THEN entity_id ELSE NULL::uuid END
    )

So the column auto-resolves from `metadata.global_patient_id` if present,
else falls back to `entity_id` when `entity_type = 'global_patients'`.

**Decision:** Drop `resolved_global_patient_id` from all mig 111 audit
INSERTs; the column is auto-derived. For the dep #1 reconstruction audit,
the auto-derivation produces the new parent gp id (since `entity_id =
v_dep1_guardian_gp` and `entity_type = 'global_patients'`), which is
arguably the right value for "what gp is this audit primarily about".

**Reasoning:** Generated columns are immutable from the application side
by design. Honor the schema.

**Trade-offs accepted:** None. The auto-derivation gives a sensible value
for every audit row mig 111 emits.

**Risks:** This non-obvious schema fact should be captured in
`audits/STATE_OF_WORK.md`'s schema notes section — Phase D's helper-
function audits will hit the same INSERT pattern and need to know.

---

## Decision 11: `sms_reminders` teardown gap surfaced; one-time data hygiene applied

**Migration:** N/A (RLS matrix prep)
**Date:** 2026-05-10
**Context:** First attempt at running `rls_test_teardown()` (the matrix's
pre-flight) failed with FK violation: `sms_reminders.appointment_id` had a
row pointing at the test appointment `00000099-0000-0000-0000-0000000000a0`,
created 2026-05-08 between the run_no=1.6 matrix execution (2026-05-07) and
this Phase B's run_no=2.0 attempt. The SMS-reminder cron picked up the test
appointment between matrix runs and emitted an `sms_reminders` row; the FK
has no `ON DELETE CASCADE`, and `rls_test_teardown` does not currently
clean `sms_reminders` (same class of bug as the audit_events teardown gap
that mig 108 fixed).

**Options considered:**
1. STOP exception #5 surface to Mo: matrix produced FAILs.
2. Investigate, recognize as pre-existing teardown infrastructure gap (not
   a Phase B regression), perform one-time hygiene cleanup of the 1 stale
   row, document, and resume the matrix.
3. Write a mig 113 to extend `rls_test_teardown` (analogous to mig 108).

**Decision:** Option 2 — one-time `DELETE FROM sms_reminders WHERE
appointment_id::text LIKE '00000099%'`; document the recurring vulnerability
as a Phase B follow-up.

**Reasoning:** STOP exception #5 is for "matrix run produces FAILs — schema
additions broke an existing policy." This was neither — it was the teardown
infrastructure failing to clean up between runs, and the cause (SMS-
reminder cron) is unrelated to mig 109/110/111's schema additions. Phase B
authority covers data hygiene for unblocking the matrix; it does not cover
authoring a new mig 113 to fix `rls_test_teardown` (out of scope, like mig
108 was its own work item under Phase F Task 18).

**Trade-offs accepted:** The recurring vulnerability persists post-Phase-B.
Any future matrix run between runs will hit the same blocker if the SMS-
reminder cron has fired in the interim.

**Follow-up tracked for after Phase B:** Author a mig 113 (or equivalent)
that extends `rls_test_teardown` to also DELETE `sms_reminders` rows
referencing test appointments. Alternatively, add `ON DELETE CASCADE` to
`sms_reminders_appointment_id_fkey`. Either approach closes the gap. The
recurring root cause should also be considered: should the SMS-reminder
cron skip rows whose appointment id matches the test pattern
`00000099-%`? That's a separate code change.

**Risks:** Low. The 1-time delete affected only the test appointment
sms_reminder; production sms_reminder rows are untouched (they reference
real-clinic appointment ids).

---

## Decision 12: Mig 112 — grantor ≠ delegate CHECK (Mo's review-additions batch, 2026-05-10)

**Migration:** mig 112 (NEW; the originally-conditional "mig 081 amendment"
mig 112 was skipped per Decision 3, freeing the slot)
**Date:** 2026-05-10 (post-first-Phase-B-surface review)
**Context:** Mo's review of the first Phase B surface caught a schema-
design gap in mig 110. The architectural review §5.3 specifies a two-step
"principal grants; delegate accepts" flow, which presumes grantor and
delegate are different humans. Mig 110 enforces
`delegate_global_patient_id ≠ principal_global_patient_id` (delegate gp
identity ≠ principal gp identity) but does NOT enforce
`granted_by_user_id ≠ delegate_user_id` at the user level. A self-grant
(one user clicking both buttons against their own gp) snuck through. The
gap was masked in mig 110's smoke probe by the single-user staging
fallback path (`v_grantor_user := v_delegate_user`), which permitted
`granted_by_user_id = delegate_user_id`. The fallback was acceptable for
exercising other CHECKs but it actively encoded the missing CHECK as
"acceptable behavior" — Mo caught this on review.

**Decision:** Author mig 112 with single CHECK constraint
`patient_delegations_grantor_not_delegate_chk: granted_by_user_id <>
delegate_user_id`. Smoke probe verifies POS (distinct grantor + delegate)
and NEG (grantor = delegate, expect `check_violation`). Update mig 110's
smoke probe in the same batch: replace the single-user fallback
`v_grantor_user := v_delegate_user` with a graceful skip path
(`RAISE NOTICE` + `RETURN`), mirroring the existing empty-`auth.users`
skip path. Both changes ship in this commit.

**Reasoning:** The CHECK is a small, surgical schema addition that closes
a real privilege-escalation gap (a user could have granted themselves
delegation authority over their own gp via the "wrong" code path). Single
CHECK constraint, no migration smell, immediately enforceable. Sympathetic
mig 110 smoke probe update is required because the previous single-user
fallback would now self-violate the new CHECK; the graceful skip is the
right pattern.

**Pre-condition verified:** `patient_delegations` table is empty on
staging (smoke probes from mig 110 cleaned up after themselves), so the
new CHECK applies cleanly with no backfill risk. 325 auth.users on
staging, well above the 2-user minimum the new probe needs.

**Trade-offs accepted:** None meaningful. The CHECK is strictly more
restrictive; it does not break any production code path because no
production code has yet written to `patient_delegations` (Phase B is
schema-only).

**Risks:** Future Phase E API code must enforce the same invariant at
the application layer (return 400 / forbidden if grantor === delegate
before attempting INSERT) so the user-facing error message is meaningful
rather than a raw `check_violation`. Tracked as a Phase E spec note.

---

## Decision 13: Empirical Lesson #19 codified

**Migration:** N/A (lesson)
**Date:** 2026-05-10 (Mo's addition #2)
**Context:** Mo's review surfaced that the smoke-probe iteration captured
in Decision 8 (the `NOW()` returns transaction-start-time gotcha that
caused mig 110's first apply to fail) is worth promoting from a
phase-internal decision to a project-wide standing rule. Empirical Lesson
#19 codifies the rule with the mig 110 first-apply failure as the
empirical proof, paired with Lesson #2 (smoke-probe assertion discipline).

**Decision:** Append "Lesson 19 (B07 Phase B mig 110 smoke probe iteration,
2026-05-10)" to `audits/EXECUTION_PROMPTS.md`, immediately after Lesson 18.
Same heading style + structure as Lessons 13/16/17/18. Standing rule:
"Any smoke probe testing a `BEFORE UPDATE` trigger on a timestamp column
must seed a historical timestamp at INSERT, then UPDATE, then assert the
trigger advanced the value past the seed."

**Reasoning:** The lesson generalizes beyond Phase B — any future
migration touching trigger-managed timestamp columns will face the same
gotcha. Codifying it in EXECUTION_PROMPTS.md makes it a reviewer
checkpoint for future smoke probes (Lesson #2 is the general rule;
Lesson #19 is the specific failure mode this project has now hit once).

**Trade-offs accepted:** Adds one more lesson to the "Empirical lessons"
section; reviewers must keep more rules in their head. The lesson is
short enough (one rule + one empirical proof + one pairing) that the
cost is small.

**Risks:** None. Lesson docs are passive infrastructure.

---

(Future decisions appended below as they arise during execution.)
