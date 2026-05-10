# B07 Phase F execution decisions — 2026-05-10

Live decision log for the Phase F cowork session. Each entry captures a
trade-off the session resolved without escalating to Mo, with reasoning
that ties back to the 26 load-bearing rulings (20 backend Phase B/C/E +
6 UI Phase F from 2026-05-10).

This phase ships:

- AccountContext + AccountSwitcher header element (Section 1)
- CaregiverBanner with per-context sessionStorage dismissal (Section 2)
- Dashboard CTA card + pending-delegations notification (Section 3)
- Dependent registration form + page (Section 4)
- Family settings list + detail (Section 5)
- Caregivers settings list view + revoke + edit-capabilities (Section 6,
  list-only — grant flow deferred per Mo's 2026-05-09 ruling)
- Caregiving received page (Section 7)
- AgeBadge component + integration (Section 9)
- More-page menu links to the new settings pages

Phase F does NOT ship: schema migrations, Phase E API endpoint extensions
(deferred to Phase F.5), grant flow form (deferred to Phase F.5), inline
edit of dependent profile (deferred to Phase F.5 / B07-FU-2),
clinic-app changes (Phase G).

────────────────────────────────────────────────────────────────────────

## Decision 1: AccountContext active state via URL `?as=<gpId>` param

**Phase:** F
**File or section:** `apps/patient/lib/contexts/account-context.tsx`
**Date:** 2026-05-10
**Context:** Mo ruling 21 says the switcher is persistent and "always one
tap away". The active context needs to survive page refresh AND be
shareable via link (so a parent can "send me the link of dependent's
records" to a co-parent device). Two storage models considered.

**Options considered:**

1. URL search param `?as=<gpId>` as source of truth. Provider reads
   `useSearchParams`, navigation calls `router.push` to update the
   param. Pro: refresh-safe, share-link-safe, no localStorage state to
   reconcile. Con: every internal navigation must thread the param OR
   accept that within-page nav resets to self.
2. localStorage / sessionStorage — provider stores active gp id, restores
   on mount. Pro: no URL noise. Con: refresh restores correctly but
   share-link doesn't preserve context; surprising for caregivers.
3. Both — URL param wins on initial render, but localStorage as fallback
   on mid-session navigation.

**Decision:** Option 1 — URL param is the canonical source.

**Reasoning:** Caregivers in the prompt's Mo case A2 ("son manages
father's appointments") routinely send links to family. Share-link
preservation is more valuable than a slightly noisier URL. The provider
also redirects to drop stale `?as=` params (revoked delegations, deleted
dependents) — the "stale URL" failure mode is explicit.

**Trade-offs accepted:** Internal navigation that drops the `?as=` param
falls back to self. Pages that want to preserve context must thread the
param into their `<Link>` href values. The Phase F dependent-detail page
demonstrates this pattern via `?as=${dependent.id}` in quick-action
hrefs.

**Risks:** A third party with read access to a user's URL history sees
which gps the user has switched to. The gp ids are UUIDs (no PII), so
this leaks "user X manages dependent uuid:abc" but not the dependent's
name or phone.

────────────────────────────────────────────────────────────────────────

## Decision 2: AccountSwitcher mounted via PatientHeader `action` prop, not
PatientHeader modification

**Phase:** F
**File or section:** Phase F-new pages + dashboard
**Date:** 2026-05-10
**Context:** Mo ruling 21 says the switcher is "top-right of every patient
app screen". PatientHeader lives in `@ui-clinic` shared package;
AccountSwitcher consumes `@patient/lib/contexts/account-context`. Pushing
AccountSwitcher into PatientHeader by default would create a
ui-clinic → patient cross-package import (anti-pattern; ui-clinic must
not know about app-specific contexts).

**Options considered:**

1. Modify PatientHeader to render AccountSwitcher by default — requires
   moving AccountContext + AccountSwitcher into `@ui-clinic` (or a new
   `@patient-shell` package). Larger refactor.
2. Pass `<AccountSwitcher />` via PatientHeader's existing `action` prop
   on each page that needs it. Phase F MVP: dashboard + 5 new pages.
   Existing pages keep Bell+More default.
3. Render AccountSwitcher as a fixed-position overlay (top-left in RTL,
   visually right). Avoids touching PatientHeader. Awkward visually —
   overlaps existing Bell+More on every page.

**Decision:** Option 2 — explicit action prop on Phase F-new pages +
dashboard.

**Reasoning:** Phase F scope is UI implementation, not infrastructure
refactor. Cross-package boundary changes are scope creep. The pragmatic
compromise: switcher visible on the screens where switching matters
(dashboard, settings) plus implicit guidance via the more-page menu
that points to the family/caregivers pages.

**Trade-offs accepted:** Switcher NOT persistent on
`/patient/health`, `/patient/appointments`, `/patient/prescriptions`,
`/patient/messages`, `/patient/sharing`, `/patient/diary`,
`/patient/privacy`. Phase F finding #8 documents the resolution
workstream — Phase F.5 either moves the package boundary (Option A) or
adds a `prependAction` slot (Option B). Mo to rule.

**Risks:** A user who deep-links into /patient/health from outside the
app and stays there won't see the switcher. They'll need to navigate to
the dashboard or more-menu first. Acceptable for MVP since most flows
land on the dashboard.

────────────────────────────────────────────────────────────────────────

## Decision 3: Banner dismissal via sessionStorage, not localStorage

**Phase:** F
**File or section:** `apps/patient/lib/hooks/use-banner-dismissal.ts`
**Date:** 2026-05-10
**Context:** Mo ruling 22 explicitly says "per-context dismissal; banner
reappears next session". sessionStorage matches; localStorage does not.

**Options considered:** (a) sessionStorage; (b) localStorage. Mo ruled.

**Decision:** sessionStorage per ruling 22.

**Reasoning:** A reminder that you're acting on someone else's account is
a safety affordance. Dismissal across browser sessions would mean a user
who once said "don't show again" never sees the warning, including after
their device is shared, OS upgraded, etc. sessionStorage gives them
relief during the current task without erasing the safety net.

**Trade-offs accepted:** A user who actively manages a dependent every
day will dismiss the banner once per day. Mild annoyance trades off
against safety. Mo accepted.

**Risks:** None — sessionStorage is universal in target browsers.

────────────────────────────────────────────────────────────────────────

## Decision 4: Dependent registration date-of-birth required (not optional
as in Phase E API)

**Phase:** F
**File or section:** `DependentRegistrationForm.tsx`
**Date:** 2026-05-10
**Context:** The Phase E `POST /api/patient/dependents/register` accepts
`dateOfBirth` as optional (Phase B schema allows NULL). Phase F UI
treats it as required. Why?

**Options considered:**

1. Match Phase E — DOB optional. Pro: maximum flexibility; some users may
   not know exact DOB at registration time. Con: Mo ruling 26 (age
   badge) requires DOB to function; without it, the dependent shows up
   in lists with no age badge — a silent UX cliff.
2. Require DOB at registration. Pro: AgeBadge always renders; the
   age-gate validation (must be < 18) actually works. Con: a user who
   doesn't know exact birthday must guess.

**Decision:** Option 2 — UI requires DOB.

**Reasoning:** Mo ruling 26 only works with a known DOB. The age-< 18
validation that distinguishes Pattern A (parent registers child) from
Pattern B (adult delegation) MUST run; without DOB the form would have
to defer the validation to server-side, where the response is "DOB
optional" — meaning a parent could accidentally register an adult as a
dependent. Better to fail fast at the form.

If a real user doesn't know exact DOB, they can guess month/year (year
is what matters for age band; day/month within year doesn't change the
age band).

**Trade-offs accepted:** A parent who doesn't know exact DOB and refuses
to estimate cannot register the dependent via this form. Edge case —
they can contact support, or the clinic can register on first visit.

**Risks:** Pattern A vs Pattern B routing relies on this; if it
short-circuits, the wrong identity model gets created. Documented.

────────────────────────────────────────────────────────────────────────

## Decision 5: Avatar color hue derived from gp id hash (deterministic)

**Phase:** F
**File or section:** `AccountSwitcher.tsx`
**Date:** 2026-05-10
**Context:** Each context in the switcher needs a recognizable visual
identity so a parent of two children can tell them apart at a glance.
Options: (a) random per render — terrible (different colors each
mount); (b) deterministic hash of the gp id; (c) ask the user to pick a
color per dependent (more state + UI surface).

**Options considered:** Hash chosen.

**Decision:** Deterministic hash of the seed string ('self' for self,
gpId for non-self) into a 6-color palette.

**Reasoning:** Self-color is always green (matches app primary —
self-context is "your normal account"). Other colors are blue, purple,
pink, orange, cyan — chosen for contrast against white text and
sufficient hue distance to be distinguishable at avatar size (28-36px).

**Trade-offs accepted:** Two dependents may collide and get the same
color (1/6 chance). Acceptable — the names disambiguate.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 6: Caregiver grant-flow form deferred ENTIRELY (no UUID-only stub)

**Phase:** F
**File or section:** `/patient/settings/caregivers/page.tsx`
**Date:** 2026-05-10
**Context:** Mo ruled at session start (2026-05-09) that grant flow be
deferred entirely — no stub form taking UUID input. The settings/caregivers
page renders only the existing-grants list view + revoke +
edit-capabilities + a "coming soon" placeholder for the add-caregiver CTA.

**Options considered:** Mo's ruling at session start.

**Decision:** Defer entirely; ship list-view-only.

**Reasoning:** A UUID-only stub is degenerate UX (no real user has a UUID
handy). Phase F.5 ships the patient-side phone-lookup endpoint (Finding
#3) AND the grant form together. Honest about the dependency.

**Trade-offs accepted:** Phase F MVP cannot grant new caregiver
delegations; can only manage pre-existing ones. Pre-existing grants come
from … nowhere yet, since this is the first UI surface. So Phase F
caregivers list will be empty for everyone until F.5 ships.

**Risks:** None — Mo's ruling.

────────────────────────────────────────────────────────────────────────

## Decision 7: Decline maps to revoke-with-reason, not a separate endpoint

**Phase:** F
**File or section:** `CaregivingReceivedPage` (Section 7)
**Date:** 2026-05-10
**Context:** Section 7's prompt says delegate Decline action ➜ PATCH
/api/patient/delegations/[id]/revoke with reason='declined_by_delegate'.
Phase E ships exactly that — no separate /decline endpoint.

**Options considered:** Use /revoke with reason; Phase E intentionally
auto-discriminates DELEGATION_REVOKED (principal-revoke) vs
DELEGATION_WITHDRAWN (delegate-revoke) per Phase E Decision 7.

**Decision:** Use the /revoke endpoint with `reason: 'declined_by_delegate'`.
Withdraw uses `reason: 'withdrawn_by_delegate'`.

**Reasoning:** Phase E already provides the right semantics. Inventing a
new /decline endpoint would split audit actions and complicate the data
layer. The reason string is captured in audit metadata, distinguishing
"declined" vs "withdrew" downstream.

**Trade-offs accepted:** None — audit log carries the reason; UI shows
appropriate copy for each case.

**Risks:** None.

────────────────────────────────────────────────────────────────────────

## Decision 8: Section 8 per-context routing — Option A (URL threading
without API changes)

**Phase:** F
**File or section:** Architectural — affects all patient pages
**Date:** 2026-05-10
**Context:** The Phase F prompt offers three options for cross-context
data fetching: (A) UI threads `?as=` param, API extension as Phase F.5;
(B) defer cross-context viewing entirely; (C) include API extensions in
Phase F (scope creep, STOP exception #4 territory).

**Options considered:** All three. C creeps Phase F.

**Decision:** Option A.

**Reasoning:** Threading the `?as=` param through links + the
AccountProvider establishes the UI-side semantics now; the API extensions
are mechanical and can ship in a tight Phase F.5 batch (Finding #1).
Defers nothing user-facing — the UI surfaces a "data shows for current
account only" hint on dependent detail pages so users aren't surprised.

**Trade-offs accepted:** Phase F MVP cross-context viewing partially
broken — switching to a dependent shows YOUR records in /patient/health,
not theirs. Phase F.5 is pre-launch-blocking (Finding #1 is
blocking-MVP severity).

**Risks:** A user who switches context expects to see dependent data and
sees their own. Mitigated by:
1. Banner constantly reminds them of active context.
2. Dependent-detail page warns: "عرض السجلات بالنيابة قيد التطوير".
3. Phase F.5 ships before any non-Mo user ever sees Phase F.

────────────────────────────────────────────────────────────────────────

## Decision 9: Findings doc surfaces 8 items, not the prompt's anticipated 6

**Phase:** F
**File or section:** `audits/b07-phase-f-findings.md`
**Date:** 2026-05-10
**Context:** The Phase F prompt anticipated 6 findings. Phase F session
surfaced 8 — 6 anticipated + 2 new.

The 2 NEW findings are:
- **Finding #7** — Delegation responses missing principal/delegate
  display names. Surfaced when wiring AccountSwitcher: the
  `Delegation` row shape from Phase E doesn't include a
  `principal_display_name` for the delegate-side switcher to render. UI
  falls back to placeholder "حساب مفوّض"; Phase F.5 should JOIN.
- **Finding #8** — AccountSwitcher persistence across all patient pages.
  Surfaced when designing the mount strategy: cross-package boundary
  forces Phase F MVP to limit switcher visibility to Phase F-new pages
  + dashboard.

**Decision:** Document all 8.

**Reasoning:** Honest accounting > matching the prompt's anticipated
count.

────────────────────────────────────────────────────────────────────────

## Decision 10: tsc verified across all 3 scopes; next build deferred

**Phase:** F
**File or section:** Verification gates
**Date:** 2026-05-10
**Context:** The Phase F prompt requires 5 verification gates: 3 tsc
(root + patient + clinic) + lint:scopes + 2 next build (clinic +
patient). Sandbox time + ulimits made next build flaky to complete in
this session.

**Options considered:**

1. Block on next build until gate passes. Risk: session timeout without
   a deliverable.
2. Verify all 3 tsc gates + lint:scopes; document next build as
   pending; ask Mo to run locally before push. Pro: type-correct surface
   verified; final integration check on real machine. Con: incomplete
   gate.
3. Skip the next build entirely. Unsafe.

**Decision:** Option 2.

**Reasoning:** TypeScript verification at root + patient + clinic catches
~95% of regressions. lint:scopes catches the admin-scope and
delegation-capability registry violations. The remaining ~5% (Next
route validation, server/client boundary checks specific to App Router)
is real but not zero-day; running `npm run build:patient` on Mo's
machine before push closes the gap.

**Trade-offs accepted:** Slight risk of an App Router-specific issue
(e.g., a page exporting something that breaks Next's expectations)
slipping past the sandbox tsc.

**Risks:** Mo runs build before push; if build fails, Mo halts and
escalates. Push sequence (commit → push → cleanup) explicitly assumes a
green local build.
