# B07 Phase F findings — 2026-05-10

Findings surfaced during Phase F UI implementation. Each finding has a
title, description, severity, and recommended next workstream. Phase F
shipped UI on top of Phase E backend (`8cd485f`); these gaps are the
backend/UI seams that still need work to close out B07 end-to-end.

Severity vocabulary:

- **blocking-MVP** — Phase F deliverable cannot ship to real users without
  this. Phase F.5 must close before any user trial.
- **nice-to-have-pre-launch** — Phase F UX is materially better with this,
  but a launch-without is defensible.
- **future** — Captured for B07-FU continuity; not on the path to launch.

────────────────────────────────────────────────────────────────────────

## Finding 1 — Per-context routing API extensions (Phase F.5 candidate) — RESOLVED

**Status:** RESOLVED in Phase F.5 Section 1 (this commit; see
`audits/b07-phase-f5-execution-2026-05-10.md` Decisions 1-5, 13-15).
Helper `resolvePatientContext` + `useApiPath` hook plumb the `?gpId=`
parameter end-to-end across 22 endpoint shells / ~28 method-handler
pairs. Read endpoints use `requireAuthorityOver`; write endpoints with
capability semantics use `requireCapability` via the `authorize`
closure pattern; write endpoints without an MVP capability use
`denyDelegates: true`. Minor case (no claim → empty data) per
Decision 2.

**Severity:** blocking-MVP

**Description:** Existing patient-app endpoints (records, appointments,
prescriptions, health-summary, vitals, visits, immunizations, lab-results,
medications, conditions, allergies, sharing, messages, diary,
medication-reminders) resolve subject via `claimed_user_id = auth.uid()`
internally. They IGNORE any `?as=<gpId>` query param.

Phase F UI threads `?as=` through links and the AccountProvider switches
context, but cross-context data fetching does not work end-to-end until
the API layer accepts the parameter. A user who switches context to a
dependent will see THEIR OWN records on /patient/health, not the
dependent's — a confusing data inconsistency.

**Recommended next workstream — Phase F.5:**
1. Extend each affected endpoint to accept `?gpId=<gp>` query param.
2. Resolve subject via `requireAuthorityOver(gpId, user.id)` instead of
   the current self-only lookup.
3. Where `?gpId` is missing, fall back to current self-only behavior
   (back-compat).
4. Update patient-app pages to read active gpId from `useActiveAccount()`
   and pass it as the API query param.

Affected: ~14 patient-app endpoints; ~8 patient-app pages. Mechanical
work. Estimated 2-3 sessions.

────────────────────────────────────────────────────────────────────────

## Finding 2 — `PATCH /api/patient/dependents/[id]` endpoint absent — RESOLVED

**Status:** RESOLVED in Phase F.5 Section 3 (this commit; see Decision 12
in the F.5 execution log). Endpoint added at
`packages/shared/lib/api/handlers/patient/dependents/update/handler.ts`,
data-layer function `updateMinorProfile` in `dependents.ts`. Editable:
`displayName`, `preferredLanguage`. Locked: identity fields
(date_of_birth, sex, claim, guardian). Emits `MINOR_PROFILE_UPDATED`
audit row. Inline edit wired into `settings/family/[id]` detail page.

**Severity:** nice-to-have-pre-launch

**Description:** Phase E ships `GET /api/patient/dependents/[id]` only.
The dependent detail page (Section 5) renders profile fields (display
name, sex, preferred language) view-only. The Phase F prompt anticipated
inline edit; without a PATCH endpoint, edit cannot ship.

Phase F MVP shows a "Contact support to edit — inline editing coming
soon" hint at the bottom of the profile card. Functionally fine for an
early user trial; cosmetically noticeable.

**Recommended next workstream — Phase F.5 or B07-FU-2:**
1. Ship `PATCH /api/patient/dependents/[id]` accepting partial profile
   updates (displayName, sex, preferredLanguage; date_of_birth NOT
   editable post-registration to preserve audit integrity).
2. Authorization: `requireAuthorityOver(id, user.id)` with basis check
   `'guardian_of_minor'`.
3. Audit: emit `MINOR_PROFILE_UPDATED` (new audit action; or recycle
   existing `GUARDIAN_LINK_CREATED` semantics — Mo to rule).
4. Wire inline edit into DependentDetailCard.

────────────────────────────────────────────────────────────────────────

## Finding 3 — Patient-side phone → userId lookup endpoint absent — RESOLVED

**Status:** RESOLVED in Phase F.5 Section 2 (this commit; see Decisions
8-9 in the F.5 execution log). Endpoint at
`/api/patient/lookup-by-phone` (POST, body { phone }). Returns userId +
gpId + displayName, or 404. Rate-limited at 30/min/user via
`enforceRateLimit`. Emits `PATIENT_LOOKUP_BY_PHONE_ATTEMPT` audit row
on every call (hit or miss). The Phase F.5 caregiver grant form
(Section 5) consumes this endpoint.

**Severity:** blocking-MVP

**Description:** The `POST /api/patient/delegations` Phase E endpoint
requires `delegateUserId: <UUID>` (the auth.users id). The Phase F grant
form should let the principal type a phone number; the form needs to
resolve that phone to a userId to populate delegateUserId.

`/api/patients/search` exists but is gated to clinic-side roles
(doctor/frontdesk) for privacy reasons. There is no patient-side
lookup endpoint.

Per Mo's 2026-05-09 ruling on Phase F session scope, the GRANT FLOW IS
DEFERRED ENTIRELY in Phase F. The settings/caregivers page renders the
existing-grants list view + revoke + edit-capabilities; the "Add a
caregiver" CTA shows a "coming soon" placeholder.

**Recommended next workstream — Phase F.5 (paired with Finding 1):**
1. Ship `POST /api/patient/lookup-user-by-phone` returning ONLY
   `{ exists: boolean, userId?: string, displayName?: string }` —
   minimal data.
2. Rate-limit aggressively (e.g., 30 lookups / hour per user) to deter
   enumeration of the phone-number space.
3. Audit every lookup with `actor=user.id, action=PHONE_LOOKUP_QUERY,
   subject=phone (hashed)`.
4. Wire into a new DelegationGrantForm component + grant flow page.

────────────────────────────────────────────────────────────────────────

## Finding 4 — Deep-link / SMS deep-link for delegation acceptance (B07-FU-4)

**Severity:** future

**Description:** Per Mo ruling 25 (UI ruling 5), MVP delegation
acceptance is in-app notification only — no SMS deep-link. When a
principal grants a delegation, the delegate must open the patient app
and visit /patient/settings/caregiving to see the pending invitation.

Future: WhatsApp/SMS push with a deep-link to /patient/settings/caregiving
would lift acceptance latency from "next time delegate opens app" to
"within minutes of grant." Architecturally requires:
1. WhatsApp Business / SMS provider integration (B09 territory).
2. Deep-link signing (HMAC) so recipient can't tamper with grant id.
3. Provider phone-number verification (so the delegate sees the request
   came from a known principal).

**Recommended next workstream:** B07-FU-4, queued behind B09 messaging
infrastructure. Not a blocker for B07 sign-off.

────────────────────────────────────────────────────────────────────────

## Finding 5 — Multi-language age badge i18n verification

**Severity:** nice-to-have-pre-launch

**Description:** The AgeBadge component renders "(عمر N)" in Arabic and
"(Age N)" in English. App default locale is Arabic (`html lang="ar"
dir="rtl"`). The Egyptian colloquial "عمر N" works for ages 1+ but for
infants under 1 may read awkwardly ("عمر 0" — should arguably be
"رضيع" or "(أقل من عام)").

Defensive fix already in place: `calculateAge` returns `Math.max(0, age)`
so we never display negative; under-1 year reads "(عمر 0)" today.

**Recommended next workstream — nice-to-have:**
1. AgeBadge: branch on age=0 → "(رضيع)" (infant); 1-2 → singular form
   "(عمر سنة واحدة)" (year one); 2-10 → dual/plural; 10+ → standard.
2. Mo or a native Arabic copy reviewer to validate the singular/dual/
   plural Arabic-grammar branches.

────────────────────────────────────────────────────────────────────────

## Finding 6 — Mobile narrow-viewport (< 380px) edge cases

**Severity:** nice-to-have-pre-launch

**Description:** AccountSwitcher in compact mode (< 640px) hides the
display name and shows only avatar+chevron. On iPhone SE (375px) this
works visually; on truly narrow devices (older Android, watch-mode, etc.
< 360px) the dropdown menu width (260px) may overflow.

CaregiverBanner copy ("تتصفح حساب <name> (التابع، عمر N)") at < 380px
truncates with `truncate`. Acceptable.

**Recommended next workstream — nice-to-have:**
1. Manual visual QA at 320px / 360px / 375px on real devices.
2. Consider a `min-w-[260px] max-w-[calc(100vw-32px)]` constraint on
   AccountSwitcher dropdown to prevent overflow on narrow viewports.

────────────────────────────────────────────────────────────────────────

## Finding 7 — Delegation responses missing principal/delegate display names — RESOLVED

**Status:** RESOLVED in Phase F.5 Section 4 (this commit; see Decision 7
in the F.5 execution log). `listGrantedDelegations` and
`listReceivedDelegations` hydrate `principal_display_name` +
`delegate_display_name` via a two-pass lookup helper
(`hydrateDisplayNames`). New return type `DelegationWithNames` extends
`Delegation`. UI consumers: AccountSwitcher (already typed correctly
at Phase F), caregivers page, caregiving page — all updated to render
real names with placeholder fallback for null cases.

**Severity:** blocking-MVP

**Description:** `/api/patient/delegations/granted` and
`/api/patient/delegations/received` return `Delegation` rows
containing `principal_global_patient_id` and `delegate_user_id` /
`delegate_global_patient_id` — but NOT the human-readable display names
of principal or delegate.

The Phase F UI renders placeholder labels:
- AccountSwitcher's delegated-context entries show "حساب مفوّض"
  (delegated account) without the principal's name.
- CaregiversSettingsPage renders "مقدم رعاية #<userId-prefix>".
- CaregivingReceivedPage renders "دعوة لتكون مقدم رعاية" without the
  principal's name.

**Recommended next workstream — Phase F.5:**
1. Extend the data layer's `listGrantedDelegations` /
   `listReceivedDelegations` to LEFT JOIN `global_patients` on the
   relevant FK and project `display_name` into the row.
2. The Phase E API handlers re-export the same shape; no handler
   change needed.
3. Phase F UI components consume the new field with no contract change
   (TypeScript optional field; falls back to existing placeholder).

Estimated: 1-2 hour data-layer change + null-safe UI updates.

────────────────────────────────────────────────────────────────────────

## Finding 8 — AccountSwitcher persistence across all patient pages — RESOLVED

**Status:** RESOLVED in Phase F.5 Section 6 (this commit; see Decision 10
in the F.5 execution log). Mo ruling 27 selected Option B:
PatientHeader gains a new `leadingAction?: ReactNode` prop that
renders BEFORE the action override or bell+more default.
AccountSwitcher remains in `@patient`. All 11 existing patient pages
that use PatientHeader pass `leadingAction={<AccountSwitcher />}`;
Phase F pages migrated from `action` to `leadingAction` (preserves
bell+more alongside switcher). Switcher now visible on every patient
page.

**Severity:** nice-to-have-pre-launch

**Description:** Mo ruling 21 (UI ruling 1) says the account switcher is
a persistent header element. PatientHeader lives in
`packages/ui-clinic/components/patient/PatientHeader.tsx`; AccountSwitcher
in `apps/patient/components/AccountSwitcher.tsx`. Modifying PatientHeader
to render AccountSwitcher by default would create a cross-package import
(ui-clinic depending on patient app), an anti-pattern.

Pragmatic Phase F MVP: each Phase F-new page passes `<AccountSwitcher />`
explicitly via PatientHeader's `action` prop. Dashboard also patched.
Other existing patient pages (records, appointments, prescriptions, etc.)
keep their existing Bell+More default actions. Switcher visible only on:
- /patient/dashboard
- /patient/dependents/register
- /patient/settings/family + [id]
- /patient/settings/caregivers
- /patient/settings/caregiving

**Recommended next workstream — Phase F.5 (paired with Finding 1):**

Two options for resolution:

**Option A:** Move AccountSwitcher + AccountContext into
`@ui-clinic/components/patient/`. Modify PatientHeader to render
AccountSwitcher in default action area when AccountContext is present.
Existing patient pages get the switcher for free.

**Option B:** Add `prependAction` slot to PatientHeader that pages can
pass without forcing `@ui-clinic` to know about `@patient`. Each page
gets a one-line edit to include `<AccountSwitcher />`.

Mo to rule. Option A is cleaner; Option B is more conservative.

────────────────────────────────────────────────────────────────────────

## Phase F summary — POST-F.5

8 findings total. 3 blocking-MVP (#1, #3, #7), 4 nice-to-have-pre-launch
(#2, #5, #6, #8), 1 future (#4).

**Phase F.5 (this commit) closed findings #1, #2, #3, #7, #8** —
5 of 8. Remaining:
- Finding #4 (SMS deep-link) — future, queued behind B09 messaging.
- Finding #5 (Arabic singular/dual/plural age badge) — pre-launch i18n
  polish; not blocking.
- Finding #6 (narrow-viewport <380px QA) — pre-launch manual QA.

B07 backend + patient UI is now feature-complete pending clinic-side
dependent visibility (Phase G), RLS matrix expansion (Phase H),
integration smoke (Phase I), sign-off (Phase J).
