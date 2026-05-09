# B07 Architectural Review — Decision Log

**Date:** 2026-05-10
**Companion document:** `audits/B07-architectural-review-2026-05-10.md`
**Authority basis:** Mo's three load-bearing answers (2026-05-09), D-068, REVIEW_CRITERIA.md §1.1/§2.1/§5, Empirical Lessons #1–#18.

This log captures every meaningful trade-off encountered during the B07 architectural review. Threshold per protocol: a decision entry is written when the architectural recommendation has alternatives that a competent senior engineer might reasonably prefer. Some entries record decisions made by the cowork session within authority; others explicitly defer to **Mo's ruling required** because the choice is product-strategic, not implementation-strategic.

---

## Decision 1: Use OR-of-three predicate for authority, not three separate mechanisms

**Section:** 2.4 / 3.1 / 3.4
**Date:** 2026-05-10T morning
**Context:** Mo's three answers describe (a) Pattern A child-linkage, (b) Pattern B adult-delegation, (c) authority delegation as the audit-trail principle. The three are distinct schemas; the question is whether they are also distinct authority checks at every call site, or one helper that absorbs all three.

**Options considered:**
1. **Three call-site checks.** Every API handler / RLS policy explicitly checks self-claim, then guardian-link, then delegation. Maximally explicit; maximally repeated; maximally drift-prone.
2. **Single helper `is_authorized_actor_on(global_patient_id, user_id)` with OR-of-three.** Centralized; testable in isolation; one update site if the predicate evolves.
3. **Two helpers — one for guardian (Pattern A), one for delegation (Pattern B).** Forces call sites to remember "for adults call this, for minors call that." Cognitively expensive.

**Recommendation:** Option 2.

**Reasoning:** D-008 admin-scope reconciliation (135 callsites, eslint-locked discipline) demonstrated that drift across many call sites is a real failure mode in this codebase. A single helper with OR-of-three is the same architectural shape as `can_clinic_access_global_patient` (D-064 helper #2) — already proven in mig 092 and tested in the 177-scenario RLS matrix. Single helper, single test surface, single update site.

**Trade-offs accepted:** The helper's internal complexity grows (three EXISTS clauses); call-site simplicity wins.

**Risks:** RLS recursion if the helper queries `global_patients` while `global_patients` policies invoke the helper. Mitigated by inner DEFINER helper per §3.3 — same pattern as D-064 ruling.

---

## Decision 2: Inner DEFINER + outer INVOKER, extending D-064 to 5 DEFINER + 1 INVOKER

**Section:** 3.3 / 3.4
**Date:** 2026-05-10T morning
**Context:** The helper of Decision 1 must query `global_patients` (for guardian-link check), but the helper is itself called from `global_patients` RLS policies. Direct call recursion. D-064 ruling (memory `project_prompt_06_architecture_rulings`) was "hybrid 3 INVOKER + 1 DEFINER helper." This new helper extends that.

**Options considered:**
1. **Pure SECURITY DEFINER helper.** Bypasses RLS on the lookups (no recursion); but exposes raw row reads if mis-implemented; lacks the "behave as the caller" property D-064 INVOKER mode protects.
2. **Pure SECURITY INVOKER.** No bypass; RLS recursion guaranteed when invoked from `global_patients` policy.
3. **Two-layer (recommended).** Public INVOKER wrapper exposes only a boolean; private DEFINER inner reads raw join keys, never returns row data.

**Recommendation:** Option 3.

**Reasoning:** Mirrors `can_clinic_access_global_patient` (D-064 helper #2) and the can-cross-clinic-read pattern. Public surface is INVOKER (caller-aware); inner is DEFINER (recursion-safe). The boolean-only return of the inner function bounds the leak surface to "is this auth.uid authorized?" — no raw rows escape.

**Trade-offs accepted:** A second function in the schema. Slightly more cognitive load.

**Risks:** DEFINER inner functions historically drift on `search_path` (mig 102/106 forensic-revert is the project's empirical reminder). Mitigation: explicit `SET search_path = public, pg_temp` on the inner function, plus REVOKE FROM PUBLIC + GRANT EXECUTE TO postgres only. The eslint discipline + the forensic-helper-restoration in mig 106 means this has been audited recently.

---

## Decision 3: Place dependent + delegation on `global_patients` v2 layer, not legacy `patients`

**Section:** 1.7 / 2.1 / 4.2
**Date:** 2026-05-10T morning
**Context:** Existing dependent code (mig 030, `parent_phone`, `is_dependent`, `guardian_id`) lives on legacy `patients`. The v2 layer (`global_patients`/PCR) is currently dependent-blind. Two options: extend legacy + keep v2 silent; or build on v2 + treat legacy as a backfill source.

**Options considered:**
1. **Extend legacy.** Cheaper short-term — existing code keeps working, no schema additions on `global_patients`. But Prompt 6.5 will drop legacy patient_id columns (memory `project_clinic_id_rollout_complete`); B07 then needs a re-rebuild.
2. **Build on v2.** New columns on `global_patients`; new `patient_delegations` table; backfill the 3 live legacy dependents. More work upfront, but the build survives Prompt 6.5.
3. **Bridge.** Build on v2 but keep legacy mirroring via mig 081 compat triggers. Bridges the gap until Prompt 6.5.

**Recommendation:** Option 3 (combining 2 + transitional 1).

**Reasoning:** Mo's stated premise (Answer 1) names `global_patients` row + `linked_to_global_patient_id` link — Mo is aligned to the v2 expression. Building anywhere else is short-term shortcut that Prompt 6.5 forces a rebuild on. The bridge keeps existing clinic UI (frontdesk + doctor session forms) working through cutover.

**Trade-offs accepted:** Backfill of 3 live legacy dependents. Compat-trigger logic gains a minor-gp branch.

**Risks:** Compat triggers (mig 081) may need revision to handle minor rows. Mig 081 is INSERT/UPDATE/DELETE on `patients` mirroring to `global_patients` — adding minor logic is a focused mig 081-amendment migration.

---

## Decision 4: Capability tokens (capability-scoped) over blanket delegation

**Section:** 5.2 / 8.4
**Date:** 2026-05-10T morning
**Context:** Pattern B grants the delegate authority over the principal. Authority can be all-or-nothing or scoped.

**Options considered:**
1. **Blanket "act as principal."** Simplest schema (single boolean). Most fragile — if the delegate's account is compromised, so is the principal's full scope.
2. **Capability-scoped.** Each grant lists capability tokens (`view_records`, `consent_to_share`, `book_appointments`, …). Granular; auditable; revocable per-capability; aligns with Mo's case A2 ("manages appointments and prescriptions" — implies a specific subset, not blanket).
3. **Per-action confirmation.** Delegate requests, principal SMS-confirms each action. UX nightmare; not viable for the "manages father's care" usage Mo described.

**Recommendation:** Option 2.

**Reasoning:** D-008 admin-scope discipline is the same architectural pattern (literal-union scopes, eslint-locked). Capability-scoped delegation lets the principal grant just enough authority per delegate. Mo's case A2 explicitly mentions "appointments and prescriptions" — a subset. Blanket grant overshares; per-action UX undershares.

**Trade-offs accepted:** Capability-token list maintenance discipline. The MVP set must be locked early (decision 8 below).

**Risks:** Capability creep — every new feature wonders whether to add a capability. Mitigation: eslint discipline mirroring the admin-scope rule (`AllowedDelegationCapability` literal-union type). Codify at Phase C.

---

## Decision 5: Two-step grant flow (principal grants, delegate accepts)

**Section:** 5.3
**Date:** 2026-05-10T midday
**Context:** Pattern B requires bilateral consent. The schema must distinguish "grant created" from "grant active."

**Options considered:**
1. **One-step.** Principal posts grant; capability is immediately active. Risk: principal can claim someone as their delegate without the delegate's knowledge.
2. **Two-step (recommended).** `accepted_at IS NULL` ⇒ inactive. Delegate must POST accept. Capability enforced only when both timestamps exist.
3. **Three-step (with re-confirmation).** Principal posts, delegate accepts, principal confirms acceptance. Adds friction; no real benefit beyond two-step.

**Recommendation:** Option 2.

**Reasoning:** Two-step is the standard mutual-consent pattern (matches OAuth scope-grant, GitHub repo-collaborator, etc.). One-step is a privacy harm. Three-step is over-engineered.

**Trade-offs accepted:** Delegate must take action before grant is live. SMS deep-link to accept-flow mitigates UX cost.

**Risks:** SMS dispatch failures could leave grants pending indefinitely. Mitigation: cron sweep of stale-pending grants (>30 days unaccepted) emits `DELEGATION_EXPIRED` and re-prompts the principal.

---

## Decision 6: NULL `normalized_phone` for minors (relax NOT NULL)

**Section:** 4.1 / 8.1
**Date:** 2026-05-10T midday
**Context:** Minors have no own phone. The current `normalized_phone NOT NULL` invariant on `global_patients` (mig 073) blocks minor-row creation.

**Options considered:**
1. **NULL phone for minors.** Drop NOT NULL; partial unique index on non-NULL values stays. Quarantine path (mig 076) precedent — sentinel rows already use NULL normalized_phone with `account_status = 'locked'`.
2. **Synthetic discriminator** (e.g., `+201XXXXXXXXX#child001`). Pollutes phone column; SMS dispatch must filter; identity-merge logic (mig 072 dedup) breaks.
3. **Require phone at registration; allow it to be parent's** with a flag. Two minors of same parent collide on UNIQUE.

**Recommendation:** Option 1.

**Reasoning:** Quarantine path precedent. The schema already understands "non-phone-bearing global_patients row." Adding `is_minor` clarifies intent; the NULL-phone semantics are inherited. SMS dispatch already handles NULL phones (drops the message and audits).

**Trade-offs accepted:** A second class of NULL-phone rows on `global_patients`. Mitigation: `is_minor` and `account_status` distinguish minors from quarantined-locked rows.

**Risks:** Existing phone-uniqueness checks may mis-fire if not careful with NULL semantics. Postgres handles `NULL <> NULL` correctly under partial UNIQUE; verify in Phase B.

---

## Decision 7: Defer graduation flow to post-MVP

**Section:** 6 / 8.0 / 10
**Date:** 2026-05-10T midday
**Context:** Graduation (minor → adult, parent's authority transitions to child's own auth.users) is conceptually rich. It introduces audit-rewrite questions (Section 6.2), transition-window questions (6.4), edge cases for mid-care phone-acquisition (6.3).

**Options considered:**
1. **Include in MVP.** Adds 1–2 sessions of work + non-trivial UX. Forces resolution of transition-window question (default 30 days? 0? configurable?).
2. **Defer post-MVP (recommended).** MVP minors stay minors indefinitely; graduation flow is a follow-up workstream after Mo has lived with the dependent feature for a release cycle.
3. **Partial — schema-ready, UI-deferred.** Add the columns / state but no UI flow. Wastes schema cost without product benefit.

**Recommendation:** Option 2. **Mo-ruling required to confirm.**

**Reasoning:** Graduation is product-rich, not architecture-rich. The architectural primitives (auth.uid claim transitions, `is_authorized_actor_on` re-evaluation) are easy. The UX questions (when does child see their own records standalone? what does parent see post-graduation? how is the data history presented?) are best answered after MVP usage informs the questions.

**Trade-offs accepted:** B07 ships incomplete by design. Egyptian context: most pediatric patients age out over years, not weeks; deferring graduation a release cycle is low-cost.

**Risks:** A child reaches 18 during MVP usage. Acceptable workaround: clinic-supervisor manually flips `is_minor = FALSE` and clears `guardian_global_patient_id`; child registers on patient app, claims gp via existing claim flow.

---

## Decision 8: MVP capability set — Mo-ruling required

**Section:** 5.2 / 8.4 / 10 #4
**Date:** 2026-05-10T midday
**Context:** Capability tokens enumerate; MVP set bounds what delegations can do.

**Options considered:**
1. **Minimal:** `view_records`, `receive_notifications`. Cannot satisfy Mo's case A2 (son manages appointments + prescriptions).
2. **Mo's-A2-fitting:** `view_records`, `receive_notifications`, `book_appointments`, `manage_medications`, `consent_to_messaging`. Direct fit to A2's stated needs.
3. **Maximalist:** all capabilities listed in §5.2. More surface area; larger eslint-discipline footprint; more UI surfaces to ship.

**Recommendation:** Option 2.

**Reasoning:** Mo named the case explicitly; the capabilities should match. Excludes `consent_to_share` as the highest-privacy-risk capability (granting cross-clinic access on someone else's behalf) — that one can be post-MVP.

**Trade-offs accepted:** Five capabilities to maintain through Phase C–F. Five UI toggles to ship in the patient-app delegation flow.

**Risks:** `book_appointments` and `manage_medications` cross multiple existing API surfaces (B05's appointment system + Build 03 prescription flows). Phase E API work touches more handlers than Decision 4's option 1 would have.

**Mo-ruling required.** Recommendation provisional.

---

## Decision 9: Polygamous-household pattern — Mo-ruling required

**Section:** 8.7 / 10 #6
**Date:** 2026-05-10T afternoon
**Context:** Egyptian context includes polygamous households (legally recognized, religiously supported). Multiple wives, single husband phone. Each wife's children. The architectural question is whether Pattern A (single guardian) handles, or whether some wives need delegation status.

**Options considered:**
1. **Pattern A only — father is sole guardian.** Operationally wrong: mothers manage their own children's care daily. Forces every interaction through father's auth.uid.
2. **Pattern A (legal guardian = father) + Pattern B (operational delegate = mother).** Mother's auth.uid (her own gp + auth.users via her own phone) is a delegate on each of her children with `view_records`, `book_appointments`, `manage_medications` capabilities. Recommendation.
3. **Multi-guardian schema** (`guardian_global_patient_ids uuid[]`). Architecturally forks Pattern A; many downstream complications.

**Recommendation:** Option 2.

**Reasoning:** The two existing patterns compose. The legal guardian (often father, by Egyptian default) is the Pattern A guardian; the operational caregiver (often mother) is the Pattern B delegate. No new schema concepts. Audit trail records the actor distinct from the guardian basis. Same pattern works for non-polygamous nuclear families: both parents register children on father's gp as guardian; mother gets a delegation. Or vice versa.

**Trade-offs accepted:** A wife in a polygamous household has to be registered separately as a delegate — clinic-side staff or patient-app onboarding flow needs to support "I'm the mother and want to manage my children registered under their father." Adds a flow step.

**Risks:** Cultural sensitivity — "father is the legal guardian" is an Egyptian default, not a universal. Some families may invert. The architectural neutrality of Pattern A (anyone can be the named guardian; Mo can configure default at registration but not enforce) handles this.

**Mo-ruling required.** This is a culturally laden decision; the cowork session does not impose.

---

## Decision 10: `is_authorized_actor_on` chains through guardian's-delegations (max depth 2)

**Section:** 8.8 / 10 #7
**Date:** 2026-05-10T afternoon
**Context:** Authentication recovery for parent-of-minor: parent loses phone; minor's records orphaned. A backup mechanism needed.

**Options considered:**
1. **No-chain.** Helper checks self / guardian-self / self-delegation only. Backup requires explicit "alt guardian" column on minor's gp.
2. **Chain (recommended).** Helper UNIONs four predicates: self ∪ guardian-self ∪ self-delegation ∪ guardian-delegation. Max depth 2 (no recursion beyond delegate-of-guardian). A delegate of the parent (e.g., spouse or trusted family) automatically gains authority over the parent's minor children.
3. **Recursive arbitrary depth.** Allows delegate-of-delegate-of-… chains. Performance risk; abuse vector.

**Recommendation:** Option 2.

**Reasoning:** Composes existing primitives (no new column, no new table). Two extra EXISTS clauses in the helper. Bounds depth at 2 (delegate of guardian — not delegate of delegate). The privacy implication: a parent who grants `view_records` to their spouse implicitly grants the spouse access to the minor children's records; this is the operational expectation for nuclear families and is the right default.

**Trade-offs accepted:** Helper grows to 4 EXISTS clauses (self, guardian, self-delegation, guardian-delegation). Slightly slower; `STABLE` + indexes mitigate.

**Risks:** A principal who delegates `view_records` to a non-family member doesn't anticipate that the delegate also gains access to their minor children. Mitigation: when granting delegation, the patient-app UI shows "this grant also covers: <minor1, minor2, …>" as informed consent.

**Mo-ruling required.** Recommendation provisional. The privacy implication is non-obvious.

---

## Decision 11: Backfill 3 live legacy dependents into v2 schema

**Section:** 4.4 / 9 / 10 #10
**Date:** 2026-05-10T afternoon
**Context:** Legacy `patients` has 3 rows with `is_dependent = TRUE`, 1 with `guardian_id` set. They have no corresponding `global_patients` row (the v2 backfill in mig 073 keyed on `normalized_phone IS NOT NULL`, dependents have NULL normalized_phone in v2 terms).

**Options considered:**
1. **Drop them.** Production data is small; clinic-side users could re-register. Loses clinical history; bad pattern.
2. **Backfill in Phase B mig.** Create minor gps, set `guardian_global_patient_id` from mapping legacy `patients.guardian_id` → `global_patients.id` (via legacy → v2 lineage). Carry clinical-table FKs forward via mig 080's `global_patient_id` column already on those rows.
3. **Punt to Prompt 6.5 cleanup.** Prompt 6.5 already handles legacy column drop; layer the dependent backfill into that workstream.

**Recommendation:** Option 2.

**Reasoning:** Phase B already touches `global_patients`; backfill is one more block of SQL in the same migration. Decoupling to Prompt 6.5 sequences poorly — B07 needs the v2 dependent rows to test against, Prompt 6.5 is downstream. Three rows is small; the backfill SQL is straightforward (subquery joining `patients.guardian_id → guardian's patients.id → guardian's global_patient_id`).

**Trade-offs accepted:** Phase B mig grows by ~30 SQL lines.

**Risks:** Legacy `guardian_id` may point at a `patients` row that itself has no `global_patient_id` (e.g., a non-canonical duplicate from mig 072 dedup). Mitigation: backfill SQL skips minors whose guardian is unresolvable in v2; flags them for manual review. Three rows; expect zero-to-one failures.

**Mo-ruling required:** keep legacy rows intact for compat-trigger continuity (mig 081), or remove on backfill? **Recommendation: keep until Prompt 6.5.**

---

## Decision 12: Audit retention strategy — preserve history immutable

**Section:** 6.2 / 8.5
**Date:** 2026-05-10T afternoon
**Context:** Pre-graduation audit rows show `actor_user_id = parent` with `acting_as = guardian_of_minor`. Post-graduation rows show `actor_user_id = child` with no `acting_as`. The question is whether to preserve as-is or rewrite.

**Options considered:**
1. **Preserve immutable** (recommended). Audit rows record what actually happened; the parent did take those actions. Visual divider in patient-app activity feed at graduation date.
2. **Rewrite ownership.** Update audit rows to `actor_user_id = child`. Falsifies record. Violates D-062 immutability.
3. **Drop pre-graduation rows.** Catastrophic; never.

**Recommendation:** Option 1.

**Reasoning:** D-062 sync-transactional + immutable is the project's audit invariant. Rewrites violate it. The parent did take the actions; the audit record should reflect that. Patient-app UX presents the divider gracefully ("Before you turned 18, your records were managed by your parent").

**Trade-offs accepted:** Patient-app UX must explain the divider. Minor copy / design work.

**Risks:** None architectural; pure UX consideration.

---

## Decision 13: Defer pediatric-dosing safeguards to a sibling clinical workstream

**Section:** 7.4 / 8 / 10 #8
**Date:** 2026-05-10T afternoon
**Context:** Pediatric dosing (block adult-only drugs, suggest age-adjusted dosing) is an obvious pairing with `is_minor` flag exposure but is fundamentally a clinical-safety workstream, not an identity-architecture workstream.

**Options considered:**
1. **Bundle in B07.** Adds 1–2 sessions of clinical-safety work; expands B07 scope.
2. **Sibling B08 / B-clinical-safety workstream.** B07 surfaces `is_minor` to the doctor session UI; B08 implements the safeguards using that flag.
3. **Skip entirely.** Doctors already see patient age; they decide. No automation.

**Recommendation:** Option 2.

**Reasoning:** Scope discipline. B07 is identity / authority architecture. Pediatric dosing is clinical decision support. Bundling lets scope creep into MVP. The architectural prerequisite (the `is_minor` flag, `guardian_global_patient_id`) ships in B07 Phase B; B08 consumes it.

**Trade-offs accepted:** Pediatric dosing arrives later than B07. Acceptable: doctors already see age; safeguards are an enhancement, not a foundation.

**Mo-ruling required.** Confirm scope split.

---

## Decision 14: Single audit-action namespace `GUARDIAN_LINK_*` and `DELEGATION_*`

**Section:** 3.5
**Date:** 2026-05-10T late afternoon
**Context:** Naming the audit actions for the new lifecycle events.

**Options considered:**
1. `GUARDIAN_LINK_*` and `DELEGATION_*` (recommended). Symmetric with existing naming (`SHARE_*`, `PATIENT_*`, `PCR_*`).
2. Verb-first (`LINK_GUARDIAN`, `GRANT_DELEGATION`). Inconsistent with existing rows.
3. Domain-prefixed (`B07_GUARDIAN_LINK_CREATED`, `B07_DELEGATION_GRANTED`). Build-prefix doesn't survive into product.

**Recommendation:** Option 1.

**Reasoning:** Consistent with existing audit-action enum-string convention. `audit_events.action` is text with no CHECK (verified in memory `project_build_04_d7_auth_phone_fix`); the convention is purely social, reinforced by audit-row queries.

**Trade-offs accepted:** None.

**Risks:** None.

---

## Decision 15: Defer custody-dispute / court-order import to post-MVP

**Section:** 8.6 / 10 #5
**Date:** 2026-05-10T late afternoon
**Context:** Disputed custody (divorced parents fighting over child's records) is an edge case. The MVP must accommodate clinical-staff override; full court-order ingestion is post-MVP.

**Options considered:**
1. **MVP: clinic-supervisor override + audit row + reason text.** Operational; clinic staff can already do similar overrides for other major operations.
2. **MVP: two-party acknowledgment (both prior + new guardian must accept).** Doesn't handle uncooperative-prior-guardian; not robust to real disputes.
3. **MVP: court-order document upload via clinic-staff role.** Full lawful path; post-MVP-grade work; ties into a B-legal workstream.

**Recommendation:** Option 1 for MVP, Option 3 deferred to a future B-legal workstream.

**Reasoning:** Custody disputes require human judgment; clinic-supervisor override is the operational reality and is auditable. Court-order ingestion is a heavier compliance feature; ship it when there's volume to justify.

**Mo-ruling required.** Recommendation provisional.

---

## Summary

15 decisions logged. 8 within session authority (1, 2, 3, 4, 5, 6, 11–[backfill mechanic], 12, 14). 7 require Mo's ruling (7, 8, 9, 10, 11–[remove vs keep], 13, 15). All ten "Mo-ruling required" items in Section 10 of the main review are mapped to one or more decisions here.

Decisions 1–6 + 14 are **architectural foundations** the cowork session is confident in. Decisions 7–10, 13, 15 + the keep-vs-remove question on 11 are **product-strategic** and Mo's authority. Mo's ruling on the seven open items unblocks Phase B of the B07 build.
