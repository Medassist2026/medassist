# B07 Phase C Execution Log — 2026-05-09

Phase C of the B07 build (Dependent Accounts: Pattern A child linkage +
Pattern B adult delegation). TypeScript data layer in
`packages/shared/lib/data/`. No schema changes (Phase D), no API handlers
(Phase E), no UI (Phase F-G). Authority: Phase C-E batch prompt
(2026-05-09), operating on top of Phase B commit `6248056` + cleanup
`83bfff5`.

This log captures all meaningful trade-offs encountered during autonomous
execution. Per protocol, only the final surface (commit + decision log +
verification gate state) is shared with Mo for review. Internal
checkpoints during execution did not surface to chat.

Session scope was confirmed up-front: Mo selected "Phase C only this
session" (option 1) to keep Phase D's staging-migration apply atomic in a
fresh session. Phase D (mig 113-116 + RLS matrix re-run) and Phase E (API
handlers + cron + onboard migration) are out of scope here.

---

## Decision 1: Audit module extension shape — additive helper, preserve callers

**File:** `packages/shared/lib/data/audit.ts`
**Date:** 2026-05-09
**Context:** Architectural review §3.4 specifies a new helper
`emitPatientAuditWithAuthority({...})` that wraps existing audit emission
to populate `metadata.acting_as` and `metadata.authority_grant_id`. Phase
C must add this helper without breaking the 30+ existing callers of
`logAuditEvent` across the codebase (every audit-writing data-layer file
imports it).

**Options considered:**
1. **Replace `logAuditEvent`** with the new helper; rename old callers.
   Pros: single audit-emission surface. Cons: breaks every existing
   caller in one PR; Phase C-E batch is data-layer-only and shouldn't
   touch handlers; large blast radius.
2. **Add `emitPatientAuditWithAuthority` as a wrapper** that delegates to
   `logAuditEvent` after stitching the authority metadata keys.
   `logAuditEvent` callers continue to work. New code uses the wrapper
   when the action is on a `global_patient` subject.
3. **Inline the metadata-stitching at every new callsite** (no helper).
   Each new function in dependents.ts / delegations.ts builds its own
   `metadata.acting_as` and calls `logAuditEvent` directly.

**Decision:** Option 2.

**Reasoning:** Architectural review §3.4 explicitly names the helper, so
its existence is part of the canonical surface. Inlining (option 3)
duplicates the stitching logic across 12+ callsites and makes future
changes (e.g., adding `metadata.authority_chain_id` if/when chain depth
opens up) require touching every site. Replacing (option 1) violates the
"data-layer-only" scope of Phase C and conflicts with the architectural
review's stated additive intent.

**Trade-offs accepted:** Two audit-emission surfaces co-exist. New code
should prefer the wrapper for any action with a `global_patient` subject;
existing code is unchanged. A future cleanup pass could migrate the
existing callers, but that's a separate workstream.

**Risks:** A future reader might be confused about which to use.
Mitigated by JSDoc on `emitPatientAuditWithAuthority` and the
"existing callers continue to work without modification" note.

---

## Decision 2: `AuthorityBasis` literal union placement — `audit.ts`, not `delegations.ts`

**File:** `packages/shared/lib/data/audit.ts`
**Date:** 2026-05-09
**Context:** The `AuthorityBasis` type (`'self' | 'guardian_of_minor' |
'delegated_by_principal'`) is consumed by every data-layer module that
emits an audit on a `global_patient` subject — dependents.ts (audit
basis = 'guardian_of_minor'), delegations.ts (basis = 'self' or
'delegated_by_principal'), and Phase E API helpers
(`requireAuthorityOver` returns the basis). It is NOT consumed by
delegation-specific code only.

**Options considered:**
1. Place `AuthorityBasis` inside `delegations.ts` next to
   `ALLOWED_DELEGATION_CAPABILITIES`. Pros: keeps B07-specific types in
   B07-specific file. Cons: dependents.ts and audit.ts both import from
   delegations.ts, which is semantically backwards (dependents.ts has no
   delegation concern; it just emits audits).
2. Place `AuthorityBasis` inside `audit.ts` next to `ActorKind` and the
   `AuditAction` enum. Pros: lives next to the helper that consumes it
   (`emitPatientAuditWithAuthority`). Audit-related types co-located.
   Cons: audit.ts grows to host a B07-specific concept.
3. Create a new types-only module `packages/shared/lib/data/authority.ts`.
   Pros: clean separation. Cons: third file for a type that's also
   plumbed through the helper signature; over-engineered for one type.

**Decision:** Option 2.

**Reasoning:** The audit module is the natural home for "metadata key
shapes" — `ActorKind` lives there for the same reason. `AuthorityBasis`
is fundamentally a metadata-key value. Phase E's
`requireAuthorityOver` will re-export the type from
`authority.ts` (the auth helper module) and import it from `audit.ts` —
single source of truth.

**Trade-offs accepted:** `audit.ts` now contains a B07-specific type.
Acceptable: the file is the project's "every metadata key is documented
here" canonical reference.

**Risks:** None.

---

## Decision 3: `AllowedCapability` enforcement — TS literal union + runtime Set

**File:** `packages/shared/lib/data/delegations.ts`
**Date:** 2026-05-09
**Context:** Mo ruling 4 + Phase C-E prompt §"Mo's load-bearing rulings"
specify the 5 MVP capability tokens (no `consent_to_share`). The
architectural review §5.2 calls for "eslint-locked literal-union pattern
à la D-008 admin-scope discipline." Static-string discipline is the
project standard for any tokenized scope.

Phase C must defend the enum at three layers per the architectural
review and the Phase C-E prompt:
- **Compile time** (TypeScript literal union)
- **Lint time** (sibling eslint rule — Decision 9 below)
- **Runtime** (a `Set.has` check at the data-layer boundary)

**Options considered:**
1. TS literal union ONLY. `validateCapabilities` is unnecessary; TypeScript
   already enforces it. Pros: simplest. Cons: any `as AllowedCapability[]`
   or `as any` cast in API handler bodies bypasses enforcement; we've seen
   this happen with admin scopes (D-008's runtime warning is the post-hoc
   defense for that exact failure mode).
2. TS literal union + runtime `Set.has` validation in
   `validateCapabilities` called by every state-changing function.
   Pros: defense-in-depth; surfaces typed `InvalidDelegationError` for
   API handlers to map to 400. Cons: tiny duplication (the literal
   union and the runtime Set carry the same source of truth).
3. Runtime ONLY (no TS literal union). Pros: no duplication. Cons:
   surrenders compile-time enforcement; reverses the D-008 trajectory
   (which is moving FROM runtime checks TO compile-time literal unions).

**Decision:** Option 2.

**Reasoning:** D-008 Amendment 2026-05-08 Phase 2 (current state) keeps
the runtime warning in createAdminClient as a defense-in-depth signal
during the transition to Phase 3 (full literal-union refactor). Phase C
mirrors that posture: compile-time + lint-time + runtime all locked.
Option 1 alone is fragile against `as` casts which are common in API
handler boundaries.

**Trade-offs accepted:** A new capability requires updating two
locations (the `as const` literal and the runtime Set, though the Set
is derived from the literal so it's effectively one). The eslint rule
parses the literal at lint-load time, so it's also automatically synced.

**Risks:** None substantial.

---

## Decision 4: `grantDelegation` capabilities default `[]` — Mo ruling 18

**File:** `packages/shared/lib/data/delegations.ts`
**Date:** 2026-05-09
**Context:** Mo ruling 18 (Phase C-E prompt) sets the default capability
set on grant creation to empty `[]`. The architectural review §5.2 had
recommended `['view_records', 'receive_notifications']` as a "lowest-
power useful default"; Mo overrode to empty set, requiring an explicit
post-grant `updateDelegationCapabilities` call to add power.

**Decision:** TypeScript signature uses `capabilities?: readonly
AllowedCapability[]`; when undefined, the function inserts `capabilities`
= `[]` into the DB. The two-step grant-then-accept flow plus a third
capability-assignment step is the intended design.

**Reasoning:** Direct application of Mo's ruling. Document inline in the
file header so future readers know the architectural-review default was
overridden.

**Trade-offs accepted:** A common UX flow (grant + assign capabilities)
will require two separate API calls (POST + PATCH). Phase E API handler
can compose them in a single endpoint internally if Mo wants a different
UX, but the data-layer surface is two distinct functions.

**Risks:** None.

---

## Decision 5: `expiresAt` default at data layer — pass-through, no business default

**File:** `packages/shared/lib/data/delegations.ts`
**Date:** 2026-05-09
**Context:** Architectural review §5.4 recommends `NOW() + interval '1
year'` as the default `expires_at` at grant time. The Phase C-E prompt's
data-layer signature for `grantDelegation` lists `expiresAt?: string` as
optional (no default specified).

**Options considered:**
1. Apply the 1-year default at the data layer (when `args.expiresAt` is
   undefined, set DB value to `NOW() + 1y`). Pros: matches architectural
   review verbatim. Cons: data layer encodes a business policy that the
   API handler may want to override (e.g., a 30-day post-graduation
   delegation per architectural review §6.4).
2. Pass through (undefined/null at the TS layer → NULL in the DB). Phase
   E API handler is responsible for applying the 1-year default before
   calling the data layer. Pros: data layer is policy-free; API handler
   owns business defaults. Cons: every API handler must remember to apply
   the default; risk of inconsistency across endpoints.

**Decision:** Option 2.

**Reasoning:** Aligns with the broader "data layer is pass-through; API
handler is policy" pattern (e.g., `patient-shares.ts` `createShare`
takes `defaultExpiryDays?: number` and passes it through; the 90-day
default is in the API handler). The 1-year default is documented in the
JSDoc with a pointer to architectural review §5.4 so Phase E knows where
to apply it.

**Trade-offs accepted:** Phase E must apply the default explicitly at
the `POST /api/patient/delegations` handler. Tracked as Phase E design
note in this log; the API handler test plan (Phase H) will verify.

**Risks:** A Phase E author might miss the JSDoc and ship a handler that
silently inserts NULL `expires_at` (= no expiry) when the body omits it.
Mitigated by the audit metadata: `DELEGATION_GRANTED` records
`expires_at` directly, so a NULL stands out in audit log review.

---

## Decision 6: Defense-in-depth authority checks at the data-layer boundary

**File:** `packages/shared/lib/data/delegations.ts`,
`packages/shared/lib/data/dependents.ts`
**Date:** 2026-05-09
**Context:** Phase E will introduce `requireAuthorityOver` /
`requireCapability` helpers that gate every state-changing endpoint by
calling `is_authorized_actor_on()` (Phase D mig 113). The data-layer
functions in Phase C are designed to be called only after that gate has
already passed — but should they re-check at the function boundary?

**Options considered:**
1. **Trust the API gate; data layer does no authority check.** Pros:
   simplest; avoids duplicate work. Cons: any internal call from a
   non-API context (e.g., a future cron job, a CLI tool) could write
   without the gate; the data layer becomes implicitly trusted.
2. **Defense-in-depth: data layer re-validates the actor's authority
   before mutating.** For grantDelegation: `grantedByUserId` must equal
   the principal's `claimed_user_id`. For revokeDelegation: actor must
   be the principal OR the delegate. For createMinorGlobalPatient:
   `createdByUserId` must equal the guardian's `claimed_user_id`.
   Pros: data layer is internally trustable. Cons: every state-changing
   function does an extra SELECT of `global_patients.claimed_user_id`.
3. **Mixed: check at writes, trust at reads.** Reads (`listDependentsByGuardian`,
   `getDependent`, list-granted/received) accept user ids and either
   filter by them (lists) or accept them as documentary parameters
   (`getDependent`). Writes do the full check.

**Decision:** Option 3.

**Reasoning:** Reads are inherently filtered by the user-id parameter
(the function returns only what that user could see anyway), so the
authority check is structural. Writes are the failure-cost-asymmetric
operations — a leaked write privilege (e.g., wrong `revokingUserId`) is
much more damaging than a leaked read privilege at a function whose
caller already filtered to the legitimate user. The defense-in-depth
pattern matches `phone-changes.ts` (which re-validates patient/staff
identities at the data-layer boundary).

**Trade-offs accepted:** Each write does +1 SELECT of
`global_patients.claimed_user_id`. Cheap (indexed column, single-row
lookup); negligible cost.

**Risks:** A future API handler that bypasses `requireAuthorityOver` and
passes the wrong `actorUserId` will be caught by the data-layer check
and surface a `DelegationAuthorityError` / `GuardianAuthorityError`.
Phase E handlers map these to 403.

---

## Decision 7: Idempotency on `acceptDelegation`, `revokeDelegation`, `updateDelegationCapabilities`

**File:** `packages/shared/lib/data/delegations.ts`
**Date:** 2026-05-09
**Context:** D-068 / Build 05 mig 090 established idempotency as the
default for `revokeShare` and similar lifecycle transitions. Should
delegations follow the same pattern?

**Decision:**
- `acceptDelegation` on already-accepted grant → no state change, NO
  audit row written. Returns success.
- `revokeDelegation` on already-revoked grant → no state change, NO
  audit row written. Returns success.
- `updateDelegationCapabilities` with a capability set equal to the
  existing set → no state change, NO audit row written. Returns success.

**Reasoning:** Matches D-068 pattern. Audit-row idempotency (skip the
emission on no-op) is important: re-running the same lifecycle command
should not generate spurious audit noise. The audit invariant from D-062
(transactional with state change) is preserved — if no state change,
no audit.

**Trade-offs accepted:** A caller cannot distinguish "first revoke" from
"second revoke" via the function's return value (both are `void`).
Acceptable because the API handler can SELECT the row first if it needs
to surface "already revoked" to the user.

**Risks:** None. The DB CHECK constraints (revoke_consistency_chk) hold
across no-op paths.

---

## Decision 8: `expireStaleDelegations` — audit-only, no row mutation

**File:** `packages/shared/lib/data/delegations.ts`
**Date:** 2026-05-09
**Context:** Mig 110's `patient_delegations_revoke_consistency_chk`
requires `revoked_by_user_id` to be NOT NULL when `revoked_at IS NOT
NULL`. A system-driven cron expiry has no acting user. The mig design
matches `patient_data_shares` which avoided the same issue by having
`is_authorized_actor_on()` test `expires_at` directly without requiring
the row to be mutated to "revoked" state.

**Options considered:**
1. **Sentinel "system" user in `auth.users`.** Set
   `revoked_by_user_id = <system user id>`. Pros: row state explicitly
   reflects expiry. Cons: requires a schema migration to create the
   sentinel user; out of scope for Phase C-E (Mo ruling 19 — no new
   schema except Phase D's RLS migs).
2. **NULL the constraint somehow.** E.g., make
   `revoked_by_user_id` default to a magic value. Cons: schema change.
3. **Treat `expires_at` as the de-facto inactive signal.** Don't mutate
   the row; emit audit only. The Phase D helper function
   `is_authorized_actor_on()` already tests `expires_at IS NULL OR
   expires_at > NOW()`, so an expired-but-not-revoked grant is correctly
   rejected by authority checks. Mirrors `patient_data_shares`'
   `expire-stale-shares` cron approach.

**Decision:** Option 3.

**Reasoning:** Aligns with Mo ruling 19 (no new schema). Aligns with
D-068's expire-stale-shares pattern. The audit row is the durable
record; the DB row state remains as `revoked_at IS NULL` because
`expires_at` is the authoritative "is this active" signal in the
`is_authorized_actor_on()` predicate.

**Trade-offs accepted:** A reader of the `patient_delegations` table
who looks only at `revoked_at` (not `expires_at`) would think an
expired grant is still active. Mitigated by:
- Helper function `is_authorized_actor_on()` correctly tests both columns.
- All read functions (`listGrantedDelegations`, `listReceivedDelegations`)
  return all columns; UI must render `expires_at` for a complete picture.
- The `DELEGATION_EXPIRED` audit row is queryable.

**Risks:** Phase E cron handler must implement idempotency via
`metadata.cron_run_id` (otherwise daily runs would emit duplicate
audit rows for the same expired grant). Tracked as a Phase E spec note.

**Follow-up:** Phase E cron handler should query
`audit_events WHERE action='DELEGATION_EXPIRED' AND
metadata->>'delegation_id' = <id>` before emitting, OR maintain a
`metadata.last_expired_audit_at` timestamp on the row. Recommend the
audit-event-query pattern for consistency with the audit-as-state-of-
record approach.

---

## Decision 9: Sibling eslint rule, not extension of admin-scope rule

**File:** `eslint-rules/no-unregistered-delegation-capability.js`
(new)
**Date:** 2026-05-09
**Context:** Phase C-E prompt offers two options for the eslint
enforcement: extend `no-unregistered-admin-scope` to also handle
delegation capabilities, OR create a sibling rule
`no-unregistered-delegation-capability`.

**Options considered:**
1. **Extend `no-unregistered-admin-scope`.** Pros: one rule. Cons: the
   rule's name no longer matches its scope; future readers asking
   "what does the admin-scope rule do?" would be surprised by the
   capabilities check; mixing concerns reduces auditability.
2. **Sibling rule `no-unregistered-delegation-capability`.** Pros: clean
   separation; rule name matches scope; auditability preserved. Cons:
   second rule to maintain (small cost — both rules share the
   parse-from-source pattern; one canonical implementation).

**Decision:** Option 2 (sibling).

**Reasoning:** The admin-scope rule has a single load-bearing concern
(static-string discipline on `createAdminClient` callsites). Phase C's
delegation-capability discipline is a separate concern with its own
allowed set, its own AST trigger surfaces (Property nodes with key
`capabilities`/`capability`, plus `requireCapability` calls), and its
own error messages. Conflating them obscures both.

**Trade-offs accepted:** Two rules, both wired into `lint:scopes` script
in package.json + .eslintrc.json. Standard plugin pattern.

**Risks:** None.

---

## Decision 10: Eslint rule trigger surfaces — Property + CallExpression

**File:** `eslint-rules/no-unregistered-delegation-capability.js`
**Date:** 2026-05-09
**Context:** The rule must catch:
- Object property: `{ capabilities: ['view_records', ...] }` and
  `{ capability: 'view_records' }`
- Function call: `requireCapability(globalPatientId, 'view_records')`
  (Phase E auth helper's second arg)

**Decision:** Two AST visitor surfaces:
1. `Property` nodes with `key.name === 'capabilities'` (array value)
   or `key.name === 'capability'` (string value). Skip computed and
   shorthand keys.
2. `CallExpression` nodes calling `requireCapability` (callee name match;
   handles both `Identifier` and `MemberExpression` callees). Second
   arg is the capability token.

For each match site, three checks:
- String literal in allowed set → OK
- String literal NOT in allowed set → unregisteredCapability error
- TemplateLiteral (backticks) → templateLiteral error
- Anything else (Identifier, CallExpression, MemberExpression, etc.) →
  nonLiteral error

**Reasoning:** Mirrors `no-unregistered-admin-scope` rule structure
exactly. The Property surface is the highest-value enforcement target
for Phase C since the data-layer / API handler call sites pass
capabilities array via destructured object args. The CallExpression
surface anticipates Phase E `requireCapability` introduction so that
Phase E doesn't need an eslint rule update.

**Trade-offs accepted:** The rule does NOT inspect non-array values
assigned to a `capabilities` key (e.g., `{ capabilities: someVariable }`)
— TypeScript catches that via the literal-union typing. The rule's
remit is the static-string discipline at literal sites; type discipline
is tsc's job.

**Empirical verification:** Tested via temp file
`/tmp/stray-cap-test.ts` against the rule:
- `'consent_to_share'` (excluded per Mo ruling 4) → caught.
- `'unknown_token'` (typo) → caught.
- backtick template literal `` `tpl_lit` `` → caught.
- `'view_records'` (valid) → passed.

**Risks:** A clever caller could construct a runtime-built capability
string and pass it as a non-Property non-CallExpression context (e.g.,
`grantDelegation({ capabilities: someFn() })`). TypeScript catches this
via the literal-union return-type discipline; the eslint rule does not.
Acceptable: the type discipline is the load-bearing layer.

---

## Decision 11: Sex normalization — accept lowercase, store capitalized

**File:** `packages/shared/lib/data/dependents.ts`
**Date:** 2026-05-09
**Context:** Phase C-E prompt's signature for `createMinorGlobalPatient`
specifies `sex?: 'male' | 'female'` (lowercase). The
`global_patients_sex_check` CHECK requires
`sex IN ('Male','Female','Other','prefer_not_to_say')` (capitalized).
The existing `frontdesk.ts` and adult-onboarding flows store capitalized.

**Options considered:**
1. Accept lowercase per prompt; store capitalized via `normalizeSex` helper.
2. Reject lowercase; force callers to pre-capitalize. Pros: less data-
   layer policy. Cons: contradicts prompt signature; UX inconsistency
   with existing flows that may pass lowercase.
3. Accept either case; normalize internally. Pros: tolerant. Cons:
   loosens TS enforcement.

**Decision:** Option 1.

**Reasoning:** Prompt is explicit about TS signature shape. DB CHECK
is explicit about storage shape. The data layer bridges the two with a
small named helper (`normalizeSex`). Future capabilities ('other',
'prefer_not_to_say') can be added to the literal-union when Mo extends
the surface.

**Trade-offs accepted:** A literal union of two cases is narrower than
the DB CHECK's four cases; UI surfaces that need 'Other' or
'prefer_not_to_say' will require the function signature to be widened.
Acceptable for MVP per Phase C-E prompt's narrow signature spec.

**Risks:** None substantial.

---

## Decision 12: Typed error classes for all data-layer functions

**File:** `packages/shared/lib/data/dependents.ts`,
`packages/shared/lib/data/delegations.ts`
**Date:** 2026-05-09
**Context:** Existing data-layer files use a mix of generic `throw new
Error(...)` and typed error classes. `phone-changes.ts` uses
`PhoneChangeError` class with a `code` property; `patient-shares.ts`
uses generic `throw new Error(...)`. Phase E API handlers must map
data-layer errors to HTTP status codes; the more discrimination at
the boundary, the cleaner the handler.

**Decision:** Typed error classes per concern:
- `DependentNotFoundError` (404)
- `GuardianAuthorityError` (403)
- `InvalidDependentError` (400)
- `DelegationNotFoundError` (404)
- `DelegationAuthorityError` (403)
- `InvalidDelegationError` (400)

Each has a static `code` field for discriminated unions.

**Reasoning:** Matches `phone-changes.ts` precedent (most recent
data-layer addition in the repo). Phase E API handlers do
`if (err instanceof DependentNotFoundError) return 404` cleanly.

**Trade-offs accepted:** Six classes; small surface. Could be
collapsed to two (`PatternAError`, `PatternBError`) but discrimination
on the wire is clearer with named types.

**Risks:** None.

---

## Decision 13: `getDependent` `requestingUserId` — accept-but-unused

**File:** `packages/shared/lib/data/dependents.ts`
**Date:** 2026-05-09
**Context:** Phase C-E prompt's signature for `getDependent` includes
`requestingUserId: string`, with the comment "authorization checked via
`is_authorized_actor_on()` helper (Phase D)." But the current Phase C
data layer doesn't yet have the helper (Phase D ships it), and the
function's authorization is structurally satisfied by the Phase E
`requireAuthorityOver` gate which the API handler runs before calling
the data-layer function.

**Options considered:**
1. Drop `requestingUserId` from the signature. Pros: no unused param.
   Cons: violates the prompt-specified signature; Phase E API handler
   would need a different shape.
2. Keep `requestingUserId` per prompt; mark as intentionally unused
   (TypeScript `void` cast) with a JSDoc explaining the contract.
3. Use `requestingUserId` for an internal authority check (mirroring
   Decision 6 defense-in-depth). Pros: belt-and-suspenders. Cons:
   requires the Phase D helper to exist (it doesn't yet); a manual
   re-implementation of `is_authorized_actor_on` in TypeScript would
   diverge from the SQL helper and create the very source-of-truth
   problem D-064 was designed to avoid.

**Decision:** Option 2.

**Reasoning:** The prompt's signature is canonical for Phase E API
handler ergonomics. The parameter is documentary in Phase C — Phase E
will use it for breadcrumb metadata or future runtime enforcement. The
`void requestingUserId` line suppresses the unused-param lint without
false-flagging the parameter as truly unused.

**Trade-offs accepted:** Future readers may wonder why the parameter
exists; the JSDoc explains. When Phase D mig 113 ships, a follow-up
could add `await isAuthorizedActorOn(minorGlobalPatientId,
requestingUserId)` as defense-in-depth — tracked as a phase D-or-E
follow-up.

**Risks:** None.

---

## Decision 14: `transferGuardianship` MVP authority gate — previous-guardian-only

**File:** `packages/shared/lib/data/dependents.ts`
**Date:** 2026-05-09
**Context:** Mo ruling 5: custody-dispute mechanism is Phase 2. The
Phase C data layer must accommodate `transferGuardianship` as a
function (per architectural review §3.5 audit lifecycle table) but
should not implement the contested-custody flow.

**Decision:** MVP gate: only the previous guardian (claimed_user_id of
the existing `guardian_global_patient_id`) may initiate the transfer.
A clinic-supervisor override flow (which Mo ruling 5 defers to Phase 2)
would be a separate function `transferGuardianshipBySupervisor`
authored in Phase 2 if/when Mo opens the workstream.

Orphaned minors (where the previous guardian's gp was deleted, ON
DELETE SET NULL fired, leaving `guardian_global_patient_id IS NULL`)
cannot be transferred under MVP — no previous guardian to authorize.
The function rejects with `GuardianAuthorityError`. Phase 2 clinic-
supervisor flow is the recovery path.

**Reasoning:** Direct application of Mo ruling 5. The data layer ships
forward-compatible (no schema, no API change required when Phase 2
opens the supervisor path) but does not invent authority for the MVP.

**Trade-offs accepted:** No UX call invokes this function in MVP. The
function is "schema accommodation" only. Acceptable per Phase C-E
prompt §scope ("schema accommodates this even if no UX uses it MVP").

**Risks:** A bug or test that calls `transferGuardianship` with a
non-previous-guardian actor will surface a `GuardianAuthorityError` —
expected behavior; flagged as such in JSDoc.

---

## Decision 15: Two-step gp lookup in `listDependentsByGuardian`, not nested join

**File:** `packages/shared/lib/data/dependents.ts`
**Date:** 2026-05-09
**Context:** Listing all minors whose guardian is `guardianUserId`
requires walking from `auth.users.id → global_patients.claimed_user_id
→ global_patients.id → (other) global_patients.guardian_global_patient_id`.

**Options considered:**
1. **Nested PostgREST join.**
   `.from('global_patients').select('...,!guardian_global_patient_id_fkey(*)')`
   — but this requires self-referential FK syntax that PostgREST handles
   awkwardly.
2. **Single SQL via `.rpc()` to a SECURITY DEFINER function.** Cleaner
   for clinic-app heavy reads. Cons: requires a new SQL function (mig);
   out of scope for Phase C (no schema migrations).
3. **Two-step: SELECT guardian gp ids, then SELECT minors.** Pros:
   PostgREST-native; type-safe; explicit semantics. Cons: 2 round-trips
   (negligible for typical N=1 guardian gps).

**Decision:** Option 3.

**Reasoning:** Aligns with the "data layer is pure pass-through, schema
changes are Phase D's domain" scope discipline. Two round-trips at the
data layer is acceptable; the typical user has 1 guardian gp, so the
first SELECT returns 1 row.

**Trade-offs accepted:** Minor overhead per call. Negligible.

**Risks:** None.

---

## Decision 16: Admin scope namespace — `dependents-*` and `delegations-*`

**File:** `packages/shared/lib/supabase/admin.ts`
**Date:** 2026-05-09
**Context:** D-008 admin-scope discipline requires every
`createAdminClient(scope)` call to pass a string literal in
`ALLOWED_ADMIN_SCOPES`. Phase C adds 12 new callsites across
dependents.ts and delegations.ts.

**Decision:** Namespace by feature with a hyphenated suffix
identifying the operation:
- `dependents-create`, `dependents-list-by-guardian`, `dependents-get`,
  `dependents-transfer-guardian`, `global-patients-guardian-lookup`
- `delegations-grant`, `delegations-accept`, `delegations-revoke`,
  `delegations-update-capabilities`, `delegations-list-granted`,
  `delegations-list-received`, `delegations-expire-stale`

**Reasoning:** Matches existing naming convention (e.g.,
`patient-shares-create`, `patient-shares-extend`,
`patient-shares-list-grantee`). Each scope corresponds 1:1 to a data-
layer function for clean audit-trail correlation.

**Trade-offs accepted:** 12 new entries in `ALLOWED_ADMIN_SCOPES`. The
file is the project's known place for this; growing it is the
intentional path.

**Risks:** None.

---

## Decision 17: Sympathetic doc updates scoped to data-layer concerns

**File:** Phase C-E prompt §"Sympathetic doc updates"
**Date:** 2026-05-09
**Context:** Phase C-E prompt enumerates sympathetic doc updates after
all three phases ship. Phase C alone touches data layer + ESLint, no
schema, no migrations. Which doc updates belong to Phase C?

**Decision:** Phase C scope:
- `DECISIONS_LOG.md` D-008 amendment: capability literal union joins
  the family of eslint-locked tokens.
- `audits/STATE_OF_WORK.md`: Phase C lifecycle Active → Completed-as-
  phase-c.
- `audits/PROGRAM_STATE.md`: B07 Phase C complete; awaiting Mo review
  before Phase D.

Phase D scope (deferred to Phase D session):
- ARCHITECTURE.md §3 mig count update + §8.6 migration timeline rows
  for migs 113-116.
- DECISIONS_LOG.md D-064 amendment: 5 DEFINER + 1 INVOKER (the new
  `is_authorized_actor_on` helper).
- DECISIONS_LOG.md D-068 amendment: delegation audit metadata adopts
  the same acting_as / authority_grant_id keys.
- audits/rls-test-matrix-reconstructed.sql: header re-run note.

Phase E scope (deferred to Phase E session):
- Authority helper documentation.
- Cron registration in vercel.json.
- Endpoint-level ARCHITECTURE.md updates if any.

**Reasoning:** Each phase owns the docs it directly affects. Phase C
ships data-layer code only — the architecture stays the same; the
migration count is unchanged; D-064 is unchanged (no new DEFINER
helpers in Phase C); D-068 is unchanged at this layer.

**Trade-offs accepted:** Three sets of doc updates instead of one big
batch at Phase E close. Acceptable: each phase's commit is
self-contained.

**Risks:** None.

---

## Verification gate state at Phase C close

| Gate | Status | Notes |
|------|--------|-------|
| `tsc --noEmit` (root) | PASS clean | No errors |
| `tsc --noEmit` (apps/clinic) | PASS clean | No errors |
| `tsc --noEmit` (apps/patient) | PASS clean | No errors |
| `lint:scopes` | PASS clean | New rule + extended scope set both wire correctly |
| `npm run build:clinic` | DEFERRED (Mac-side) | Sandbox 45s timeout blocks Next builds |
| `npm run build:patient` | DEFERRED (Mac-side) | Sandbox 45s timeout blocks Next builds |

Pure data-layer change with zero new routes / components / server-
client boundaries — `next build` failure modes are TypeScript-
deduplicated by the three tsc gates already passing. The build gates
should pass clean on Mac-side; documenting the deferral so Mo can run
them as the final pre-push step.

**Empirical verification of the new eslint rule** (run via temp file
on 2026-05-09):
- `'consent_to_share'` (excluded per Mo ruling 4) → caught (unregisteredCapability)
- `'unknown_token'` (typo) → caught
- backtick template literal → caught (templateLiteral)
- `'view_records'` (valid) → passed silently

(End of Phase C decision log. Future decisions appended below if any.)
