# B07 Phase E execution decisions — 2026-05-10

Live decision log for the Phase E cowork session. Each entry captures a
trade-off the session resolved without escalating to Mo, with reasoning
that ties back to the 20 load-bearing rulings (Phase B 1–17 + Phase C 18–19
+ Phase E 20), the architectural review, and Empirical Lessons #1–#19.

This phase ships:

- `packages/shared/lib/auth/authority.ts` — two helpers
  (`requireAuthorityOver`, `requireCapability`) plus typed errors.
- 9 patient-app endpoints (3 dependents + 6 delegations).
- Modification to `/api/patients/onboard` for `isDependent: true`.
- Cron `apps/clinic/app/api/cron/expire-stale-delegations/route.ts`.
- vercel.json schedule entry.
- Sympathetic doc updates.

Phase E does NOT ship: schema migrations, UI, modifications to Phase C
data layer, modifications to Phase D RLS helpers, RLS policy changes.

────────────────────────────────────────────────────────────────────────

## Decision 1: `requireAuthorityOver` parameter shape

**Phase:** E
**File or section:** `packages/shared/lib/auth/authority.ts` Section 1
**Date:** 2026-05-10
**Context:** The Phase E prompt's pseudo-code declares
`requireAuthorityOver(globalPatientId, context: ApiContext)`. A codebase
survey of `packages/shared/lib/auth/session.ts` shows there is no
`ApiContext` type — handlers call `requireApiRole('patient')` directly and
the underlying `getCurrentUser()` uses `createClient()` to read the cookie.

**Options considered:**

1. Invent `ApiContext` as a wrapper around `AuthUser` for the new helper —
   cons: introduces a one-off type that handlers wouldn't otherwise use;
   pro: matches the prompt's pseudo-code exactly.
2. Drop the context parameter; have `requireAuthorityOver(globalPatientId)`
   call `requireApiRole('patient')` itself — cons: forces every caller into
   the same role check; couples the helper to one role; pro: terse handler
   bodies.
3. Take `(globalPatientId: string, userId: string)` — caller does
   `const user = await requireApiRole('patient')` then
   `await requireAuthorityOver(gpId, user.id)`. Pro: matches the existing
   pattern (handlers resolve auth, then use the resolved user); pro: lets
   the helper be reused from non-patient-role contexts (e.g., a doctor-side
   handler that wants to check authority over a gp the same way).

**Decision:** Option 3 — `(globalPatientId: string, userId: string)`.

**Reasoning:** Lesson #16 — verify against source, not project memory. The
prompt's pseudo-code is a hint, not a contract; the existing pattern in
`patient/sharing/handler.ts` is to resolve the user first and then pass
`user.id` to data-layer functions. Mirroring that here means handlers stay
familiar and the helper becomes more reusable. The prompt allows this kind
of adaptation under the "Push back if anything contradicts the 20 rulings
or the existing patterns" clause; we're not contradicting a ruling, we're
matching the existing convention.

**Trade-offs accepted:** Caller has to do two steps (`requireApiRole` then
`requireAuthorityOver`). Mitigated by the fact that this is the standard
shape across the codebase already.

**Risks:** None substantive — the helper still throws
`AuthorityError(403)` on failure, which is what handlers want.

────────────────────────────────────────────────────────────────────────

## Decision 2: 3 separate queries vs single UNION in `requireAuthorityOver`

**Phase:** E
**File or section:** `requireAuthorityOver` body
**Date:** 2026-05-10
**Context:** The function must determine which of three authority bases
applies (self / guardian_of_minor / delegated_by_principal). The
SQL helper `is_authorized_actor_on(gp, user)` returns BOOLEAN — it does
not surface which branch matched. The prompt says "3 separate queries vs
single UNION query. Choose 3 queries unless cowork session has specific
reason to UNION."

**Options considered:**

1. Three sequential SELECTs, short-circuit on first match — pro: legible,
   each branch is readable in isolation; pro: trivial to extend if
   ever a 4th basis is added (architectural review §3.4 explicitly
   anticipates "caregiver" in Phase 7); con: up to 3 round-trips for the
   delegation branch.
2. Single UNION SELECT returning `(basis, delegation_id)` — pro: 1
   round-trip; con: PostgREST grammar via supabase-js is awkward for
   UNION (would need `.rpc()` to a SQL function or a raw query escape);
   con: harder to reason about which branch matched when debugging.
3. Call the SQL helper `is_authorized_actor_on()` for the boolean check,
   then do a second targeted query only when authorized to determine the
   basis — con: if the helper says TRUE we still need the 3 queries to
   determine which branch, so this is no faster than option 1 in the worst
   case; con: helper-helper double-call is wasteful.

**Decision:** Option 1 — three sequential SELECTs with short-circuit.

**Reasoning:** Phase D-E Decision 6 framing — keep it simple. Self-claim is
the most common case (>90% of patient-app traffic), so the short-circuit
hits early. Guardian and delegation branches are sub-10% combined and
adding a 2nd or 3rd round-trip there is acceptable. UNION via raw SQL
would require an RPC wrapper migration which violates ruling 19 (no new
schema in Phase E). The helper functions exist for RLS-side use; the API
layer can replicate the OR-of-three predicate at the application layer
without changing the database surface.

**Trade-offs accepted:** Worst-case 3 round-trips. Empirically minimal
because the self-claim branch dominates.

**Risks:** Drift between this TS resolution and the SQL helper's predicate
if either changes. Mitigated by the load-bearing rulings 7 and 14 — both
freeze the OR-of-three shape; any future "caregiver" addition would land
as a 4th branch in BOTH places under the same change.

────────────────────────────────────────────────────────────────────────

## Decision 3: `requireCapability` short-circuits self/guardian, RPCs delegation

**Phase:** E
**File or section:** `requireCapability` body
**Date:** 2026-05-10
**Context:** Implicit full capability for self and guardian branches per
Phase D Decision 6 (the prompt's load-bearing rulings call this out: only
`delegated_by_principal` is capability-scoped; self and guardian have full
authority). The SQL helper `delegated_capability_includes()` handles the
delegation case but returns FALSE for self/guardian inputs (those rows
are not in `patient_delegations`).

**Options considered:**

1. Always call `delegated_capability_includes()` regardless of basis — con:
   for self/guardian basis it returns FALSE, which would fail-close
   incorrectly; would have to add a "if basis !== delegated_by_principal,
   skip" guard anyway.
2. Short-circuit on basis: return immediately when basis is `self` or
   `guardian_of_minor`; only call the SQL helper for `delegated_by_principal`
   — pro: matches the architectural model exactly; pro: avoids a needless
   round-trip for the dominant cases.

**Decision:** Option 2 — short-circuit on basis.

**Reasoning:** Architectural review §3.5: "Capability-scoping applies
to delegation only. Self and guardian-of-minor authority is implicitly
full." The TS helper should mirror that semantic. A self-claimed adult
should never be told they lack `view_records` capability over their own
records.

**Trade-offs accepted:** Two code paths in `requireCapability`. Acceptable
— the early-return branch is 1 line.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 4: Error class hierarchy — `AuthorityError`, `CapabilityError`

**Phase:** E
**File or section:** `authority.ts` errors
**Date:** 2026-05-10
**Context:** The codebase has `ApiAuthError extends Error` with a `status:
401 | 403` numeric property and a `toApiErrorResponse(error, fallback)`
helper that maps it to a JSON response. Phase C data-layer errors
(`DelegationAuthorityError`, `DependentNotFoundError`, etc.) extend `Error`
directly and have a `code` string field; route handlers map them to HTTP
codes by `instanceof` checks.

**Options considered:**

1. Make `AuthorityError` and `CapabilityError` extend `ApiAuthError` so
   `toApiErrorResponse` automatically maps them — pro: zero handler
   plumbing; pro: fits the existing 401/403 channel.
2. Make them extend a new base, distinct from data-layer errors —
   con: `toApiErrorResponse` doesn't know about them; every handler has
   to check `instanceof` explicitly.
3. Make them extend `Error` directly with a `code` field, mirroring the
   data-layer pattern — same con as option 2.

**Decision:** Option 1 — both extend `ApiAuthError` with status 403.

**Reasoning:** The semantic is "the authenticated user is not authorized
for this action against this gp" — that's exactly what `ApiAuthError(403)`
encodes. Handlers can use a single `try { ... } catch (e) {
toApiErrorResponse(e, 'fallback') }` pattern that already handles all
auth-layer errors uniformly. Adds no new error-mapping surface.

**Trade-offs accepted:** Errors that bubble through `toApiErrorResponse`
get the message field as-is; we make the messages structured (e.g.,
"Capability not granted: view_records") so the patient-app UI can read
them.

**Risks:** None substantive.

────────────────────────────────────────────────────────────────────────

## Decision 5: Audit emission is data-layer-internal

**Phase:** E
**File or section:** All endpoint handlers
**Date:** 2026-05-10
**Context:** The Phase E prompt enumerates per-endpoint audit emission
(e.g., "Audit emission: action `DELEGATION_GRANTED` via
`emitPatientAuditWithAuthority`"). A read of Phase C data layer code shows
that EVERY state-changing data-layer function already emits its own audit
row internally. The prompt's wording can be read as instructing handlers
to ALSO emit, which would create duplicate audit rows.

**Options considered:**

1. Handlers emit audit rows; data layer also emits — produces double-audit
   rows; clutters the audit table; misleading to downstream readers.
2. Handlers do NOT emit audit rows; rely on the data layer's emission —
   single audit row per state-change; matches the data-layer documentation
   (delegations.ts §"AUDIT EMISSION" header explicitly says "Every
   state-changing function emits exactly one audit row").
3. Handlers emit handler-specific breadcrumb audits with a different
   action name — adds new audit actions; modifies audit.ts; out of scope.

**Decision:** Option 2 — handlers do NOT emit; data-layer is canonical.

**Reasoning:** Phase C established the contract that data-layer functions
own audit emission. Reading dependents.ts and delegations.ts confirms this
is consistent: `createMinorGlobalPatient`, `grantDelegation`,
`acceptDelegation`, `revokeDelegation`, `updateDelegationCapabilities`,
`expireStaleDelegations` all emit. The prompt's per-endpoint audit
language is best read as documenting *what gets emitted* (so the prompt
reader knows what audit rows the endpoint produces), not as instructing
the handler to call `emitPatientAuditWithAuthority` directly. Lesson #1 —
data-layer functions are the single source of truth for state-changes;
handlers translate HTTP to data-layer calls, nothing more.

**Trade-offs accepted:** None — this matches Phase C's intent.

**Risks:** A future change might add a state mutation in the handler that
the data layer doesn't see. Mitigated by keeping handlers thin (no
direct table writes outside the data layer) per the existing convention.

────────────────────────────────────────────────────────────────────────

## Decision 6: Default `expiresAt` for delegations applied at handler

**Phase:** E
**File or section:** `POST /api/patient/delegations` handler
**Date:** 2026-05-10
**Context:** Ruling 20 says default `expiresAt` is 1 year from now; per
Phase C Decision 5 the data layer is policy-free and pass-throughs
undefined as DB NULL. Decision: where does the 1-year default land?

**Options considered:**

1. Apply default in data layer — violates Phase C Decision 5 (data layer
   policy-free).
2. Apply default in handler — matches Phase C Decision 5; matches
   architectural review §5.4 ("handler-side default per architectural
   review §5.4").
3. Apply default at the SQL/DB layer (e.g., trigger) — adds schema
   change; violates ruling 19.

**Decision:** Option 2 — handler applies the 1-year default.

**Reasoning:** Stated in ruling 20 explicitly. Handler computes
`new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()` if
`body.expiresAt` is undefined.

**Trade-offs accepted:** A leap-year edge case — 365 days might land 1 day
short or long depending on the source year. Acceptable for delegation
expiry; not load-bearing.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 7: `revoke` endpoint emits DELEGATION_REVOKED or DELEGATION_WITHDRAWN

**Phase:** E
**File or section:** `PATCH /api/patient/delegations/[id]/revoke` handler
**Date:** 2026-05-10
**Context:** The prompt enumerates `DELEGATION_REVOKED` only. The Phase C
data layer (`revokeDelegation`) auto-detects: if the revoking user is the
delegate it emits `DELEGATION_WITHDRAWN`; if the principal it emits
`DELEGATION_REVOKED`.

**Options considered:**

1. Override the data layer's behavior somehow (not actually possible
   without modifying it).
2. Accept the data layer's discrimination as canonical — the audit log
   will see both action names, which is more informative than a single
   collapsed name.
3. Document the discrepancy and ship with the data-layer behavior.

**Decision:** Option 2/3 — accept data layer's discrimination; document
in Phase E execution log; commit message and STATE_OF_WORK.md note both
action names.

**Reasoning:** The data-layer discrimination is more useful for audit
consumers (a query for "who initiated this delegation revocation" needs
the distinction). The prompt's enumeration of `DELEGATION_REVOKED` is
incomplete, not load-bearing. Lesson #16 — verify against source
(audit.ts already enumerates both), not project memory.

**Trade-offs accepted:** None.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 8: `/api/patients/onboard` dual-path branching shape

**Phase:** E
**File or section:** `packages/shared/lib/api/handlers/patients/onboard/handler.ts`
**Date:** 2026-05-10
**Context:** The existing handler is a doctor/frontdesk-driven endpoint
that calls `onboardPatient` data-layer function (which writes to legacy
`patients` table). For `isDependent: true`, Phase E must:
(a) look up parent gp by `parentPhone`,
(b) call `createMinorGlobalPatient` to insert a minor gp,
(c) skip legacy `patients` row creation entirely.

The data-layer `createMinorGlobalPatient` REQUIRES
`createdByUserId === guardian.claimed_user_id`. The handler caller is
doctor/frontdesk staff, NOT the parent. So the staff member's `auth.uid()`
will NOT match the guardian's claim; the data-layer check fails.

**Options considered:**

1. STOP exception #1 — surface to Mo for ruling on whether to ship a
   separate `/api/patient/dependents/onboard-frontdesk` endpoint or relax
   the data-layer authority check.
2. Use the documented "bridge" pattern (Phase C dependents.ts comment
   line 156): pass `guardian.claimed_user_id` as `createdByUserId`. The
   audit row from the data layer will list the parent as actor; the
   handler adds `metadata.created_via_staff_user_id = staff.user.id`
   and `metadata.created_via = 'frontdesk_onboard'` to record the staff
   actor.
3. Bypass the data-layer function and write to `global_patients` directly
   from the handler — duplicates validation logic; inconsistent with
   Phase C contract.

**Decision:** Option 2 — bridge pattern.

**Reasoning:** Phase C dependents.ts code (line 156) explicitly anticipates
this case: "Frontdesk / clinic-side onboarding flows that register
dependents do so through the patient-app endpoint chain by proxy in MVP;
the createdByUserId is the parent's auth.uid(). Phase E /api/patients/
onboard migration documents the bridge." The bridge is an intentional
Phase C design choice; Phase E ships the documentation/audit-metadata
breadcrumb.

The audit row's `actor_user_id` records the parent (semantically
meaningful: "the parent authored this minor's creation, even though staff
typed it in"). The `metadata.created_via_staff_user_id` records the staff
member for forensic traceability. This is consistent with how MVP
attributes "patient consent" actions when staff types it (the consent
belongs to the patient; the typing is staff-mediated).

**Trade-offs accepted:**
- The audit row does not directly say "staff X registered this minor."
  Mitigated by the metadata key.
- The handler must verify `parent_gp.claimed_user_id IS NOT NULL` before
  calling the data layer — an unclaimed parent gp cannot serve as a
  bridge. The handler returns a structured 400 in that case.

**Risks:**
- Audit-trail readers who don't know about the bridge could misread
  attribution. Mitigated by ARCHITECTURE.md / DECISIONS_LOG.md updates
  documenting the bridge.

────────────────────────────────────────────────────────────────────────

## Decision 9: Cron `expire-stale-delegations` idempotency mechanism

**Phase:** E
**File or section:** `apps/clinic/app/api/cron/expire-stale-delegations/route.ts`
**Date:** 2026-05-10
**Context:** The Phase C `expireStaleDelegations()` data-layer function
emits one `DELEGATION_EXPIRED` audit row per stale grant on EVERY call
without idempotency. Cron runs daily; if the cron runs twice per day (e.g.,
a manual re-trigger), the same grant produces a second audit row.

**Options considered:**

1. Idempotency in data layer — modifies Phase C; violates "do not modify
   Phase C data layer" instruction.
2. Idempotency in cron handler: query `audit_events` for existing
   `DELEGATION_EXPIRED` rows for the same grant on the same calendar day;
   skip emission if found — pro: handler owns the cron-specific concern;
   pro: data-layer remains policy-free.
3. Skip idempotency entirely — accept duplicate rows; a daily-rollup audit
   query can de-dup at read time.

**Decision:** Option 2 — handler-side dedup.

**Reasoning:** The prompt explicitly calls out idempotency as a
requirement ("Idempotency: if a grant has already had a
`DELEGATION_EXPIRED` audit row emitted for the current calendar day, skip
emission"). Implementation: cron handler enumerates expired grants,
checks for same-day audit row per grant, calls
`expireStaleDelegations()` ONLY for grants without a same-day row. The
data-layer function is unchanged; the handler just constrains which
grants reach it.

Wait — that doesn't quite work because `expireStaleDelegations()`
selects all expired grants internally. It would re-emit for the ones the
handler tried to skip.

Refined approach: the handler does its own scan + per-grant audit
emission, NOT calling `expireStaleDelegations()`. It directly:
  (a) selects expired grants,
  (b) for each grant, queries audit_events for same-day
      DELEGATION_EXPIRED for that grant,
  (c) emits via `emitPatientAuditWithAuthority` only for grants without a
      same-day audit row.

This duplicates a few lines of `expireStaleDelegations()` logic in the
cron handler, but it gives the handler full control over per-row
emission. The data-layer function remains available for any non-cron
caller that wants the simpler "emit for all" behavior.

**Trade-offs accepted:** Slight code duplication (handler reimplements
the select-expired logic). Acceptable for clarity.

**Risks:** None substantive.

────────────────────────────────────────────────────────────────────────

## Decision 10: Cron `DELEGATION_EXPIRED` granularity

**Phase:** E
**File or section:** Cron handler
**Date:** 2026-05-10
**Context:** Per expired grant emit one row, OR a single aggregate row?

**Options considered:**

1. Per-grant rows — pro: enables per-grant forensic queries; pro: matches
   the existing `expireStaleDelegations()` data-layer pattern.
2. Single aggregate row with metadata.delegation_ids: [...] — con: harder
   to query "did THIS grant expire?"; con: deviates from data-layer
   shape.

**Decision:** Option 1 — per-grant rows.

**Reasoning:** The data-layer function does per-grant emission; the cron
matches. Phase D-E Decision 6 ("simple is better"): per-grant rows are
trivially queryable; aggregate rows are not.

**Trade-offs accepted:** Audit table grows linearly with delegation
expiry volume. Acceptable — delegations are sparse; expiry events are
rare.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

(Decisions 11+ added as session progresses.)
