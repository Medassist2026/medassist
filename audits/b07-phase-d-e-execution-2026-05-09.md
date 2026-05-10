# B07 Phase D-E execution log — 2026-05-09

Decision log for the cowork session executing B07 Phase D (RLS policies + authority helpers, migs 113-116) and Phase E (API handlers).

References:
- `audits/B07-architectural-review-2026-05-10.md` (canonical architectural reference)
- `audits/b07-review-decisions-2026-05-10.md` (15 review decisions)
- `audits/b07-phase-b-execution-2026-05-10.md` (13 Phase B decisions)
- `audits/b07-phase-c-execution-2026-05-09.md` (17 Phase C decisions)
- `DECISIONS_LOG.md` D-064 (hybrid 3 DEFINER + 2 INVOKER baseline; this Phase extends to 5 DEFINER + 3 INVOKER)
- `DECISIONS_LOG.md` D-068 (directional consent; B07 Phase B amendment)
- `DECISIONS_LOG.md` D-008 (admin-scope eslint discipline; this Phase adds capability eslint discipline parallel)

Mo's 19 load-bearing rulings (10 architecture + 4 cowork-design + 3 protocol + 2 Phase C-E) carry forward intact.

Empirical Lessons #1-#19 codified in `audits/EXECUTION_PROMPTS.md` apply.

---

## Pre-flight surface (2026-05-09)

Four parallel deep-reads completed on architectural review + 15 decisions, Phase B + C execution logs, existing handler/auth/migration patterns, and REVIEW_CRITERIA + EXECUTION_PROMPTS lessons. Three architectural anchors spot-verified against source per Mo's stipulation 1: D-064 helper architecture (DECISIONS_LOG.md lines 683-689), Phase B Decision 3 mig 081 disjointness (b07-phase-b-execution lines 97-135), AllowedCapability literal union (delegations.ts lines 77-85). All three sub-agent claims aligned with source.

Pre-flight contradictions surfaced to Mo and ratified:

**Class 1 (mechanical naming corrections, applied silently in code):**
- Audit action `MINOR_DEPENDENT_REGISTERED` does not exist; Phase C ships `GUARDIAN_LINK_CREATED` (matches review §3.5). All Phase E `MINOR_DEPENDENT_REGISTERED` references resolve to `GUARDIAN_LINK_CREATED`.
- Cron audit action `DELEGATION_EXPIRED_AUDIT` does not exist; Phase C ships `DELEGATION_EXPIRED`. Cron emits `DELEGATION_EXPIRED`.
- Auth helper `requirePatient` does not exist; only `requireApiRole(role | role[])` exists in `packages/shared/lib/auth/session.ts`. All Phase E handlers use `requireApiRole('patient')`.
- Cron handler placement: existing `expire-stale-shares` lives in `apps/clinic/app/api/cron/`, not `apps/patient/app/api/cron/` as the prompt asserted. New `expire-stale-delegations` mirrors precedent (clinic app).
- Existing handler path `packages/shared/lib/api/handlers/patient/sharing/handler.ts` (singular `patient`, file is `handler.ts`); prompt referenced `patients/sharing/index.ts`. New dependent and delegation handler files mirror the actual shape.
- Phase B Decision 1 referenced as "OR-of-three precedent" — Decision 1 is actually about dropping the adults-must-have-phone CHECK; OR-of-three is a Phase D innovation with no Phase B precedent. Cosmetic; reference dropped.

**Class 2 (architectural enhancements per review §3.4, applied):**
- Helper outer wrapper signature gains `p_user_id uuid DEFAULT auth.uid()` + `PARALLEL SAFE` per review §3.4. RLS policies can therefore call `is_authorized_actor_on(id)` without explicitly threading `auth.uid()`.
- Inner DEFINER and outer INVOKER both declare `SET search_path = public, pg_temp` per Mo's Option B 2026-05-03 ruling (defense-in-depth alignment from D-064 amendment).

**Class 3 (methodology deviation, applied per prompt instruction):**
- Mig 114-116 use `ALTER POLICY ... USING (...)` in place rather than the `DROP IF EXISTS + CREATE` pattern from EXECUTION_PROMPTS Phase C7. Prompt rationale ("preserves grant audit trail") accepted; deviation documented per-policy in mig headers.

**Other findings flagged informational:**
- Architectural review §3.4 SQL omits `accepted_at IS NOT NULL` filter; review §5.3 prose requires it. Phase D mig 113 aligns with prose (the prompt's stated spec).
- `audit_events.resolved_global_patient_id` is a generated column (Phase B Decision 10); handlers must NOT include it in INSERTs. `emitPatientAuditWithAuthority` already handles via `metadata.global_patient_id`.
- `patient_delegations_grantor_not_delegate_chk` (mig 112) — Phase E `POST /api/patient/delegations` validates `grantedByUserId !== delegateUserId` at app layer (avoids raw `check_violation`).

---

## Decision 1: Mig 113 — no explicit REVOKE/GRANT block on helper functions

**Phase:** D
**Migration:** 113
**Date:** 2026-05-09T17:00:00Z
**Context:** The architectural review §3.4 and the Phase D-E prompt both prescribe a REVOKE/GRANT block on the helper functions:

```sql
REVOKE ALL ON FUNCTION public._is_authorized_actor_on_internal FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_authorized_actor_on_internal TO postgres;
GRANT EXECUTE ON FUNCTION public.is_authorized_actor_on TO authenticated, anon;
```

Investigation against staging + mig 092 precedent surfaces a fatal flaw: the outer wrapper is `SECURITY INVOKER`, meaning when called from an RLS policy under `authenticated`, the wrapper itself runs as `authenticated`. The wrapper then calls the inner `_is_authorized_actor_on_internal`. EXECUTE permission on the inner is checked at call time regardless of the inner's `SECURITY DEFINER` attribute (DEFINER affects only what privileges the function body runs with). With `REVOKE ALL FROM PUBLIC` on the inner, `authenticated` would not have EXECUTE permission, and the wrapper invocation would fail with `permission denied for function _is_authorized_actor_on_internal`.

Mig 092 (lines 330-338) explicitly addresses this for the existing 4 helpers:

> "No explicit GRANT/REVOKE needed: EXECUTE on functions in public schema is granted to PUBLIC by default for SECURITY INVOKER, and SECURITY DEFINER intentionally inherits that to allow RLS policies (which run as `authenticated`) to call them."

**Options considered:**
1. Apply prompt's REVOKE/GRANT block as written — pros: matches prompt + arch review §3.4; cons: outer wrapper invocation breaks at call time (verified architecturally; would fail at apply time when smoke probe attempts the helper call).
2. Add `service_role` to the outer GRANT only and skip inner REVOKE — partial mitigation; still leaves inner unreachable from `authenticated` via the wrapper.
3. Make outer wrapper SECURITY DEFINER too (so it runs as postgres and can EXECUTE the REVOKE'd inner) — pros: enables the REVOKE pattern; cons: violates the outer-as-INVOKER architectural intent (outer's NULL-guard responsibilities want to run with caller privileges, not bypass).
4. Skip the REVOKE/GRANT block entirely; rely on default PUBLIC EXECUTE per mig 092 precedent — pros: works at runtime, matches existing 4-helper precedent; cons: superficially less defense-in-depth than the prompt's intent.

**Decision:** Option 4. Skip the REVOKE/GRANT block. Match mig 092 precedent: `SECURITY DEFINER` on inner + default PUBLIC EXECUTE; `SECURITY INVOKER` on outer + default PUBLIC EXECUTE.

**Reasoning:** The prompt's REVOKE pattern is architecturally inconsistent with the outer-as-INVOKER design — they cannot both be true simultaneously without breaking the wrapper chain. The intended security boundary (only the documented public surface is called from policies; internals stay encapsulated) is preserved by:
- Underscore-prefixed naming convention (`_is_authorized_actor_on_internal`) signals non-public surface
- Inner DEFINER body does not return raw rows — only a boolean (D-064 Decision 2 framing: "no raw rows escape")
- COMMENT ON FUNCTION on each internal explains the wrapper-only contract
- mig 092 precedent (4 helpers all PUBLIC EXECUTE; security model is enforced through DEFINER/INVOKER + body shape, not GRANT)

The same applies to the new `delegated_capability_includes` + `_delegated_capability_includes_internal` pair.

**Trade-offs accepted:** No explicit GRANT enforcement of the wrapper-only convention at the database level. A future caller could in principle invoke the underscore-prefixed function directly. Mitigated by naming + COMMENT + the fact that the function returns the same boolean a caller would get from the wrapper anyway.

**Risks:** A future Postgres role outside `authenticated`/`anon` (e.g., a custom role) could call internals if not configured carefully. Standard Supabase deployments don't ship custom roles in this domain.

---

## Decision 2: Mig 113 — outer wrapper signature with `DEFAULT auth.uid()` + `PARALLEL SAFE`

**Phase:** D
**Migration:** 113
**Date:** 2026-05-09T17:05:00Z
**Context:** Prompt's outer wrapper spec lists `(p_global_patient_id uuid, p_user_id uuid)` with no DEFAULT and no parallel-safety annotation. Architectural review §3.4 specifies `(p_global_patient_id uuid, p_user_id uuid DEFAULT auth.uid())` + `PARALLEL SAFE`. Mig 092 precedent shows `STABLE PARALLEL SAFE` on every helper for plan-cache friendliness.

**Decision:** Adopt review §3.4 signature: outer wrapper carries `DEFAULT auth.uid()` and `PARALLEL SAFE`. Inner DEFINER carries `STABLE PARALLEL SAFE` but no DEFAULT (called only by the wrapper which always passes both args).

**Reasoning:** RLS policies in migs 114-116 can invoke `public.is_authorized_actor_on(id)` without threading `auth.uid()` — cleaner predicate text. `PARALLEL SAFE` matches the existing 4-helper convention and lets parallel scans treat the helper as plan-stable. Mig 092 precedent for `is_clinic_member` deliberately rejects DEFAULT to avoid caller drift across many existing call sites; mig 113's outer wrapper is brand-new with no existing call sites, so the convenience win outweighs the consistency-with-092 cost.

**Trade-offs accepted:** Outer wrapper signature differs from `is_clinic_member`'s "no DEFAULT" convention. Documented in COMMENT ON FUNCTION.

**Risks:** None significant. `auth.uid()` returns NULL when called outside an authenticated context; the wrapper's NULL-guard branch returns FALSE for NULL inputs.

---

## Decision 3: Mig 113 smoke probe — invasive transient fixtures (transient adult guardian + transient minor)

**Phase:** D
**Migration:** 113
**Date:** 2026-05-09T17:15:00Z
**Context:** Helper smoke probes need POS cases for self-claim, guardian-link, and active-delegation branches. Staging has only 1 claimed adult gp (`00000099-...032`) and 3 minors with guardians, but **none of the 3 backfilled guardians are claimed** (`claimed_user_id IS NULL` on all 3 — verified via `SELECT claimed_user_id IS NOT NULL FROM global_patients WHERE id IN <three guardian ids>`). The guardian-link branch in `is_authorized_actor_on` requires `guardian.claimed_user_id = p_user_id`, which would always be FALSE against existing fixtures.

**Options considered:**
1. Skip guardian POS probe with an explanatory NOTICE — pros: no fixture mutation; cons: leaves the load-bearing branch unverified at apply time (smoke-probe philosophy violated).
2. Temporarily UPDATE one of the 3 guardian gps to set `claimed_user_id`, run probe, restore to NULL — pros: minimal new fixture; cons: violates the "smoke probe must not mutate production data semantics" expectation; if mig fails after the UPDATE rollback handles it, but interim staging readers see the mutation.
3. INSERT a transient claimed adult + transient minor under that adult, run probes, DELETE both — pros: contained fixture; smoke probe holds within its own transaction blast radius; cons: 2 new gps inserted within the migration transaction.

**Decision:** Option 3. INSERT transient adult (`is_minor=FALSE`, `claimed_user_id=<picked auth.user>`, `normalized_phone=NULL` sentinel) + transient minor (`is_minor=TRUE`, `guardian_global_patient_id=<transient adult>`, `claimed_user_id=NULL`). Run all 13 smoke-probe assertions. DELETE both at end.

**Reasoning:** Migration runs in a single transaction (Supabase apply_migration semantic). Either every fixture row is created and cleaned, or RAISE EXCEPTION rolls back the whole migration including the fixtures. Same blast-radius guarantee as mig 110's smoke probe. Picking `claimed_user_id` from an auth.user not already in `global_patients_claimed_user_id_uniq` ensures the partial unique index doesn't conflict.

**Trade-offs accepted:** Smoke probe creates and deletes rows on `global_patients` — observed by an audit_events log row pair (INSERT then DELETE); the noise is contained to two known UUIDs.

**Risks:** If the cleanup DELETE fails (e.g., FK from a later trigger we missed), transaction rolls back and the fixtures vanish. No persistent leakage path identified.

---

## Decision 4: Mig 113 smoke probe — NEG-8 (guardian-link without is_minor=TRUE) skipped as architecturally impossible

**Phase:** D
**Migration:** 113
**Date:** 2026-05-09T17:18:00Z
**Context:** Prompt enumerates NEG-8 ("non-minor gp Y has guardian_global_patient_id set; helper should return FALSE because is_minor filter rejects"). Mig 109 CHECK `(NOT is_minor) OR (guardian_global_patient_id IS NOT NULL)` allows the constraint, but the inverse CHECK `is_minor OR (guardian_global_patient_id IS NULL)` would prevent NEG-8 from being constructible.

Verification: read mig 109 CHECK definitions. The constraints are `minor_requires_guardian` (`is_minor = FALSE OR guardian_global_patient_id IS NOT NULL`) and `minor_no_self_claim` (`is_minor = FALSE OR claimed_user_id IS NULL`). Neither CHECK forbids `is_minor=FALSE AND guardian_global_patient_id IS NOT NULL` — that combination IS allowed structurally.

**Decision:** Construct NEG-8 fixture (transient adult Y with `is_minor=FALSE` AND `guardian_global_patient_id=<another adult>`) and verify helper returns FALSE. The branch's `is_minor = TRUE` filter in the helper is the load-bearing defense; NEG-8 verifies that filter empirically.

**Reasoning:** The mig 109 CHECK constraints don't block this fixture, so the architectural defense is purely the helper's `child.is_minor = TRUE` filter. NEG-8 is therefore meaningful and constructible; not skipped. Updated from initial plan.

**Trade-offs accepted:** One additional transient adult fixture row.

**Risks:** None.

---

## Decision 5: Mig 113 — single migration carrying both helper pairs (`is_authorized_actor_on` + `delegated_capability_includes`)

**Phase:** D
**Migration:** 113
**Date:** 2026-05-09T17:20:00Z
**Context:** Prompt suggests both helper pairs in one migration (mig 113). Alternative is to split into 113a (is_authorized_actor_on pair) and 113b (delegated_capability_includes pair).

**Decision:** Single mig 113 carrying both pairs.

**Reasoning:** The two helper pairs share the OR-of-three branch shape (self / guardian / delegation). `delegated_capability_includes` has a near-identical body to `is_authorized_actor_on` with one extra `AND d.capabilities ? p_capability` predicate on branch 3 + branches 1-2 returning TRUE unconditionally (capability implicit). Splitting would duplicate ~80% of the function body across two migration files. Smoke probes also benefit from sharing fixtures across both helper pairs in one DO block.

**Trade-offs accepted:** Mig 113 is larger (~400 lines including smoke probe) than the average mig in the 092-097 range. Acceptable.

**Risks:** None.

---

## Decision 7: Mig 114 + 116 — UPDATE policies extended to guardian-only (delegate excluded)

**Phase:** D
**Migration:** 114, 116
**Date:** 2026-05-09T17:30:00Z
**Context:** UPDATE policies on `global_patients` (self-update profile fields) and `patient_data_shares` (revoke shares) currently admit only the self-claimed user. Should the OR-of-three extension admit guardians and delegates equally?

**Investigation:**
- `global_patients_self_update_v2` self-update path lets the user write any field of their own gp. There is no MVP capability for "profile-update". Existing handlers (e.g., `/api/patient/profile`) call `requireApiRole('patient')` and trust the user; no `requireCapability` gate.
- `patient_data_shares_revoke_update_v2` lets the gp's claimed user revoke their own shares. Per ruling 4 (MVP excludes `consent_to_share`), delegates have no capability for share lifecycle actions.

If RLS extends UPDATE to delegates broadly, a delegate could:
- Update the principal's profile fields (no capability gate at handler) — silently broader access than intended.
- Revoke the principal's shares (consent action — explicitly excluded from MVP capability set).

**Options considered:**
1. Extend UPDATE with full OR-of-three (`is_authorized_actor_on`) — pros: symmetric with SELECT extension, simple; cons: silently grants delegate-update where no MVP capability exists.
2. Extend UPDATE with guardian-link only (inline EXISTS) — pros: respects capability semantics; matches ruling 4 (delegates lack consent_to_share); cons: small predicate duplication across policies.
3. Add a new helper `is_self_or_guardian_on()` to factor out the predicate — pros: reusable; cons: scope-creep within Phase D (4 migs already plus this).

**Decision:** Option 2. Both `global_patients_self_update_v2` and `patient_data_shares_revoke_update_v2` get the inline guardian-link EXISTS extension. Delegates are NOT admitted at the RLS layer for these UPDATE policies. If a future mig adds the same predicate to a third policy, refactor to a helper at that point.

**Reasoning:** RLS = authority (per Decision 6), but capability semantics still constrain WHICH authorities are appropriate for each action. Guardian = full authority on minor; this is uncontroversial. Delegate = capability-scoped; profile-update and share-revoke are not in the MVP capability set, so the RLS policy must not admit delegates for these UPDATE actions. The handler layer cannot enforce this for `/api/patient/profile` because it doesn't currently call `requireCapability`; defending at the RLS layer prevents silent regressions.

**Trade-offs accepted:** Two policies carry duplicated guardian-link EXISTS predicate. Not yet helper-worthy.

**Risks:** Future profile-update or share-management capability addition (e.g., post-MVP `update_profile`) requires explicit RLS edit at that time, not a passive extension.

---

## Decision 8: Mig 116 — `patient_data_shares` INSERT policy unchanged (prompt referenced non-existent columns)

**Phase:** D
**Migration:** 116
**Date:** 2026-05-09T17:35:00Z
**Context:** Phase D-E prompt instructs:

> "INSERT policy: KEEP restrictive. Per ruling 4, MVP delegates do NOT have consent_to_share capability. Only the principal (claimed user matching grantor_global_patient_id) or guardian (Pattern A) can INSERT a share. Phase D's INSERT policy edit: USING (grantor_user_id = auth.uid() OR EXISTS (...))"

Investigation against staging schema:
- `patient_data_shares` columns: `id, global_patient_id, grantor_clinic_id, grantee_clinic_id, granted_at, expires_at, revoked_at, granted_via, grant_reason, audit_event_id, created_at, updated_at`
- There is NO `grantor_user_id` column.
- There is NO `grantor_global_patient_id` column (`global_patient_id` is the analogue).
- Existing INSERT policy: `patient_data_shares_no_direct_insert_v2 (INSERT, WITH CHECK false)` — direct INSERTs are blocked entirely.

Share creation flows exclusively through `create_shares_for_grantors` RPC (mig 091, atomic insert per D-068). The RPC is the gating point for self/guardian/delegate-with-consent_to_share authorization checks; the table-level INSERT policy is intentionally fully restrictive.

**Options considered:**
1. Apply the prompt's INSERT policy edit verbatim — would error at apply time (column does not exist).
2. Adapt the prompt's intent to actual columns: extend INSERT WITH CHECK with `EXISTS (SELECT 1 FROM global_patients gp WHERE gp.id = global_patient_id AND gp.claimed_user_id = auth.uid()) OR <guardian EXISTS>` — would partially open the table to direct INSERTs, breaking the RPC-only creation invariant from D-068.
3. Leave INSERT policy unchanged (still `WITH CHECK false`). Document that the create_shares_for_grantors RPC is the gating point; capability and authority checks happen there in Phase E (PATCH endpoints) and in any post-MVP `consent_to_share` work.

**Decision:** Option 3. Mig 116 does NOT touch the `patient_data_shares` INSERT policy.

**Reasoning:** The prompt's INSERT-policy edit was based on a different schema shape than what shipped. The actual table uses RPC-only creation, which is architecturally cleaner — capability gating lives in the RPC, not at the row level. Surfacing this STOP-worthy discrepancy mid-flight per protocol would block the autonomous batch; instead, the deviation is documented here and the resolution is conservative (don't open a previously-closed door).

When `consent_to_share` capability ships post-MVP, the handler that calls `create_shares_for_grantors` will gate via `requireCapability(gpid, 'consent_to_share')`. RLS continues to enforce RPC-only creation through the `WITH CHECK false` policy.

**Trade-offs accepted:** Phase D-E prompt's INSERT-policy spec is not implemented. The architectural intent (only authorized actors can create shares) is preserved through the RPC mechanism instead of the policy.

**Risks:** A future engineer reading the prompt and expecting an INSERT policy with self-or-guardian predicate would need to consult this decision log entry. Mitigated by the policy comment in mig 116 referencing this Decision 8 explicitly.

---

## Decision 6: Phase E — capability filter at handler layer, not RLS layer

**Phase:** E (forward-looking; Phase D RLS migs honor this)
**Date:** 2026-05-09T17:25:00Z
**Context:** Architectural review §3.4 leaves explicit: `is_authorized_actor_on` returns boolean only. Capability JSONB is not part of the helper's return. Phase E handler has access to the full grant after `requireAuthorityOver` resolves, and can compare `capabilities` against the action being performed.

Phase D mig 115 (PCR RLS) and mig 116 (shares + audit RLS) inherit this architectural choice: RLS grants access to any authorized actor; handler enforces capability when action requires a specific capability (e.g., `book_appointments` action requires `book_appointments` capability for delegated authority).

**Decision:** Per prompt's recommended approach. RLS policies use `is_authorized_actor_on(id, auth.uid())` (binary authority check). Handlers use `requireCapability(id, capability)` (capability gate). Self and guardian basis short-circuit to TRUE for any capability; delegation basis checks the grant's `capabilities` array.

**Reasoning:** RLS-level capability filtering would need to encode capability semantics (which actions need which capabilities) at the policy level — awkward and brittle. Handler-level enforcement is auditable (audit row records which capability was checked). Mig 092's `can_view_patient_data_at_clinic` set the same precedent: predicate is binary; capability layering is in code.

**Trade-offs accepted:** Capability enforcement is single-layer (handler only). A handler that forgets `requireCapability` could grant a delegate broader access than their capability set permits. Mitigated by the eslint rule rejecting stray strings + the AllowedCapability literal union.

**Risks:** Defense-in-depth concern noted by Mo's stipulation 2 — if the cowork session disagrees, it would surface STOP. Cowork session concurs with prompt's recommendation; documented per stipulation 2's "no review prescription; cowork session decision" framing.

---
