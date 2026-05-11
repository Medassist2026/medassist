# B07 Phase F.5 execution decisions — 2026-05-10

Live decision log for the Phase F.5 cowork session. Each entry captures a
trade-off resolved without escalating to Mo, with reasoning tied back to
the 28 load-bearing rulings (20 backend Phase B/C/E + 6 UI Phase F + 2
Phase F.5).

Phase F.5 closes Phase F findings #1, #3, #7, #8 and re-enables the
deferred caregiver grant form (Phase F Decision 6 reversed; Mo ruling 27
+ Phase F.5 prompt authorize the re-enablement). Schema unchanged; RLS
unchanged; no graduation logic. Builds on Phase B/C/D/E/F (commits
`6248056`/`9d91375`/`4842018`/`8cd485f`/`8a1895e`).

Phase F.5 ships:

- Cross-context API extensions on ~16 patient endpoints (Section 1)
- POST /api/patient/lookup-by-phone (Section 2)
- PATCH /api/patient/dependents/[id] (Section 3)
- Delegation list display-name JOIN (Section 4)
- Caregiver grant form re-enabled (Section 5)
- PatientHeader leadingAction prop + AccountSwitcher persistence on all
  patient pages (Section 6)

Phase F.5 does NOT ship: schema migrations, RLS policy changes,
`consent_to_share` capability (still post-MVP per ruling 4), graduation
logic, clinic-app changes (Phase G).

────────────────────────────────────────────────────────────────────────

## Decision 1: Cross-context resolution via a shared helper, not inline per-handler

**Phase:** F.5
**File or section:** `packages/shared/lib/auth/patient-context.ts` (new)
**Date:** 2026-05-10
**Context:** Section 1 extends ~16 existing endpoints with a `?gpId=<id>`
query parameter pattern. The pattern is identical across endpoints: parse
the param, validate UUID, call `requireAuthorityOver`, resolve the gp's
`claimed_user_id` to the legacy `patients.id`, fall back to `user.id` when
no param. Two implementation shapes considered.

**Options considered:**

1. Inline the 5-6 lines of resolution logic in every handler. Pro: each
   handler is self-contained. Con: ~16x duplication; a future change to
   resolution semantics requires hunting through all callers.
2. Extract into a shared helper `resolvePatientContext(request, user)`
   returning `{ resolvedPatientId, basis, gpId, isMinor }`. Pro: single
   source of truth; consistent error shape; easy to extend (e.g., add
   capability check parameter). Con: one more import per handler.
3. Make `requireAuthorityOver` itself return the claimed_user_id when
   present. Pro: minimal new surface. Con: violates the helper's single
   purpose (authority resolution, not patient-id mapping); breaks the
   semantic clarity established in Phase E.

**Decision:** Option 2 — extract a `resolvePatientContext` helper.

**Reasoning:** ~16 handlers × 5 lines = ~80 lines of duplicated logic.
The shared helper consolidates UUID validation, authority check, minor
case handling, and `patients.id` mapping in one place. Future Phase G
work that needs to handle minor data via PCR bridging changes the helper
and inherits everywhere.

**Trade-offs accepted:** A small extra import per handler. The helper's
return shape becomes load-bearing — adding fields requires sweeping all
callers. Mitigated by typing the return shape as a stable interface.

**Risks:** None — the helper is application-layer; no schema or RLS impact.

────────────────────────────────────────────────────────────────────────

## Decision 2: Minor case (claimed_user_id NULL) returns empty data, not 404 or 400

**Phase:** F.5
**File or section:** All Section 1 endpoint refactors + helper return shape
**Date:** 2026-05-10
**Context:** Clinical tables (`patient_medical_records`, `appointments`,
`prescriptions`, etc.) FK to legacy `public.patients(id)`. The 1:1
convention: `public.patients.id = auth.users.id` for self-claimed adults.
A minor gp has `claimed_user_id IS NULL` and therefore NO corresponding
`patients.id` — no clinical records exist for minors via the legacy table.

A user who switches AccountSwitcher to a minor dependent and visits
`/patient/health` hits the records endpoint with `?gpId=<minorGpId>`. The
handler resolves the gp, finds `claimed_user_id IS NULL`, and must decide
how to respond.

**Options considered:**

1. Return 400 "Minor records not available via patient app — see clinic"
   — honest but jarring UX (the user just switched context expecting to
   see something).
2. Return 404 — wrong status code (the gp does exist; the records
   collection is just empty).
3. Return 200 with empty arrays/objects — UI shows "no records yet"
   placeholder; consistent with how an adult patient with zero records
   would render.

**Decision:** Option 3 — empty data for minors.

**Reasoning:** Phase G will plumb clinic-side minor records via the PCR
(`patient_clinic_records`) bridge. Until then, minors have no clinical
data in patient-app-readable tables. Returning empty data matches the
"no records yet" state any new adult patient has — same UX, same UI
codepath. The audit basis still records `guardian_of_minor` for the
attempt, so security audit captures the access.

**Trade-offs accepted:** A guardian who switches to a minor sees empty
records pages everywhere. The Phase F dependent-detail page already
warns "عرض السجلات بالنيابة قيد التطوير" so users have context. Phase G
closes this for real once clinic-side minor PCR creation is wired.

**Risks:** None — defensible MVP behavior; no data leak.

────────────────────────────────────────────────────────────────────────

## Decision 3: Patient-id mapping via `global_patients.claimed_user_id` (legacy 1:1 convention)

**Phase:** F.5
**File or section:** `resolvePatientContext` helper
**Date:** 2026-05-10
**Context:** The legacy schema convention is `public.patients.id =
auth.users.id` (1:1 mapping for self-claimed adult patients). Clinical
tables FK to `public.patients(id)`. The B07 `global_patients` table sits
alongside this with its own UUID (different from auth.users.id) plus a
`claimed_user_id` column that references `auth.users.id`.

So to query clinical data for a non-self gp:
- gp → `global_patients.claimed_user_id` → equals `patients.id` for that
  person (by legacy convention) → use that as the `patient_id` filter.

This works for adults (delegation case). It does NOT work for minors —
covered by Decision 2.

**Options considered:**

1. Map via `claimed_user_id`. Pro: matches the existing legacy
   convention; no schema work. Con: minors have NULL claim and need the
   separate empty-data path.
2. Migrate clinical tables to FK on `global_patients.id` instead. Pro:
   minors and adults unified. Con: out of scope (no schema changes in
   F.5); cross-cutting migration; orchestrated alongside Phase G.
3. Bridge via `patient_clinic_records` (PCR). Pro: clean semantic
   (PCR.global_patient_id = subject). Con: PCR is per-clinic; querying
   `patient_medical_records` by PCR-rowset requires multi-clinic join;
   not how legacy tables are structured.

**Decision:** Option 1 — `claimed_user_id` mapping.

**Reasoning:** Minimal surface change; works for the adult delegation
case (the primary cross-context use case per Mo's case A2: adult son
manages adult father's appointments). Minor case is handled separately
(Decision 2). Schema migration (Option 2) is a Phase G+ concern.

**Trade-offs accepted:** Minors get empty data until Phase G ships.
Acceptable per Decision 2 reasoning.

**Risks:** None — the legacy 1:1 convention is established and the
patient onboarding flow upholds it (verified empirically in Phase B
work).

────────────────────────────────────────────────────────────────────────

## Decision 4: Read endpoints use `requireAuthorityOver`; write endpoints with capability semantics use `requireCapability`

**Phase:** F.5
**File or section:** Per-endpoint capability decisions table (Section 1)
**Date:** 2026-05-10
**Context:** Phase E established that authority resolution and capability
gating are distinct concerns:
- `requireAuthorityOver` answers "does this user have *any* authority?"
- `requireCapability` answers "does this user's authority include this
  specific power?"

For Section 1, every endpoint needs authority resolution (so cross-context
queries don't leak data). Write endpoints additionally need capability
gating so a delegate without (say) `manage_medications` cannot log
medication intake on the principal's behalf.

**Per-endpoint capability decisions (Section 1):**

| Endpoint                                | Method | Auth gate           | Capability (delegate path) |
|-----------------------------------------|--------|---------------------|----------------------------|
| /api/patient/records                    | GET    | requireAuthorityOver| (none — read)              |
| /api/patient/records                    | POST   | requireCapability   | view_records (self+guardian only effectively; delegates need write power — but architectural review §5.3 marks `view_records` as read-only capability; POST records is the patient adding their own; we keep this self-only for delegate path — i.e. delegate cannot POST records, return 403 if basis='delegated_by_principal' regardless of capability)|
| /api/patient/appointments               | GET    | requireAuthorityOver| (none)                     |
| /api/patient/prescriptions              | GET    | requireAuthorityOver| (none)                     |
| /api/patient/health-summary             | GET    | requireAuthorityOver| (none)                     |
| /api/patient/vitals                     | GET    | requireAuthorityOver| (none)                     |
| /api/patient/visits                     | GET    | requireAuthorityOver| (none)                     |
| /api/patient/immunizations              | GET    | requireAuthorityOver| (none)                     |
| /api/patient/lab-results                | GET    | requireAuthorityOver| (none)                     |
| /api/patient/medications                | GET    | requireAuthorityOver| (none)                     |
| /api/patient/medications/[id]           | GET    | requireAuthorityOver| (none)                     |
| /api/patient/conditions                 | GET    | requireAuthorityOver| (none)                     |
| /api/patient/allergies                  | GET    | requireAuthorityOver| (none)                     |
| /api/patient/notes                      | GET    | requireAuthorityOver| (none)                     |
| /api/patient/diary                      | GET    | requireAuthorityOver| (none)                     |
| /api/patient/medication-reminders       | GET    | requireAuthorityOver| (none)                     |
| /api/patient/medication-intake          | GET    | requireAuthorityOver| (none — view)              |
| /api/patient/medication-intake          | POST   | requireCapability   | manage_medications         |
| /api/patient/sharing                    | GET    | requireAuthorityOver| (none)                     |
| /api/patient/sharing/[shareId]/extend   | POST   | requireCapability   | (delegate rejected — `consent_to_share` is post-MVP; self+guardian only) |
| /api/patient/sharing/[shareId]/revoke   | DELETE | requireCapability   | (delegate rejected — same as extend) |
| /api/patient/messaging-reconsent        | POST   | requireCapability   | consent_to_messaging       |
| /api/patient/messages                   | GET    | requireAuthorityOver| (none — view)              |
| /api/patient/messages                   | POST   | requireCapability   | consent_to_messaging       |
| /api/patient/messages/conversations     | GET    | requireAuthorityOver| (none)                     |
| /api/patient/messages/unread-count      | GET    | requireAuthorityOver| (none)                     |

**Endpoints NOT extended (per-user, not per-gp):**

- /api/patient/my-code
- /api/patient/privacy-code
- /api/patient/privacy-code/regenerate

**Endpoints in dependent/delegation namespace (Phase E):**

- /api/patient/dependents/*
- /api/patient/delegations/*

**Sharing extend/revoke special case:** Per ruling 4, `consent_to_share`
is excluded from the MVP capability set. A delegate cannot consent to
new shares OR extend/revoke existing shares on the principal's behalf.
Section 1 handlers for sharing endpoints reject delegate basis with 403
"This action requires `consent_to_share`, which is not yet available for
delegated authority. The principal must perform this action themselves."
Self and guardian-of-minor bases pass through.

**POST records special case:** `/api/patient/records` POST today allows
the patient to add their own clinical record. There is no MVP capability
that grants a delegate the right to manufacture clinical records on the
principal's behalf — that's a clinic-side write operation. Same pattern
as sharing: delegate basis rejected.

**Reasoning:** Read endpoints don't need capability gating — authority
alone is sufficient (data leak is the only risk, and authority blocks
it). Write endpoints with capability semantics use the existing 5-token
set. Write endpoints WITHOUT a fitting capability (records-POST,
sharing-extend, sharing-revoke) reject delegates outright; self and
guardian-of-minor pass through.

**Trade-offs accepted:** A delegate with `view_records` cannot help the
principal add a new record. Acceptable — adding a record is a personal
recording action, not a coordination one.

**Risks:** None — capability discipline matches Phase E's intent.

────────────────────────────────────────────────────────────────────────

## Decision 5: Use `createAdminClient()` throughout extended Section 1 endpoints

**Phase:** F.5
**File or section:** All Section 1 endpoint refactors
**Date:** 2026-05-10
**Context:** Existing patient endpoints mix `createClient()` (RLS-bound,
session JWT) and `createAdminClient()` (service role). Clinical tables
(`patient_medical_records`, `vital_signs`, etc.) carry RLS policies that
match `patient_id = auth.uid()` only — they do NOT have the OR-of-three
extension that Phase D mig 114-116 added to `global_patients` / PCR /
audit_events / shares.

For self requests, RLS returns the caller's rows. For cross-context
requests (e.g., principal=adult dependent, delegate=caller), RLS would
block — the JWT's auth.uid() is the delegate, not the principal — so
`eq('patient_id', principal.claimed_user_id)` would return 0 rows under
RLS. The handler-level authority check via `resolvePatientContext` is
the actual security gate.

**Options considered:**

1. Branch the handler: self path uses `createClient()`; cross-context
   path uses `createAdminClient()`. Pro: minimum behavior change. Con:
   two branches in every handler; more code; tested less.
2. Switch ALL paths to `createAdminClient()`. Pro: single path; matches
   Phase E convention (delegations, dependents handlers already use
   admin client); the handler-level auth check makes RLS redundant for
   defense-in-depth on this surface. Con: a stronger behavior change
   for self requests (no longer double-gated by RLS).
3. Extend RLS on clinical tables to OR-of-three. Pro: defense-in-depth
   preserved. Con: out of scope for F.5 (no schema/RLS changes per
   ruling); cross-cutting; deserves a dedicated phase.

**Decision:** Option 2 — use `createAdminClient()` throughout.

**Reasoning:** The handler-level `requireApiRole('patient')` +
`resolvePatientContext` chain is the load-bearing security gate.
`eq('patient_id', ctx.resolvedPatientId)` ensures the response is scoped
to the authorized subject. RLS on clinical tables was effective for
self-only access; with cross-context now in scope, the handler-layer
gate is the right place. Phase E delegations + dependents handlers
already use this pattern.

**Trade-offs accepted:** Self requests no longer pass through clinical-
table RLS as a second gate. Acceptable — the handler-layer authority
check enforces the same invariant ("subject is authorized") more
precisely than RLS can (basis-aware).

**Risks:** A bug in the helper that returns a wrong `resolvedPatientId`
would leak data. Mitigated by the helper's structure: it can only return
either `user.id` (self) or the resolved gp's `claimed_user_id` (after
authority verification). A typo or boolean inversion would surface
broadly across endpoints in QA.

────────────────────────────────────────────────────────────────────────

## Decision 6: UI-side cross-context plumbing via `useApiPath` hook

**Phase:** F.5
**File or section:** `apps/patient/lib/hooks/use-api-path.ts` + ~7 pages
**Date:** 2026-05-10
**Context:** Phase F.5 finding #1 item 4 — "Update patient-app pages to
read active gpId from useActiveAccount() and pass it as the API query
param." Without UI threading, the API extensions have no effect from
the patient app shell.

**Options considered:**

1. Inline `useActiveAccount()` + URL construction in every fetch call.
   Pro: explicit. Con: ~30 fetch sites; duplication; easy to miss one.
2. A `useApiPath()` hook that returns a `(path) => path` function
   appending `?gpId=` from active context. Pro: one-line refactor per
   fetch; consistent semantics; stable function ref via `useCallback`
   so safe in dep arrays. Con: one extra hook in the patient app.
3. A wrapped `apiFetch()` function. Pro: also handles error mapping.
   Con: forces a wholesale fetch-call refactor across patient app —
   too large for F.5.

**Decision:** Option 2 — `useApiPath` hook.

**Reasoning:** Minimal blast radius per fetch (one wrap + add to
useCallback deps); refactor stays surgical; pattern matches the
established Phase F idiom of `useActiveAccount()` already in scope on
these pages.

**Trade-offs accepted:** Pages that fetch outside React render context
(e.g., from event handlers without a captured `apiPath` ref) need to
pull from the captured `apiPath` returned by the hook. All current
fetch sites are already inside `useCallback` or handler closures, so
this works cleanly.

**Risks:** None — the hook's return is a thin string transformer; no
network semantics changed.

────────────────────────────────────────────────────────────────────────

## Decision 7: Delegation display-name JOIN via two-pass lookup, not supabase-js relational select

**Phase:** F.5
**File or section:** `packages/shared/lib/data/delegations.ts`
**Date:** 2026-05-10
**Context:** Phase F finding #7 — listGrantedDelegations and
listReceivedDelegations return rows without display names. UI shows
placeholders. Phase F.5 hydrates names from `global_patients`.

`patient_delegations` has THREE FKs of interest:
- `principal_global_patient_id` → global_patients.id
- `delegate_global_patient_id` → global_patients.id (NULLABLE)
- `delegate_user_id` → users.id

**Options considered:**

1. Supabase-js relational select via embedded resources:
   `.select('*, principal:global_patients!principal_global_patient_id(display_name), delegate:global_patients!delegate_global_patient_id(display_name)')`.
   Pro: single round-trip; PostgREST handles the join. Con: requires
   passing FK CONSTRAINT name when there are 2+ FKs to the same table;
   constraint names are derived implicitly by Supabase and brittle
   across schema migrations; TS typing is awkward.
2. SQL-level VIEW that pre-joins. Pro: clean. Con: schema change; out
   of scope for F.5 (ruling: no migrations).
3. Two-pass lookup in TS: fetch delegations → collect unique gp ids →
   single `SELECT id, display_name FROM global_patients WHERE id IN (…)`
   → map results back. Pro: TS-safe; one extra round-trip is constant
   regardless of N delegations; brittleness-free. Con: one extra round-trip.

**Decision:** Option 3 — two-pass lookup via `hydrateDisplayNames` helper.

**Reasoning:** PostgREST embedded resource grammar with disambiguation
on a 3-FK table is documented to be fragile (Supabase docs note this).
Two-pass is constant-cost regardless of N rows. The data layer stays
schema-change-resilient.

**Trade-offs accepted:** One extra SELECT per list call. Acceptable —
the lists are small (a user has O(10) delegations at most). Hydration
failure is non-fatal (returns nulls; UI shows placeholder).

**Risks:** Hydration query failure is logged but doesn't propagate.
Acceptable — names are cosmetic; placeholder UX falls through cleanly.

────────────────────────────────────────────────────────────────────────

## Decision 8: Phone-lookup endpoint method (POST, not GET) + rate-limit pattern

**Phase:** F.5
**File or section:** `lookup-by-phone/handler.ts`
**Date:** 2026-05-10
**Context:** Phase F finding #3 closure. The endpoint takes a phone
number and returns a userId/gpId. Two orthogonal decisions:
(a) HTTP method, (b) rate-limit mechanism.

**Method options:**

1. GET `/api/patient/lookup-by-phone?phone=...`. Pro: idempotent;
   cacheable. Con: phone in URL leaks to server logs, browser history,
   referrer headers; a privacy regression.
2. POST `/api/patient/lookup-by-phone` with `{ phone }` in body. Pro:
   phone never in URL; bodies not logged by default; not cacheable.

**Decision (method):** POST.

**Reasoning:** Privacy. Phone numbers are quasi-identifiers; minimizing
their footprint in URLs / referrer chains is load-bearing for PDPL
compliance and operator hygiene.

**Rate-limit options:**

1. Reuse existing `enforceRateLimit` pattern from messaging-reconsent
   (30 req / 60s / user, returns 429 with Retry-After).
2. Build a new tighter limit (e.g., 10/hour per user) — but that
   requires a new rate-limit class and infrastructure.
3. Skip rate limiting in F.5; flag as follow-up.

**Decision (rate-limit):** Reuse `enforceRateLimit` at 30 req/min/user.

**Reasoning:** The existing pattern is proven and matches the prompt's
"use existing rate-limit patterns; do not invent new ones" guidance.
30/min is a generous limit for a UI-driven flow but still bounds
enumeration cost — 30 phone-lookups per minute per logged-in user is
not a practical attack throughput against the Egyptian phone space
(11 digits, 10^11 possibilities). The rate-limit runs BEFORE auth so
unauthenticated probes are also bounded.

**Trade-offs accepted:** A more aggressive limit (e.g., 10/hour) would
better deter enumeration, but at the cost of legitimate
caregiver-onboarding friction. Cost / benefit favours the relaxed
limit + complete audit trail (Decision 9).

**Risks:** A determined attacker with multiple compromised accounts
could pool rate-limit budgets. Mitigated by audit (every attempt is
recorded with actor_user_id) and the partial unique index on
`(normalized_phone) WHERE claimed_user_id IS NOT NULL` which keeps
the response shape constant-time per query.

────────────────────────────────────────────────────────────────────────

## Decision 9: Phone-lookup audit emission — every call, hit or miss

**Phase:** F.5
**File or section:** `lookup-by-phone/handler.ts`
**Date:** 2026-05-10
**Context:** Lookup attempts are an enumeration-attack surface. Audit
strategy options:

1. Emit on hits only — minimal volume; misses are silent.
2. Emit on every call — full visibility of access patterns.
3. Emit on misses only — for hostile-pattern detection.

**Decision:** Option 2 — every call emits `PATIENT_LOOKUP_BY_PHONE_ATTEMPT`.

**Reasoning:** A miss is itself evidence about which phone numbers are
NOT claimed (a useful signal to an attacker). Emitting on miss creates
an audit trail of negative results that maps to operator visibility
without leaking the result back to the caller (the 404 response is
generic). Hits + misses → complete picture in the audit table.

**Metadata** (per Decision 5 + audit.ts going-forward rule):
- `phone_e164` — the normalized phone the caller queried
- `matched` — bool
- `matched_user_id` (when matched)
- `matched_global_patient_id` (when matched)
- `ambiguous: true` + `match_count: N` (for the defensive multiple-
  match defensive branch — should never trigger given the partial
  unique index, but logged if it does for data-integrity review)

**Trade-offs accepted:** Higher audit-table write rate. For a 30/min
rate-limit ceiling × N active patients, this is bounded and acceptable.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 10: PatientHeader cross-package boundary — `leadingAction` slot (Ruling 27 Option B)

**Phase:** F.5
**File or section:** `packages/ui-clinic/components/patient/PatientHeader.tsx`
**Date:** 2026-05-10
**Context:** Phase F finding #8 — AccountSwitcher is visible only on Phase
F-new pages + dashboard (via `action` prop override). Existing pages
keep bell+more default and have no switcher.

Mo ruling 27 selected Option B (over Option A which would have moved
AccountSwitcher into @ui-clinic). The `@ui-clinic` package must not
import `@patient/lib/contexts/account-context` — that crosses package
boundaries the wrong direction.

**Implementation options for Option B:**

1. Repurpose `action` prop — already exists. But Phase F uses it for
   AccountSwitcher REPLACEMENT of bell+more, which means existing pages
   that pass `action` for other purposes would conflict.
2. Add a new `leadingAction` prop — renders BEFORE the action override
   or bell+more default. Phase F pages stop passing `action`, switch to
   `leadingAction`, and regain bell+more by default. Existing pages
   gain `leadingAction={<AccountSwitcher />}` without losing bell+more.

**Decision:** Option 2 — `leadingAction` prop name; renders before action
override / bell+more default.

**Reasoning:** Cleanly composable. Each page can have AccountSwitcher
(leadingAction) AND bell+more (default) AND/OR a custom action override
(action prop) without any prop conflicting with another.

**Trade-offs accepted:** Existing Phase F pages migrate from
`action={<AccountSwitcher />}` to `leadingAction={<AccountSwitcher />}`
— a one-line change per page. Mechanical.

**Risks:** None — additive prop; opt-in per page.

────────────────────────────────────────────────────────────────────────

## Decision 11: Two-step caregiver grant form (phone lookup → capability selection)

**Phase:** F.5
**File or section:** `apps/patient/components/delegations/DelegationGrantForm.tsx`
**Date:** 2026-05-10
**Context:** Section 5 re-enables the deferred caregiver grant form
(Phase F Decision 6 reversed). Form-flow shape options:

1. Single-step: phone + capabilities + expiry all on one screen. Pro:
   fewer clicks. Con: user might enter capabilities for the wrong
   person if phone resolves to an unfamiliar match.
2. Two-step: phone lookup first, show matched display name for
   confirmation, then capabilities/expiry. Pro: user sees who they're
   granting authority to BEFORE they configure the grant; reduces "I
   granted the wrong person" mistakes.

**Decision:** Option 2 — two-step flow.

**Reasoning:** Delegation grants are high-stakes (the delegate gains
authority over the principal's medical records). A confirmation step
between "I looked up this phone" and "I'm granting these capabilities"
is a low-cost safety affordance. Mo case A2 (son manages father)
specifically benefits — the son sees "this is Dad" before proceeding.

**Trade-offs accepted:** One extra click. Acceptable for a once-per-
relationship workflow.

**Risks:** None — UX improvement only.

────────────────────────────────────────────────────────────────────────

## Decision 12: PATCH dependent — data-layer + handler split (no schema changes)

**Phase:** F.5
**File or section:** `dependents.ts` + `dependents/update/handler.ts`
**Date:** 2026-05-10
**Context:** Phase F finding #2 — no PATCH endpoint exists for
dependent profiles. Section 3 adds `updateMinorProfile` at the data
layer + a handler at `/api/patient/dependents/[id]` (PATCH).

**Editable field decisions:**

- `displayName` — YES editable. 1..200 chars; trimmed; cannot blank-out.
- `preferredLanguage` — YES editable. 'ar' | 'en'.
- `date_of_birth` — NO. Locked post-registration to preserve audit
  integrity. If a parent entered the wrong DOB, they contact support
  (clinic-side correction flow).
- `sex` — NO. Same reasoning.
- `is_minor` — NO. Graduation is Phase 2 (Mo ruling 1).
- `guardian_global_patient_id` — NO. Custody transfer is Phase 2
  (Mo ruling 5).
- `claimed_user_id` — NO. Minors don't claim (mig 109 CHECK).

**Audit emission:** `MINOR_PROFILE_UPDATED` (new action — added to
audit.ts in this phase per the going-forward rule); metadata.
changed_fields = { field: { before, after } } map for downstream
auditability.

**Decision:** Ship PATCH at `/api/patient/dependents/[id]` (route file
re-exports both GET (Phase E) and PATCH (Phase F.5)); data layer
function emits canonical audit (Phase E Decision 5 holds).

**Trade-offs accepted:** None — straightforward addition.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 13: Section 1 endpoint exclusion list verified empirically

**Phase:** F.5
**File or section:** Section 1 scope
**Date:** 2026-05-10
**Context:** The Phase F.5 prompt lists ~26 candidate endpoints; the
empirical survey of `apps/patient/app/api/patient/` returned 35 route
files. Need to confirm exclusion decisions for each non-extended route.

**Exclusion list (with rationale):**

- `/api/patient/my-code` — per-user (privacy code is keyed to auth.uid,
  not gp); cross-context meaningless.
- `/api/patient/privacy-code` — per-user; same reasoning.
- `/api/patient/privacy-code/regenerate` — per-user; same reasoning.
- `/api/patient/dependents/*` — Phase E namespace + Section 3 PATCH;
  resolution is dependent-specific (gpId is the path param).
- `/api/patient/delegations/*` — Phase E namespace; auth is per-user
  (principal = caller; delegate = caller). Cross-context inapplicable.
- `/api/patient/lookup-by-phone` — Phase F.5 NEW; per-caller (no gp
  context needed).

**Endpoints extended in Section 1 (final count, post-verification):**

- records (GET, POST)
- appointments (GET)
- prescriptions (GET)
- vitals (GET)
- visits (GET)
- immunizations (GET, POST)
- lab-results (GET)
- medications (GET, POST)
- medications/[id] (DELETE, PATCH — inlined in app, not shared handler)
- conditions (GET, POST)
- allergies (GET, POST)
- notes (GET)
- diary (GET, POST)
- medication-reminders (GET)
- medication-intake (GET, POST)
- health-summary (GET)
- sharing (GET, DELETE)
- sharing/[shareId]/extend (POST — direct authority check, no helper)
- sharing/[shareId]/revoke (POST — same)
- messages (GET, POST)
- messages/conversations (GET)
- messages/unread-count (GET — inlined in app)
- messaging-reconsent (GET, POST)

Total: 22 endpoint shells touched (some are re-exports; ~28 method-
handler pairs). Larger than the prompt's anticipated ~16 — Lesson #16
empirical survey is authoritative.

**Decision:** Extend the empirical list; document in commit message.

────────────────────────────────────────────────────────────────────────

## Decision 14: `denyDelegates: true` semantics for sharing extend/revoke

**Phase:** F.5
**File or section:** sharing/extend-handler.ts + revoke-handler.ts
**Date:** 2026-05-10
**Context:** These two endpoints already had a tight self-only auth
check (`claimed_user_id !== userId → 403`). Phase F.5 extends to allow
guardian-of-minor (though minors can't actually have shares since they
have no claim → no patients.id), and REJECTS delegates.

The handlers don't use `resolvePatientContext` because the gpId comes
from the share row, not from a `?gpId=` query param. Instead they:

1. Look up the share to learn `global_patient_id`.
2. Call `requireAuthorityOver(subjectGpId, userId)`.
3. If basis === 'delegated_by_principal', throw `DelegateNotAuthorizedError`.

The `DelegateNotAuthorizedError` class (exported from
`patient-context.ts`) carries a custom message explaining why
(`consent_to_share` post-MVP).

**Decision:** Direct authority check pattern for share-id-keyed
endpoints (no helper indirection); delegate rejection inline.

**Reasoning:** The share row carries the gpId; resolving from a query
param would be redundant. Cleaner to do the authority check directly
against the share's subject.

**Trade-offs accepted:** Slightly different pattern from the rest of
Section 1. Acceptable — these endpoints are special-cased by their
shape (id-keyed; gpId implicit from share row).

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 15: `resolvePatientContext` authorize callback pattern (eslint compliance)

**Phase:** F.5
**File or section:** `patient-context.ts`
**Date:** 2026-05-10
**Context:** Initial implementation passed `requiredCapability: AllowedCapability`
to the helper and the helper internally called `requireCapability(gpId,
requiredCapability, userId)`. The
`no-unregistered-delegation-capability` ESLint rule rejects this — the
second arg of `requireCapability` MUST be a literal string for
static-grep auditability (project-wide invariant established in Phase C).

**Options considered:**

1. `// eslint-disable-next-line` — won't work; `lint:scopes` uses
   `--no-inline-config` so inline disables are ignored.
2. Inline the call at each handler site — duplicates the gpId
   resolution boilerplate; defeats the helper's purpose.
3. Callback pattern: helper accepts `authorize?: (gpId, userId) => Promise<AuthorityResult>`.
   Default = `requireAuthorityOver`. Capability handlers pass a closure
   that calls `requireCapability` with a LITERAL token. The static
   literal is at the closure call site — eslint rule passes.

**Decision:** Option 3 — `authorize` callback pattern.

**Reasoning:** Preserves the eslint discipline AND keeps the helper
DRY. Call site syntax stays readable:
   `authorize: (gpId, uid) => requireCapability(gpId, 'manage_medications', uid)`

**Trade-offs accepted:** Slightly more verbose at call sites than a
plain `requiredCapability: 'manage_medications'` would be. Worth it
for the static auditability invariant.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 16: UI display-name update consumers — caregivers + caregiving pages only

**Phase:** F.5
**File or section:** Section 4 UI consumer updates
**Date:** 2026-05-10
**Context:** Section 4 hydrates `principal_display_name` and
`delegate_display_name` on delegation list responses. UI consumers that
need updates:

- `apps/patient/app/(patient)/patient/settings/caregivers/page.tsx`
  (lists granted; render `delegate_display_name`).
- `apps/patient/app/(patient)/patient/settings/caregiving/page.tsx`
  (lists received; render `principal_display_name`).
- `apps/patient/lib/contexts/account-context.tsx` already had
  `principal_display_name: string | null` in `ReceivedDelegationRow` —
  it was a Phase F-time placeholder waiting for backend to populate.
  No type change needed; the field is now populated by Section 4.
- `apps/patient/components/AccountSwitcher.tsx` reads from
  `useAccountSwitcher().available` which maps `principal_display_name`
  → `displayName`. Same — no code change; the placeholder
  "حساب مفوّض" is now superseded by the real name when present.

**Decision:** Two UI files updated (caregivers + caregiving). Type-only
fields added; placeholder fallback retained for null cases.

**Reasoning:** Surgical. Phase F type plumbing was already correctly
shaped (one of the cleaner Phase F decisions); F.5 just lights it up.

────────────────────────────────────────────────────────────────────────
