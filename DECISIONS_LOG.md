# MedAssist — Architecture & Program Decisions Log

> Chronological record of every significant technical and design decision.
> Format: Decision ID, date, context, decision, alternatives considered, outcome.

---

## D-001: Next.js App Router over Pages Router

**When**: Project inception
**Context**: Needed a full-stack React framework with server components, API routes, and good TypeScript support for a healthcare SaaS.
**Decision**: Use Next.js 14 App Router with route groups for role-based layouts.
**Alternatives**: Pages Router (simpler but no server components), Remix (less ecosystem), plain React + Express (more boilerplate).
**Outcome**: Route groups `(doctor)`, `(frontdesk)`, `(auth)` give clean URL structure without role prefixes leaking into paths. Server components handle data fetching at layout level.

---

## D-002: Supabase over Firebase / custom backend

**When**: Project inception
**Context**: Need PostgreSQL (relational data is critical for healthcare), auth, real-time subscriptions, and file storage — all in one platform.
**Decision**: Supabase for database + auth + realtime + storage.
**Alternatives**: Firebase (NoSQL, poor for relational medical data), custom PostgreSQL + Auth0 (more ops work), PocketBase (too small-scale).
**Outcome**: Row Level Security (RLS) handles data isolation natively. Supabase Auth manages session cookies. Realtime powers live queue updates. 44 migrations and growing.

> **Footnote 2026-05-04**: As of this audit pass the migration tree contains 109 non-rollback migration files (highest base 106). The "44 migrations" count was accurate at the time D-002 was authored; left unmodified for historical fidelity.

---

## D-003: Arabic-first, RTL-first design

**When**: Project inception
**Context**: Target market is Egyptian healthcare clinics. All users are Arabic speakers.
**Decision**: All UI text in Arabic. Layout is `dir="rtl"` everywhere. Cairo font as primary typeface. English as optional secondary.
**Alternatives**: English-first with Arabic translation layer, bilingual toggle.
**Outcome**: Centralized Arabic strings in `packages/shared/lib/i18n/ar.ts` (~200 keys). Tailwind handles RTL flex/margin/padding automatically. Numbers formatted with `toLocaleString('ar-EG')`.

---

## D-004: Mobile-first over desktop-first

**When**: Figma design phase
**Context**: Egyptian clinic doctors use their phones during consultations. Frontdesk staff use phones at the reception desk. Desktop is secondary.
**Decision**: All layouts use `max-w-md` (428px) mobile container with `mx-auto`. Bottom navigation instead of side nav. Touch-optimized targets (44px minimum).
**Alternatives**: Desktop-first with responsive mobile, tablet-optimized.
**Outcome**: Doctor section complete at mobile viewport. Frontdesk section being redesigned from desktop (`max-w-7xl`) to mobile-first to match.

> **Amendment 2026-04-30**: Mobile container is `max-w-lg` (512px), not `max-w-md` (428px) as originally drafted. The DoctorShell wrapper at `packages/ui-clinic/components/doctor/DoctorShell.tsx:43` uses `max-w-lg` for the mobile breakpoint (`lg:max-w-none` for desktop with right sidebar). The original `max-w-md` figure in this entry's Decision section reflected the Figma spec; implementation widened to `max-w-lg` during the doctor-section build for better content density on Egyptian-market phones (predominantly 6.1"–6.7" devices). The pattern is captured in ARCHITECTURE §9.1 ("Mobile-first `max-w-lg` container") and §9.2 (DoctorShell description). No code change required; this amendment aligns the decision record with shipped implementation.

---

## D-005: Monorepo with npm workspaces

**When**: Early architecture
**Context**: Business logic (auth, data, validation) needs to be shared between the web app and a future mobile app. UI components are role-specific but share design tokens.
**Decision**: Three-package monorepo: `apps/clinic` (web app), `packages/shared` (business logic), `packages/ui-clinic` (React components).
**Alternatives**: Single app (no code reuse), Turborepo-only (added but not required), Nx (too heavy).
**Outcome**: `@medassist/shared` has 60+ modules covering auth, data, SMS, analytics, offline, validation. `@medassist/ui-clinic` has 30 components organized by role. Mobile-strategy-agnostic separation that pays off for the chosen mobile path.

> **Amended 2026-04-25 by D-043**: Mobile target is now Capacitor PWA shell (not Flutter). The monorepo structure is unchanged — the React components and TypeScript business logic in `@medassist/shared` and `@medassist/ui-clinic` are reused inside the Capacitor webview, which is exactly the reuse story this monorepo was designed for.

---

## D-006: Unified RBAC via clinic_memberships

**When**: Migration 018
**Context**: Original design had separate tables: `clinic_doctors` for doctors, `front_desk_staff` for frontdesk. This was fragile — adding a new role meant a new table.
**Decision**: Single `clinic_memberships` table with `role` enum: `OWNER | DOCTOR | ASSISTANT | FRONT_DESK`. Status enum: `ACTIVE | INVITED | SUSPENDED`.
**Alternatives**: Keep separate tables per role, use a generic permissions table.
**Outcome**: One query to check any user's role in any clinic. Invite flow creates membership with `status='INVITED'`. Legacy tables kept for backward compatibility but `clinic_memberships` is the source of truth.

---

## D-007: Doctor-scoped vs clinic-wide patient visibility

**When**: Migration 020
**Context**: Some clinics want doctors to only see their own patients (privacy). Others want all doctors to see all patients (collaboration).
**Decision**: Per-clinic `default_visibility` setting: `DOCTOR_SCOPED` or `CLINIC_WIDE`. Enforced at query level in data layer.
**Alternatives**: Always clinic-wide (simpler but privacy risk), always doctor-scoped (too restrictive for shared clinics).
**Outcome**: Clinic owners configure visibility in settings. Data queries in `visibility.ts` and `frontdesk-scope.ts` respect the setting. Frontdesk always sees all patients regardless of mode.

---

## D-008: createAdminClient requires explicit scope

**When**: Security hardening phase
**Context**: `createAdminClient()` bypasses RLS — extremely powerful. Need audit trail of who uses it and why.
**Decision**: `createAdminClient(scope: string)` requires a scope string (e.g., `'clinical-notes'`, `'api-route'`). Scope is checked against `ALLOWED_ADMIN_SCOPES` set. Default scope `'api-route'` added later to unblock 28 existing callers.
**Alternatives**: No scope (dangerous), per-route admin clients (too much boilerplate).
**Outcome**: Audit-friendly admin access. Every admin query is tagged with its purpose. TypeScript enforces the scope parameter.

> **Amendment 2026-05-04 (audit detour Day 2)**: The Outcome section's claim "Every admin query is tagged with its purpose" is true at the call-site level — every `createAdminClient(scope)` call passes a scope string — but the validation against `ALLOWED_ADMIN_SCOPES` has known drift. Current `ALLOWED_ADMIN_SCOPES` covers ~35 scopes; the codebase uses ~135 distinct scope strings; the unregistered ~100 produce a `console.warn` only at runtime (validation is non-blocking, intentionally — see `admin.ts` comments). The drift accumulated as Builds 02-05 added new scopes without expanding the allow-list. Reconciliation is queued in the **Phase F follow-up tasks** in `audits/PROGRAM_STATE.md`: audit createAdminClient call sites and reconcile against ALLOWED_ADMIN_SCOPES; decide whether to tighten validation to throw, expand the allow-list, or revisit the scope-tracking pattern entirely. Until that work closes, the "audit-friendly admin access" claim is structurally correct but operationally weakened — the scope strings are present in code (good for grep / static analysis) but not enforced at runtime (warning, not blocking). Phase F Task 10 closed in commit `0abce28` — auto-renew-on-visit scope added to allow-list. Broader scope reconciliation remains queued. *(Bookkeeping fix 2026-05-08: this amendment originally cited commit `5ad4003`, an orphan from `git commit --amend`; corrected to `0abce28` per the same Path 2 annotation pattern STATE_OF_WORK.md uses for `d8daa60 → bad1100` and `5ad4003 → 0abce28` — this is the third instance of the off-by-amend pattern caught by REVIEW_CRITERIA §1.2 STATE_OF_WORK currency check during pre-work verification.)*

> **Amendment 2026-05-08 (Phase F Task 16 TRIAGED — inventory + Option D recommendation)**: The 2026-05-04 amendment said "decide whether to tighten validation to throw, expand the allow-list, or revisit the scope-tracking pattern entirely" — i.e., choose between three options. The 2026-05-08 reconciliation pass (`audits/admin-scope-reconciliation-2026-05-08.md`) completed the inventory and chose **Option D (sequenced hybrid)** rather than any of A/B/C alone. The exact numbers: 210 total `createAdminClient(...)` invocations (207 explicit-arg + 3 no-arg defaulting to `'api-route'`); 135 unique scope strings at callsites; 35 entries in `ALLOWED_ADMIN_SCOPES` (precise; the 2026-05-04 amendment's "~35" approximation was correct, the 2026-05-04 → Phase F Task 10 closure note that bumped ARCH §12 to "~36" was off-by-one); 105 callsite scopes missing from the allow-list; 4 truly-unused allow-list entries (`api-versioning`, `input-validation`, `phone-change-rollback`, `privacy-migration-backfill`); 0 typos / near-misses; 0 dynamic template-literal callsites. Naming convention is uniform kebab-case across all 135 callsite scopes (no snake_case, no camelCase, no anomalies). 100% of missing scopes are in production code paths (server route handlers, data-layer libs, auth helpers, app-level routes, server-component pages); zero are in build/test tooling. The largest single cluster is the Build 05 patient-sharing lifecycle (D-068): 18 of the 105 missing scopes. **Option D sequencing**: Phase 1 (this batch) ships inventory + recommendation only — no code change. Phase 2 (next workstream, m): apply Option A (expand allow-list to 132 entries: 35 + 105 missing − 4 truly unused − 4 unused-but-kept-as-default-includes; group by feature with comment dividers) **plus a mandatory eslint / pre-commit rule** that blocks (a) static-string scopes not in the allow-list, (b) ANY non-static-literal `createAdminClient(...)` callsite (template literals, variables, expressions). The eslint rule is non-negotiable — without it, Phase 2 is cosmetic and the same drift recurs. Phase 3 (m): apply Option C.1 (replace runtime `Set` with TypeScript literal-union type `AdminScope`; drop the `Set.has()` check). The Phase 2 eslint rule's static-literal-only check carries forward unchanged; Phase 3 swaps runtime gating for compile-time gating. Option B (runtime throw) is likely **DROPPED** from the sequence — once Phase 2's commit-time check + Phase 3's compile-time check land, runtime throw is redundant. Tracked in `audits/PROGRAM_STATE.md` as Phase F Task 16 (TRIAGED) and Phase F Task 20 (Phase 2 workstream).

> **Amendment 2026-05-09 (B07 Phase C — sibling rule for delegation capability discipline)**: B07 Phase C extends the static-string-discipline pattern to a second tokenized scope: `ALLOWED_DELEGATION_CAPABILITIES` (5 MVP capability tokens — `view_records`, `receive_notifications`, `book_appointments`, `manage_medications`, `consent_to_messaging`; `consent_to_share` is intentionally excluded per Mo ruling 4 / Phase C-E prompt). The literal-union lives in `packages/shared/lib/data/delegations.ts` next to the data layer that consumes it. **New sibling eslint rule** `medassist-local/no-unregistered-delegation-capability` (in `eslint-rules/no-unregistered-delegation-capability.js`) follows the same parse-from-source pattern as `no-unregistered-admin-scope`: regex-extracts the literal at rule-load time, caches per lint run, fires three error classes (unregistered token / template literal / non-literal expression). Trigger surfaces are AST `Property` nodes with key `'capabilities'` (array value, validates each element) or `'capability'` (string value), plus `CallExpression` nodes calling `requireCapability(<gp>, '<cap>')` (Phase E auth helper's static second arg). Sibling rather than extension of the admin-scope rule per Phase C decision-log Decision 9 — same plugin, same `ALLOWED_*` parsing pattern, separate concern with its own allowed set + AST surface + error messages. Wired into `.eslintrc.json` (`medassist-local/no-unregistered-delegation-capability: error`) and the `lint:scopes` package.json script. Empirical drift gate validated against four cases (`'consent_to_share'` rejected as unregistered; `'unknown_token'` rejected; backtick template literal rejected; `'view_records'` passed silently). **Admin-scope allow-list grows by 12 in the same batch (136 → 148)** for the new B07 data-layer call sites: 5 dependent-side scopes (`dependents-create`, `dependents-list-by-guardian`, `dependents-get`, `dependents-transfer-guardian`, `global-patients-guardian-lookup`) and 7 delegation-side scopes (`delegations-grant`, `delegations-accept`, `delegations-revoke`, `delegations-update-capabilities`, `delegations-list-granted`, `delegations-list-received`, `delegations-expire-stale`). Same kebab-case naming convention; one scope per data-layer function for clean audit-trail correlation. **Defense-in-depth posture preserved**: TS literal union (compile time) + eslint rule (lint time) + runtime `Set.has` validation in `validateCapabilities()` (data-layer boundary; surfaces `InvalidDelegationError` for API handler 400 mapping). The runtime check exists for the same reason `createAdminClient` retains its runtime warning during Phase 2 → Phase 3 transition: `as` casts and `as any` at API handler boundaries can defeat the type system. **D-008 amendment posture**: this is the third capability-style enforcement in the project (admin scopes via runtime Set + eslint rule; B07 capabilities via TS literal union + runtime Set + eslint rule). Both follow the same "literal-union + parse-from-source eslint rule + lint:scopes wiring" pattern; the sibling-rule decision sets the precedent that future tokenized scopes get their own rule rather than overloading admin-scope semantics.

> **Amendment 2026-05-09 (Phase F Task 20 DONE — Phase 2 of Option D shipped)**: Phase 2 of the 2026-05-08 amendment's sequenced hybrid plan landed in this batch. **Allow-list expansion: 35 → 136 entries.** (The 2026-05-08 amendment said "132 entries" — that was a math error; correct arithmetic is 35 + 105 missing − 4 truly-unused = 136. The 105 missing scopes were added grouped by feature with comment dividers; the 4 truly-unused were removed in the same pass per the amendment's "don't fragment the survey" guidance.) **eslint rule shipped:** custom rule `medassist-local/no-unregistered-admin-scope` in `eslint-rules/` (rule logic) + `eslint-rules/index.js` (plugin packaging) + `eslint-rules/package.json` (file: linkage); wired into root `.eslintrc.json` `plugins: ["medassist-local"]` + `rules: { "medassist-local/no-unregistered-admin-scope": "error" }`; root devDependencies adds `"eslint-plugin-medassist-local": "file:./eslint-rules"`. Rule fires three classes of error: (a) static literal not in `ALLOWED_ADMIN_SCOPES`, (b) template-literal arg (backticks rejected unconditionally), (c) any non-static-literal arg (variables / function calls / expressions). All three classes empirically validated by smoke tests against contrived bad commits (results: bad-scope error, template-literal error, variable-arg error all fire correctly with their dedicated message IDs). The rule reads `ALLOWED_ADMIN_SCOPES` directly from `admin.ts` source (regex-extracted at rule-load time, cached for the lint run) — no separate maintained allow-list file. **New `lint:scopes` script** in root `package.json` runs the rule across `packages/shared/lib + apps/clinic/app + apps/patient/app` with a minimal eslint config (`--no-eslintrc --no-inline-config --parser @typescript-eslint/parser --rulesdir eslint-rules`) so it doesn't trip on the next/core-web-vitals plugin's missing-rule errors when scanning shared package source files. **Empirical drift gate validated:** the rule blocks the ENTIRE class of drift that produced today's gap — any future callsite adding an unregistered scope OR using a template literal will fail at commit time, not silently produce a `console.warn` at runtime. **Runtime warning retained as defense-in-depth** during Phase 2 → Phase 3 transition; will be removed when Phase 3 (Option C.1 TypeScript literal-union refactor) ships. Phase F Task 20 → DONE; Phase 3 remains queued. The static-literal-only precondition for Phase 3 is now locked at the eslint level (Lesson #18 corollary: locks today's empirical "0 dynamic scopes" forward, not just at the snapshot). Five gates passed: `lint:scopes` clean, three tsc gates clean (root + clinic + patient), per-app `next lint` clean (only pre-existing unrelated warnings).

---

## D-009: Route groups for role isolation

**When**: Early architecture
**Context**: Doctor, frontdesk, and patient each need different layouts (different navigation, different data loading, different permissions) but share the same URL domain.
**Decision**: Next.js route groups: `(doctor)/`, `(frontdesk)/`, `(auth)/`, `(doctor-print)/`. Each group has its own `layout.tsx` with `requireRole()` guard.
**Alternatives**: Single layout with role-based conditional rendering (complex, error-prone), separate Next.js apps per role (deployment complexity).
**Outcome**: Clean separation. Wrong-role access redirects to correct dashboard. Print layout has no navigation chrome. Each layout fetches role-specific data (doctor profile, clinic context, etc.).

---

## D-010: Session verification with exponential backoff

**When**: Stress test round 1 (BUG-001)
**Context**: Original login used `await new Promise(r => setTimeout(r, 150))` — an arbitrary 150ms delay hoping the session cookie would be set. This caused race conditions where users landed on the dashboard without a valid session.
**Decision**: Replace arbitrary delay with a verification loop: poll `/api/auth/check-phone` up to 8 times with exponential backoff (100ms, 200ms, 300ms...). Break early when session is confirmed.
**Alternatives**: Longer fixed delay (unreliable), WebSocket notification (overengineered), server-side redirect (doesn't work with client-side Supabase auth).
**Outcome**: Session race condition eliminated. Login success rate went from ~85% to ~99%. Same pattern applied to OTP page.

---

## D-011: ErrorBoundary with Arabic fallback

**When**: Stress test round 1 (BUG-008)
**Context**: Any unhandled React error caused a white screen with no recovery path. Users had to manually navigate back.
**Decision**: Class-based `ErrorBoundary` component with Arabic fallback UI: "حدث خطأ غير متوقع" (An unexpected error occurred) + reload button. Wraps all major sections.
**Alternatives**: Next.js `error.tsx` files (per-route, more files), third-party error boundary (unnecessary dependency).
**Outcome**: No more white screens. Users see a friendly Arabic error message and can retry. Error details logged via `componentDidCatch`.

---

## D-012: Debounced search + client-side pagination

**When**: Stress test round 1 (BUG-013, BUG-014)
**Context**: Patient search fired API requests on every keystroke. Patient list had no pagination — clinics with 10K+ patients would freeze the DOM.
**Decision**: Custom `useDebounce` hook (300ms) for search inputs. Client-side pagination at 50 patients per page with prev/next controls. Page resets on search/filter change.
**Alternatives**: Server-side pagination (more API complexity), virtual scrolling (react-window — heavier dependency), longer debounce (sluggish UX).
**Outcome**: API calls reduced ~90% during typing. DOM stays responsive even with large patient lists. Pagination controls use Arabic labels.

---

## D-013: Double-click prevention via isSaving guard

**When**: Stress test round 2 (SES-001)
**Context**: Clinical session save had no protection against double-clicks. A fast double-tap could create duplicate clinical notes.
**Decision**: `isSaving` state variable. `handleSave()` returns immediately if `isSaving` is true. Set `true` at start, `false` in `finally` block.
**Alternatives**: Disable button on click (visual-only, not safe), server-side idempotency key (correct but complex for MVP).
**Outcome**: Duplicate saves eliminated. Pattern applied to OTP submission (`isSubmitting`) and all other form submissions.

---

## D-014: SettingsDrawer uses useEffect, not useState

**When**: Stress test round 2 (SD-001)
**Context**: `SettingsDrawer` had `useState(() => { fetch('/api/doctor/stats')... })` — using useState's lazy initializer as a side effect. This runs once on mount regardless of drawer state, and it's semantically wrong.
**Decision**: Replace with `useEffect(() => { if (!isOpen) return; fetch(...)... }, [isOpen])`. Stats only fetch when drawer actually opens.
**Alternatives**: Keep useState hack (works but violates React principles), fetch in parent and pass as props (adds coupling).
**Outcome**: Stats fetch correctly on drawer open. No wasted API calls when drawer is closed. React Strict Mode compatible.

---

## D-015: Single clinical session form over multi-step wizard

**When**: Figma UI/UX overhaul
**Context**: Original session page was a 7-step wizard (patient → complaints → diagnosis → vitals → medications → labs → review). Doctors found it too many clicks for a 5-minute consultation.
**Decision**: Single scrollable form with collapsible sections. Patient search at top, then medical history, doctor notes, prescription (medications + radiology + labs), follow-up date, and action bar at bottom.
**Alternatives**: Keep wizard (familiar but slow), tabbed interface (hidden content).
**Outcome**: Session completion time reduced from ~12 taps to ~4 scroll + tap. Collapsible sections keep the form visually manageable. "..." menu at bottom provides save/print/end options.

---

## D-016: Bottom navigation over top/side navigation

**When**: Figma design phase (amended 2026-04-24)
**Context**: Mobile-first means thumb-reachable navigation. Top hamburger menus require reaching to the top of a 6.5" phone screen.
**Decision**: Fixed bottom navigation bar: 3 items for doctor (schedule, FAB, messages), 6 items for frontdesk (dashboard, check-in, appointments, payments, reports, account). Green FAB in center for doctor's primary action (new session).
**Alternatives**: Top navigation (unreachable), side drawer (hidden, requires discovery), tab bar without FAB (no primary action emphasis).
**Outcome**: Doctor's most-used actions within thumb reach. FAB draws attention to "new session" — the doctor's primary workflow. Frontdesk has all 6 sections visible at all times.

**2026-04-24 amendment**: Added "الحساب" (account) as the 6th frontdesk slot. Original 5-item set left profile reachable only from the dashboard's top-right avatar — frontdesk tester (Nour persona) reported the gap directly: "Profile only opens from the top, not from the bottom nav." The thumb-reach principle still holds with 6 items (each ~62.5px wide on a 375px Samsung A14, comfortably above the 44pt minimum). Mirror change applied to `DesktopSidebar.frontdeskNav` so the lg+ surface matches.

---

## D-017: Queue-centric frontdesk dashboard

**When**: Frontdesk section design (April 2026)
**Context**: The frontdesk dashboard was a generic stats page. Nour (frontdesk persona) needs to know "which doctor is free?" and "how many patients are waiting?" at a glance.
**Decision**: Dashboard is a live queue command center: Doctor Status Cards at top (showing current patient, session timer, queue count, next patient), then stats row, then quick actions grid, then full queue list.
**Alternatives**: Appointment-centric view (schedule is primary), split view (queue + appointments side by side — too wide for mobile).
**Outcome**: Nour can answer "how long is the wait?" without navigating away from the dashboard. Doctor status cards use Supabase Realtime for live updates.

---

## D-018: Live doctor session status visible to frontdesk

**When**: Frontdesk section design (April 2026)
**Context**: Frontdesk needs to manage patient expectations ("Dr. Ahmed will be about 10 minutes"). Without visibility into the consultation room, frontdesk is guessing.
**Decision**: `DoctorStatusCard` component shows: doctor name, current patient name + queue number, session duration timer (progress bar), waiting count, next patient. Data derived from `check_in_queue` where `status = 'in_progress'`.
**Alternatives**: Basic available/busy indicator (too vague), no visibility (frontdesk flies blind), full session details (privacy concern — showing diagnosis is too much).
**Outcome**: Frontdesk sees enough to manage flow (who, how long) without seeing clinical details (what). Timer is visual-only — no alert or auto-complete.

---

## D-019: Phone format validation for Egyptian market

**When**: Stress test round 1 (BUG-003)
**Context**: No validation on phone input. Users could submit international numbers, short strings, or letters. The app targets Egyptian clinics exclusively.
**Decision**: Egyptian phone regex: `01[0125]\d{8}` (Vodafone, Orange, Etisalat, WE). Validation runs before API call with instant Arabic error message. Also accept email format for fallback.
**Alternatives**: Generic international phone validation (libphonenumber — heavy), no validation (trust the user), server-only validation (slow feedback).
**Outcome**: Invalid phones rejected instantly with Arabic message. No API calls wasted on bad input. Regex covers all 4 Egyptian carriers.

---

## D-020: OTP phone match validation

**When**: Stress test round 1 (BUG-002)
**Context**: OTP page read `pendingRegistration` from sessionStorage. An attacker could modify the stored phone number to receive another user's OTP confirmation.
**Decision**: After parsing `pendingRegistration`, compare `regData.phone !== phone` (from URL params). Mismatch shows error and clears sessionStorage.
**Alternatives**: Server-side phone verification only (slower UX), encrypted sessionStorage (complexity), signed tokens (overengineered for MVP).
**Outcome**: Phone tampering detected client-side before any API call. Security hole closed without backend changes.

---

## D-021: Prescription print with MEDA watermark

**When**: Figma design phase
**Context**: Prescription printouts need to look professional and be clearly identifiable as MedAssist-generated documents.
**Decision**: A5/A4 print layout with: clinic header, doctor info, reference number (MED-YY-NNNN), patient info box, numbered medication list with timing badges, labs section, radiology section, doctor notes (optional), signature line, diagonal semi-transparent MEDA watermark.
**Alternatives**: Plain text printout (unprofessional), PDF generation server-side (slower), standard form template (generic).
**Outcome**: Print CSS handles layout. Watermark prevents photocopying fraud. Reference number enables prescription tracking. Timing badges (صباحاً / بعد الأكل / صائم) are inline, not separate columns.

---

## D-022: Invite codes over email-based invitations

**When**: Migration 034
**Context**: Adding frontdesk staff or assistants to a clinic required the owner to know the staff member's email address and send an invitation. This is friction — in Egyptian clinics, the owner just tells the staff "join my clinic."
**Decision**: Short invite codes (XXXX-YY format, alphanumeric). Generated per clinic, stored in `clinics.invite_code`. Staff enters the code to join. Code looked up server-side, membership created.
**Alternatives**: Email invitations only (friction, many don't use email for work), QR codes (requires camera, more complex), phone number lookup (privacy concern).
**Outcome**: Owner shares a 7-character code verbally or via WhatsApp. Staff enters it during onboarding. Membership created with correct role and `status='INVITED'` → `'ACTIVE'` upon acceptance.

---

## D-023: Separate print route group

**When**: Navigation architecture
**Context**: Prescription print needs a completely different layout — no navigation, no header, no bottom bar. Just the prescription content optimized for printing.
**Decision**: Route group `(doctor-print)/` with its own minimal layout. Contains only the prescription print page.
**Alternatives**: Query parameter `?print=true` to hide nav (messy), window.open popup (blocked by browsers), inline print styles (conflicts with app styles).
**Outcome**: Clean print page at `/doctor/prescription-print`. Layout has no chrome. Print CSS handles page breaks and margins. Doctor role still required.

---

## D-024: Centralized access control (Migration 021)

**When**: Multi-tenant security hardening
**Context**: Access control logic was scattered across individual API routes. Each route had its own permission check, leading to inconsistencies.
**Decision**: Centralized access control functions in `packages/shared/lib/data/` — `visibility.ts` for patient access, `frontdesk-scope.ts` for clinic scoping, `memberships.ts` for role validation. API routes call these functions instead of writing inline checks.
**Alternatives**: Middleware-level checks (too coarse), per-route inline checks (inconsistent), database functions (harder to debug).
**Outcome**: Consistent access control across all ~90 API routes. Adding a new route requires calling the appropriate access function, not reimplementing permission logic.

---

## D-025: Gap-aware appointment scheduling

**When**: Migration 039
**Context**: Doctors need buffer time between appointments (e.g., 5 minutes to write notes). Original scheduling packed appointments back-to-back.
**Decision**: `gap_minutes` field on clinics table. `getAvailableSlots()` subtracts gap time from each slot duration. `appointment_window_enabled` boolean controls whether the clinic uses scheduled appointments at all.
**Alternatives**: Fixed 5-minute gap (too rigid), no gaps (doctors complained), per-doctor gap settings (complexity for v1).
**Outcome**: Clinic owner sets gap (default: 5 minutes). Slot calculation respects gap. Walk-in clinics disable the appointment window entirely.

---

## D-026: Notification grouping by date

**When**: Sprint S3
**Context**: Notification list was a flat chronological list. When a doctor has 50+ notifications, it's hard to find today's items vs older ones.
**Decision**: Group notifications into three buckets: اليوم (Today), أمس (Yesterday), سابقاً (Earlier). Each group has a header with a thin divider line.
**Alternatives**: Infinite scroll with no grouping (harder to scan), weekly groups (too granular), unread-only filter (hides history).
**Outcome**: `groupNotifications()` function sorts items into date buckets. Headers render between groups. Clean visual separation matches the doctor section's list design.

---

## D-027: Error handling with Arabic user-facing messages

**When**: Stress test round 1 (BUG-016)
**Context**: API failures were silently caught with `catch {}` — users saw stale data or loading spinners that never resolved. No error messages shown.
**Decision**: Every page that fetches data must have a `loadError` state. On failure, show Arabic error message + retry button. Network errors get a specific message ("تحقق من اتصال الإنترنت"). API errors show the server message.
**Alternatives**: Generic "Something went wrong" in English (not localized), toast notifications (dismissable, easy to miss), error boundary only (catches render errors, not fetch errors).
**Outcome**: Applied to patients page, messages page, notifications page, profile page. Every fetch failure shows an actionable Arabic message with retry. Users no longer see infinite spinners.

---

## D-028: Fire-and-forget Rx Intelligence

**When**: Migration 027
**Context**: Rx Intelligence (drug interaction checks, template suggestions, smart defaults) enriches the clinical session but must never slow down the save flow. A doctor pressing "save" expects instant response.
**Decision**: Clinical note saves synchronously. After save succeeds, Rx Intelligence processing fires as a detached promise — it logs results to a separate table but never blocks or fails the save.
**Alternatives**: Synchronous processing (adds latency), background job queue (infrastructure complexity), skip it entirely (loses valuable data).
**Outcome**: Save latency unchanged. Rx Intelligence data accumulates in the background. If Rx processing fails, the clinical note is still saved. Doctor never notices.

---

## D-029: Dev test accounts in migration (not seed script)

**When**: Testing phase
**Context**: Need reproducible test accounts across environments for QA testing. Seed scripts are error-prone and environment-dependent.
**Decision**: Migration 043 creates 4 test accounts (doctor, frontdesk, patient, doctor-2) with clinics and memberships. Idempotent — checks if accounts exist before creating. All passwords: `Test1234!`.
**Alternatives**: Seed script (not version-controlled with migrations), manual creation (not reproducible), factory functions in tests (not accessible for manual QA).
**Outcome**: Running migrations on any environment creates identical test accounts. All role combinations covered. Multi-clinic scenario included (Clinic A and Clinic B).

---

## D-030: Frontdesk mobile-first over tablet-first

**When**: Frontdesk section design (April 2026)
**Context**: Original frontdesk UI used `max-w-7xl` (desktop). The question was: should the redesign target tablets (frontdesk desks typically have a tablet stand) or phones?
**Decision**: Mobile-first (`max-w-md`), same as doctor section. Egyptian clinic frontdesk staff use their phones, not dedicated tablets.
**Alternatives**: Tablet-first (768px+, larger touch targets), responsive hybrid (mobile base + tablet expansion, more work).
**Outcome**: Consistent design language across doctor and frontdesk sections. Same component patterns, same design tokens, same RTL approach. Future tablet optimization can be added as a progressive enhancement.

---

## D-031: Payment method as inline pill selector

**When**: Frontdesk payment design (April 2026)
**Context**: Payment method selection needs to be fast — Nour collects payment dozens of times per day. A dropdown adds a tap.
**Decision**: Three pill buttons inline: نقد (Cash) | بطاقة (Card) | تأمين (Insurance). Pre-selected to Cash (most common in Egyptian clinics). Single tap to change.
**Alternatives**: Dropdown select (extra tap), radio buttons (more vertical space), icon-only buttons (ambiguous).
**Outcome**: One-tap payment method selection. Cash pre-selected reduces taps further. Transfer option available via 4th pill when needed.

---

## D-032: Payment status `paid` → `completed` for analytics alignment

**When**: 22 April 2026 (hotfix)
**Context**: Doctor analytics dashboard was counting revenue from `payments` where `status = 'paid'`, but the actual status value written by the frontdesk payment flow was `'completed'`. This caused revenue and patient-count queries to return zero. The profile page (which reads from `clinical_notes`) showed correct session counts, creating a confusing mismatch between the two screens.
**Decision**: Update `doctor-stats.ts` to filter on `status = 'completed'` instead of `'paid'`. Minimal, targeted fix — no schema change, no migration.
**Alternatives**: Add a migration to rename the enum from `completed` to `paid` (risky — touches live data), fix at the column level with a check constraint (over-engineering for a string mismatch), fix both pages to read from the same source (larger scope, deferred).
**Outcome**: Analytics revenue and patient counts now return correct numbers. Four related issues (profile clinic mismatch, month-summary header, timezone drift, clinic scoping) were documented but deliberately deferred to separate PRs — see ARCHITECTURE.md §16.

---

## D-033: Deferred-fix-with-notes pattern for multi-issue diagnostics

**When**: 22 April 2026
**Context**: Diagnosing the analytics bug revealed 4 additional issues (TD-001 through TD-004) plus a product-level semantic question ("زيارة" vs "جلسة"). Fixing everything in one PR would mix a critical hotfix with speculative refactors, making rollback dangerous.
**Decision**: Land only the root-cause fix (D-032). Document all observed-but-not-fixed items in a `NOTES.md` file with file paths, line numbers, and blast radius. Transfer findings into ARCHITECTURE.md §16 (Known Technical Debt) for long-term tracking.
**Alternatives**: Fix everything in one large PR (risky rollback, scope creep), create GitHub issues only (loses the diagnostic context and line references), do nothing and revisit later (knowledge lost).
**Outcome**: Clean hotfix PR with zero side effects. Deferred items preserved with full diagnostic context for future PRs. Pattern reusable for future multi-issue investigations.

---

## D-034: Clinic-scoped analytics (resolves OPD-002, TD-004)

**When**: 22 April 2026
**Context**: `getDoctorStats()` filtered only by `doctor_id`. For a multi-clinic doctor this silently summed revenue and patient counts across all clinics, contradicting the multi-tenant model where everything else is scoped to the active clinic.
**Decision**: Add `clinicId` parameter to `getDoctorStats()`, `fetchClinicalNotes()`, and `fetchDoctorPayments()`. API route resolves active clinic via `getClinicContext(user.id, 'doctor')` and passes it through. Exception: `analytics_events` table has no `clinic_id` column, so session-timing KPIs remain doctor-scoped across clinics.
**Alternatives**: Global per-doctor view (useful but inconsistent with the rest of the app), toggle between per-clinic and all-clinics (good but deferred — more UI work).
**Outcome**: Analytics now match the active clinic context. OPD-002 resolved as option 1: scope to active clinic. The `analytics_events` exception is documented; adding `clinic_id` to that table is a future migration if per-clinic timing KPIs are needed.

---

## D-035: Cairo timezone helpers for date boundaries (resolves TD-003)

**When**: 22 April 2026
**Context**: All "today" and "this month" boundaries used `new Date()` (server-local, typically UTC). Egyptian clinics operate in Africa/Cairo (UTC+2/+3). Numbers drifted for 2–3 hours around midnight — a patient seen at 11 PM Cairo time could appear in "tomorrow's" count.
**Decision**: New `packages/shared/lib/date/` module with Cairo-aware helpers: `cairoMonthStart()`, `cairoNMonthsAgoStart(n)`, and related functions. All analytics and profile stat queries now use these instead of raw `new Date()`.
**Alternatives**: Store everything in UTC and convert at display time (correct in theory but every query would need conversion), use a per-clinic timezone setting (over-engineering — MedAssist targets Egypt exclusively).
**Outcome**: Day/month boundaries now align with Cairo local time. Pattern added to §15 Key Architectural Patterns: "never use raw `new Date()` for date boundaries."

---

## D-036: Dual-source analytics — income from payments, visits from clinical_notes (resolves OPD-001)

**When**: 22 April 2026
**Context**: Analytics "زيارة" (visit) count was reading from `payments`, while the profile "جلسة" (session) count read from `clinical_notes`. The two numbers diverged because not every clinical session has a payment and not every payment corresponds to a session. Mo's call: analytics visits should read from `clinical_notes` to match the profile.
**Decision**: `computeIncomeStats()` now uses a dual-source model: income sums come from `payments` only (filtered via `isCollectedPayment`), visit/session counts come from `clinical_notes` only. Both series are merged into unified `byDay`/`byMonth` output. Function exported for testability.
**Alternatives**: Everything from payments (misses unpaid sessions), everything from clinical_notes (no revenue data), single "encounter" table joining both (schema change, too much for this PR).
**Outcome**: OPD-001 resolved. Visit counts now match between analytics and profile. Revenue numbers are accurate because they come from actual payment records. The distinction is clear in the code: payments = money, notes = clinical activity.

---

## D-037: Profile API rewrite with getClinicContext (resolves TD-001, TD-002)

**When**: 22 April 2026
**Context**: `api/doctor/stats/route.ts` had two bugs: (1) it picked `clinic_memberships[0]` without filtering for `status='ACTIVE'` or the cookie-based active clinic, causing multi-clinic doctors to see the wrong clinic name; (2) the "ملخص هذا الشهر" (This Month's Summary) block rendered all-time `totalPatients`/`totalSessions` instead of the month-scoped fields that were computed but never displayed.
**Decision**: Full rewrite. Replace hand-rolled clinic picker with `getClinicContext(user.id, 'doctor')` — same function the `DoctorShell` badge uses. Add `patientsThisMonth` (from `doctor_patient_relationships.created_at >= monthStart`), `feesThisMonth` (month-scoped payments sum), and true all-time `totalFees`. All queries scoped to `activeClinicId`. Month boundary uses `cairoMonthStart()`. Profile page updated to render the month-scoped fields.
**Alternatives**: Patch the existing clinic picker with filters (fragile — doesn't fix the architectural gap), add `clinic_id` param to the frontend request (pushes clinic resolution to the client — wrong layer).
**Outcome**: Profile page clinic name matches `DoctorShell` badge. "This Month's Summary" now shows actual monthly numbers. All stats scoped to active clinic. Two separate bugs fixed by one architectural alignment.

---

## D-038: PAYMENT_STATUS constants and isCollectedPayment predicate

**When**: 22 April 2026
**Context**: The analytics zero-bug (D-032) was caused by hardcoded `'paid'` strings that didn't match the schema's actual `'completed'` value. The same drift could happen anywhere payment status is checked. String literals scattered across queries are a maintenance hazard.
**Decision**: New `packages/shared/lib/data/payments.ts` module exporting `PAYMENT_STATUS` constant object (`pending | completed | refunded | cancelled`) and `isCollectedPayment(status)` predicate. All payment status checks must use these — never hardcode status strings in queries.
**Alternatives**: Enum type in TypeScript only (no runtime check), database-level enum with migration (heavier, breaks existing rows), inline constants per file (doesn't prevent drift).
**Outcome**: Single source of truth for payment statuses. `isCollectedPayment` used by `computeIncomeStats` and frontdesk payment routes. Pattern added to §15 Key Architectural Patterns.

---

## D-039: Calendar-scoped chart windows with zero-fill

**When**: 25 April 2026
**Context**: The analytics day chart used a rolling 30-day slice (`.slice(-30)`) and the month chart used a rolling 12-entry slice (`.slice(-12)`). Both produced sparse series with gaps for days/months with no activity, causing the chart to appear broken. The "٣٠ يوم" label was misleading — it wasn't always 30 days.
**Decision**: Switch to calendar-scoped windows. Day chart = 1st of current Cairo month through today. Month chart = 12 calendar months ending in the current month. Both zero-filled via new `cairoEachDay()` and `cairoEachMonth()` iterators that emit every date key in the range. Client-side `.slice()` removed. Chart label renamed from "٣٠ يوم" to "هذا الشهر".
**Alternatives**: Keep rolling windows but add zero-fill (inconsistent mental model — "30 days" could span two months), server-side aggregation in SQL (harder to test, loses the `computeIncomeStats` testability), keep sparse + let chart library interpolate (most chart libs don't zero-fill by default).
**Outcome**: Charts always show a complete, continuous series. No missing bars. Day chart length varies naturally with the month (28–31 days). Month chart always shows exactly 12 bars. Fetch window aligned: `cairoNMonthsAgoStart(11)` (not 12) so the 12-month series starts at the correct month boundary. `computeTrends` and `computeWeeklyComparison` also migrated to `cairoDateKey` and `cairoNDaysAgoStart` for consistency.

---

## D-040: Cairo date helpers expanded to all date-sensitive surfaces

**When**: 25 April 2026
**Context**: D-035 introduced Cairo helpers for analytics and profile stats. Six additional surfaces still used `new Date()` for "today" boundaries: frontdesk payments route, frontdesk payments update, `getTodayPayments`, frontdesk check-in handler, frontdesk queue-today handler, and doctor appointments handler.
**Decision**: Migrate all six surfaces to Cairo date helpers. Every query that compares against "today" or "this month" now routes through `cairo-date.ts`. The pattern is now app-wide, not analytics-only.
**Alternatives**: Leave frontdesk surfaces on UTC (inconsistent — analytics shows Cairo dates but frontdesk shows UTC dates, could cause a patient to appear in "today's queue" on one screen but not another), batch-fix later (risk of forgetting surfaces).
**Outcome**: All date-sensitive surfaces across doctor and frontdesk sections use Africa/Cairo boundaries. No remaining `new Date()` calls for date boundary logic in the codebase. Updated §15 pattern scope from "Analytics, profile stats" to include "frontdesk, appointments."

---

## D-041: Tenant IDs are server-resolved, never trusted from the client

**When**: 25 April 2026
**Context**: The `b724eb1` build break exposed an unwritten rule: every API handler that writes a tenant-scoped row (anything with a `clinic_id` column) must resolve the clinic from the authenticated session — not from the request body, query string, or any other client-supplied source. The pattern was already implicit in D-034 (clinic-scoped analytics), D-037 (profile API rewrite — "add `clinic_id` param to the frontend request — pushes clinic resolution to the client — wrong layer"), and D-008 (admin client scope), but it was not codified as a standalone rule. The frontdesk payment-create handler was missing it entirely; the clinical-notes handler accepts `clinicId` from the body as a hint without validating it against the user's memberships. With migrations 047 + 051 making `clinic_id` `NOT NULL` across 21 tables, the cost of a missing or wrong server-side resolution is now a hard 500, not a silently-orphaned row.
**Decision**: Tenant IDs (currently: `clinic_id`) must be derived server-side from `auth.uid()` via the canonical resolvers — `getFrontdeskClinicId(supabase, user.id)` for frontdesk routes, `getClinicContext(user.id, role, preferredClinicId?)` for doctor routes — before being written to any row. A handler may accept a *preferred* clinic ID from the client (cookie or body) as a UX hint when a user belongs to multiple clinics, but the value MUST be validated against the user's `clinic_memberships` (status `ACTIVE`) before use; an unvalidated body value is never written. Handlers return `400 NO_ACTIVE_CLINIC` (Arabic message: `لا توجد عيادة نشطة...`) when no clinic resolves.
**Alternatives**: (a) Trust body-supplied `clinicId` (rejected — a malicious or buggy client could write rows into a clinic the user doesn't belong to, defeating multi-tenant isolation; cookies are also client-controlled). (b) Always use the first ACTIVE membership and ignore client hints (rejected — breaks multi-clinic doctors who need to switch contexts via the doctor-shell selector). (c) Database RLS only (rejected — RLS catches reads, not the write-target column; a NOT NULL violation gives a 500 to the user instead of a clean 400). (d) Codify this as part of D-008 (rejected — D-008 is specifically about audit trail for admin-client usage; this is a separate concern about which fields can carry tenant identity).
**Outcome**: The "never trust client-supplied tenant IDs" rule is now an explicit decision. Pattern added to §15 ("Server-resolved tenant scope"). Compliance: frontdesk payment-create handler resolves via `getFrontdeskClinicId` before writing (this PR). Known follow-up: clinical-notes handler currently accepts body-supplied `clinicId` without re-validating against memberships — see TD-006 in §16. Future writes-with-tenant-id endpoints must follow this pattern; reviewers should reject PRs that read a tenant ID directly from `await request.json()` without a server-side resolution + validation step.

---

## D-042: Pre-push type-check gate via Husky

**When**: 25 April 2026 (commit `035f141`)
**Context**: The `b724eb1` build break reached Vercel before CI could catch it. Vercel builds on push without waiting for the GitHub Actions `lint-and-typecheck` job — by the time CI fails, Vercel has already deployed a broken build. The root cause was a missing `clinicId` argument in the frontdesk payment-create handler, which `tsc` would have caught locally.
**Decision**: Add `.husky/pre-push` hook that runs `npm run type-check -w @medassist/clinic` — the same step CI runs. Activates automatically after `npm install` via the new `prepare: husky` script in root `package.json`. Blocks `git push` if type-check fails.
**Alternatives**: Pre-commit hook (too slow — runs on every commit, not just push), CI-only with branch protection (Vercel still races ahead), Vercel ignore build step script (fragile — requires maintaining a custom script), move to preview deployments only (loses the fast-deploy workflow Mo prefers).
**Outcome**: Developer-side gate closes the Vercel/CI race from the local machine. A `b724eb1`-class error now fails `git push` before it reaches origin. CI remains the authoritative check for PRs and non-local pushes. First Husky usage in the repo.

---

## D-043: Mobile shell strategy is Capacitor PWA, not Flutter

**When**: 25 April 2026
**Context**: D-005 originally named Flutter as the future mobile target, motivating the monorepo's TS-only business-logic separation. Months later the codebase actually accumulated Capacitor scaffolding (`@capacitor/core`, `@capacitor-community/sqlite`) inside `packages/shared/lib/offline/`, with the Capacitor packages never installed. Investigation showed those imports had been silently producing 3 TS2307 errors and were unreachable from any web entry point. The "Capacitor vs Flutter" question was implicitly open in the docs and explicitly open in the code.
**Decision**: Mobile shell will be **Capacitor PWA** wrapping the existing Next.js app. Same UI codebase ships to web, iOS, and Android via a webview + native plugin bridge. Flutter is rejected as the mobile target.
**Alternatives**:
- *Flutter (rejected)*: separate Dart codebase, zero TS reuse, every screen rewritten, ~3–6 month dedicated effort, permanent doubled maintenance. Right answer only if MedAssist needed sustained native performance (real-time imaging, heavy graphics) or had a Flutter-fluent collaborator. It does not.
- *React Native (rejected)*: would reuse business logic but not UI components — `@medassist/ui-clinic` would still need to be rewritten with native components instead of HTML.
- *PWA only (no native shell, rejected)*: App Store / Play Store presence is a distribution requirement for Egyptian clinic acquisition; pure PWA can't be listed.
**Outcome**:
- D-005 amended to remove Flutter language. Monorepo structure unchanged — Capacitor uses the same React + TypeScript code.
- All Capacitor TS scaffolding currently in the repo (`lan-discovery.ts`, `lan-sync.ts`, `local-db.ts`, etc.) is deleted in this commit. It was unreachable, broken at runtime per TD-007, and not a working starting point for an actual Capacitor build. When mobile work begins, it will be initialized fresh via `npx cap init` against installed `@capacitor/cli`.
- ARCHITECTURE.md §1 updated.

---

## D-044: LAN sync deferred until Capacitor mobile shell ships

**When**: 25 April 2026
**Context**: Original `offline/lan-discovery.ts` + `offline/lan-sync.ts` proposed peer-to-peer sync over the clinic's local WiFi (UDP broadcast for discovery, HTTP server on each device). Real LAN peer discovery requires native runtime capabilities (UDP socket binding, mDNS, in-process HTTP server) that browsers do not have and cannot polyfill. The proposed "registration endpoint" web fallback in the original design didn't actually solve the offline case (the registration endpoint also requires the internet that's currently down).
**Decision**: LAN sync is deferred. The product will ship single-device offline-first via `idb-cache.ts` (IndexedDB queue + reconnect-replay) only. LAN peer sync is gated on (a) the Capacitor mobile shell shipping (D-043), (b) every device in a clinic running the Capacitor build (not the web app), and (c) production telemetry showing meaningful operational time lost to multi-minute outages with multiple staff actively typing during the same window.
**Alternatives**: Ship LAN sync now with a web-only fallback that doesn't actually work offline (rejected — false UX), build a LAN sync proxy server hosted at the clinic on a dedicated device (rejected — distribution & support nightmare for solo founder).
**Outcome**: LAN-related files removed from the repo in this commit. **Re-evaluate this decision after Capacitor mobile builds are shipping to production clinics.** If outage telemetry and clinic feedback support the feature, design a fresh LAN sync against the actual `@capacitor/network` and `@capacitor-community/udp` APIs — not from the deleted scaffolding, which assumed Capacitor v3 patterns that may not match current APIs by then.

---

## D-045: Root `tsc --noEmit` added to CI gate and pre-push hook (extends D-042)

**When**: 25 April 2026
**Context**: D-042 added a pre-push hook running `npm run type-check -w @medassist/clinic`. That command uses `apps/clinic/tsconfig.json`, whose `include` glob is relative to `apps/clinic/` and therefore does not see `packages/shared/**`. The 3 long-standing Capacitor TS2307 errors lived in `packages/shared/lib/offline/*` and were invisible to D-042's gate. They were only surfaced by running root-level `tsc --noEmit` (root tsconfig has `"include": ["**/*.ts", "**/*.tsx"]`). The "one accidental import away" risk class identified in the investigation report (§9) needed a wider gate.
**Decision**: Add `npm run type-check` (root, equivalent to `tsc --noEmit` from repo root) to:
- `.github/workflows/ci.yml` as a required step alongside the existing per-workspace type-checks.
- `.husky/pre-push` as a step that runs alongside the existing per-workspace one.
**Alternatives**: Replace the per-workspace checks with root-only (rejected — root is slower; per-workspace fails faster on common cases), enable `typescript.ignoreBuildErrors` in `next.config.js` (rejected — silences real errors), webpack-alias `@capacitor/*` to `false` to neutralize the specific errors (rejected — addresses symptom not class).
**Outcome**: The root gate catches monorepo-wide phantom imports that the per-workspace gate misses by design. Pre-push is now slower (~15s on cold cache) but produces a passing-CI guarantee. Skip with `git push --no-verify` for explicitly WIP branches.

---

## D-046: Phone validation audit — canonical helpers over per-surface reinvention

**When**: 25 April 2026 (commit `8937b2e`, local)
**Context**: A frontdesk tester reported "مفيش تحذير للارقام الغلط" (no warning for wrong numbers). Investigation found the canonical server-side validator (`validateEgyptianPhone` in `phone-validation.ts`) existed but no client code imported it. Instead, 6 surfaces had reinvented validation with different regex patterns, error wording, and trigger timing. 3 surfaces had no validation at all. The frontdesk register page had a UX trap: `isFormValid` used `phone.length === 11` (not the regex), so invalid prefixes like `019` enabled the submit button while a 10-digit typo disabled it silently with no inline error.
**Decision**: Full validation-layer audit. Expand `phone-validation.ts` with client-oriented helpers: `getEgyptianPhoneError(phone)` (strict, for form submission) and `getEgyptianPhoneSearchError(phone)` (lax, for search inputs — see D-047). Also added `EGYPT_LOCAL_PHONE_RE`, `normalizeEgyptianDigits` (Arabic-Indic → Latin conversion), and `isValidEgyptianLocalPhone`. Migrated all 9 client surfaces to import from the canonical module. Replaced `isPhone` length-stub in `schemas.ts` with a `validateEgyptianPhone` call. Frontdesk register page fixed: `isFormValid` now calls `isValidEgyptianLocalPhone` (regex-based), and phone input validates `onBlur` (not submit-only) matching the auth page UX from D-019.
**Alternatives**: Fix only the frontdesk register page (quick but leaves 5 other drifted surfaces and 2 unvalidated ones), create a `<EgyptianPhoneField>` React component (forms vary too much — auth has a `+20` chip, doctor modal is different, search inputs serve dual purpose), create a custom hook (same problem — visual presentation differs per surface).
**Outcome**: 0 inline phone regexes remaining on the client side. Single canonical Arabic error wording for prefix and length errors. All 9 surfaces now validate consistently. Pattern added to §15 ("Canonical phone validation"). Server auth handlers left untouched — see TD-009.

---

## D-047: Two phone validation helpers — strict form vs. lax search

**When**: 25 April 2026
**Context**: A single `getEgyptianPhoneError` function couldn't serve both form fields and search inputs. Form fields need strict validation (reject on submit if prefix or length is wrong). Search inputs need tolerance: a user typing `012` is "still typing" and shouldn't see an error; a pasted `1234567890` (10 digits without leading zero) should be usable for lookup even though it's not a complete phone number.
**Decision**: Two separate helpers. `getEgyptianPhoneError(phone)` — strict: returns Arabic error string for any invalid phone, `null` if valid. Used by all form submit/blur validation. `getEgyptianPhoneSearchError(phone)` — lax: returns `null` (no error) for empty input, strings shorter than 11 chars (still-typing), and 10-digit strings without leading zero (paste tolerance). Only errors on clearly-wrong input (wrong prefix with full length, non-digit characters after normalization).
**Alternatives**: One function with an `options.strict` boolean (harder to reason about — caller must remember which mode to use, and the "lax" behaviors are specific to search UX, not a generic relaxation), per-surface inline logic (what we just eliminated in D-046).
**Outcome**: Clean separation. Forms call `getEgyptianPhoneError`, search inputs call `getEgyptianPhoneSearchError`. Both import from the same module, share the same regex constant, and produce the same Arabic error strings when they do error.

---

## D-048: RLS rewrite strategy — additive-then-cleanup, ascending blast radius

**When**: 25 April 2026 (migrations 052–068)
**Context**: The original RLS rewrite (mig 020/021) was supposed to drop legacy policies and replace them with clinic-scoped ones, but mig 021's `DROP POLICY IF EXISTS` names didn't match the actual live policy names — so the drops were no-ops and the rewrite was effectively additive anyway. Investigation confirmed live schema had drifted from what the migration source assumed. Additionally, 4 tables (`vital_signs`, `lab_orders`, `lab_results`, `lab_tests`) had policies defined but `relrowsecurity=false` — meaning tenant-isolation was relying entirely on app-layer query filters. The `clinic_memberships` SELECT policy used a self-referential subquery that caused infinite recursion under the `authenticated` role.
**Decision**: Split the work into three phases: (1) Foundation (052–054): seed `patient_visibility`, create enums, create SECURITY DEFINER access-control functions. (2) Per-table policies (055–067): additive only — new clinic-scoped policies alongside legacy ones, no drops. Fix the `clinic_memberships` recursion (mig 056). Enable RLS on the 4 dormant tables (mig 057). Order tables by ascending row count (vital_signs: 0 → patients: 35) so access-control functions are battle-tested on cheap tables before touching identity tables. Promote parent tables ahead of children (lab_orders before lab_results, conversations before messages). (3) Cleanup (068, staged): batch-drop 11 redundant legacy SELECTs, 5 cross-clinic-leak policies, and the permissive clinical_notes INSERT. Preserve mig 021's verbose policy forms verbatim even where simpler equivalents exist — per the "never silently deviate" architecture rule.
**Alternatives**: Execute mig 021 as-is (would silently fail the drops, leaving both old and new policies active with no cleanup plan), single migration replacing everything (no rollback window between add and drop), drop-first-then-add (if the add migration fails, the table has no policies at all).
**Outcome**: 16 migrations applied without incident. Additive phase gives a rollback window — if a new policy causes unexpected denials, the legacy policy is still there as a fallback. Cleanup migration (068) is staged and can be landed after a soak period. Two pre-existing bugs found and fixed: the `clinic_memberships` recursion (mig 056) and the 4 dormant-RLS tables (mig 057). Backfilled 3 NULL `appointments.clinic_id` rows that mig 051 missed (found during mig 053).

> **Amendment 2026-05-04 (post-Foundation-Audit)**: The Decision section describes a three-phase strategy where mig 068 was scoped as the cleanup phase. Reality: mig 068 was **aborted** mid-2026-04 and the cleanup work was absorbed into the broader Prompt 6 RLS rewrite (mig 092-097), which both replaces the legacy 055-067 policy set with a new generation built on the global identity layer (D-061) AND drops the redundant legacy policies in the same era. The 055-067 policies remain in place during the additive-then-cleanup overlap (per the strategy this entry describes); the cleanup now happens in Prompt 6.5 (Legacy Cleanup) rather than in a standalone mig 068. The mig 068 file remains in the repo as a known-skipped artifact awaiting `.RETIRED` annotation or delete (Phase F follow-up). The strategy itself — additive-then-cleanup with ascending blast radius — is unchanged; only the migration numbers shifted. Captured in ARCHITECTURE §8.6 (rows 055-067 and 068).

---

## D-049: Three RLS policy patterns for clinic-scoped access

**When**: 25 April 2026
**Context**: 14 tenant-scoped tables needed clinic-scoped RLS policies. Each table's access model falls into one of three categories based on how the table relates to the clinic. Needed a small set of composable patterns rather than bespoke policies per table.
**Decision**: Three patterns, each using the SECURITY DEFINER access-control functions from mig 054:
1. **`can_access_patient` triple-OR** — for clinical tables where access flows through the patient (vital_signs, imaging_orders, lab_orders, clinical_notes, patients). The function checks: is the user the patient themselves, is the user the treating doctor, or is the user a member of the patient's clinic.
2. **`is_clinic_member` triple-OR** — for operations tables where access flows directly through clinic membership (check_in_queue, conversations, payments, appointments). Simpler: is the user a member of the row's clinic.
3. **EXISTS-via-parent** — for child tables that don't carry `clinic_id` directly (lab_results → lab_orders, messages → conversations). Policy uses an EXISTS subquery joining to the parent table, which already has its own `is_clinic_member` or `can_access_patient` policy.
**Alternatives**: Bespoke policies per table (17 unique policy bodies to maintain), single uber-function (too many parameters, too many code paths), RLS on parent-only with views for children (PostgreSQL doesn't propagate RLS through views by default).
**Outcome**: 14 tables covered by 3 patterns. Pattern choice is deterministic from the table's position in the schema graph: clinical leaf → pattern 1, operations root → pattern 2, child of either → pattern 3. New tables added in the future should follow the same pattern selection. Important operational note: all 32 live `patient_visibility` grants point to OWNERs — production is effectively all solo clinics today. The multi-doctor visibility machinery is preparing for a future state.

> **Amendment 2026-04-30 → 2026-05-03 (Prompt 6 RLS rewrite + forensic mig 106)**: The Decision section names three patterns built on the mig 054 access-control functions (`can_access_patient`, `is_clinic_member`, `get_clinic_role`). The Prompt 6 RLS rewrite (mig 092-097 + 094a) introduced a new helper set on the global identity layer (D-061) and a hybrid INVOKER/DEFINER security mode (D-064). The new helpers are: `is_clinic_member` (DEFINER, redefined), `can_clinic_access_global_patient` (INVOKER post-mig-106), `can_patient_access_global_patient` (INVOKER post-mig-106), `can_view_patient_data_at_clinic` (DEFINER), and `user_has_clinic_path_to_gp` (DEFINER, post-094a). The mig 054 helpers (`can_access_patient`, `get_clinic_role`) remain defined on staging to support the legacy 055-067 policy set during the additive-then-cleanup overlap; both are scheduled for retirement in Prompt 6.5. The three policy patterns themselves remain valid as a categorization of how clinic-scoped access decomposes (helper-function predicate / `is_clinic_member` triple-OR / EXISTS-on-parent), but pattern 1's helper changed: from `can_access_patient` (mig 054) to `can_view_patient_data_at_clinic` and `can_clinic_access_global_patient` (mig 092). Pattern 3's EXISTS-on-parent usage narrows after Prompt 6.5 to `messages` → `conversations` (mig 063) only; `lab_results` → `lab_orders` (mig 060) is supplanted by the new mig 094 helper-function pattern. Captured in ARCHITECTURE §12.

---

## D-050: Offline-write Phase 1 — IndexedDB queue with replay-safe idempotency (resolves TD-008)

**When**: 26 April 2026
**Context**: After D-043/D-044 cleanup, `idb-cache.ts` exposed offline-write primitives but no actual write surface enqueued. Frontdesk check-in, payment create, and clinical-note save still hit the network directly with no offline fallback. Egyptian clinic internet is unstable — queueing writes during outages is a real product requirement, not a future-proofing exercise (TD-008).
**Decision**: Three coordinated changes:
1. **Storage unification.** `useOfflineMutation` hook refactored from localStorage onto `idb-cache.addPendingWrite` / `syncPendingWrites` / `getPendingWriteCount`. Same hook API for components; different backend. One-shot legacy-localStorage drain runs on first hook mount post-deploy so no clinic loses pending writes during the upgrade.
2. **Server idempotency.** Two paths by surface:
   - **Check-in** uses natural dedupe (`patient_id` + `doctor_id` + Cairo-day): handler returns 200 with `deduped: true` and the existing record, instead of the previous 409. `idb-cache.syncPendingWrites` treats both 2xx and 409 as success, so this is belt-and-suspenders for any older client still in production.
   - **Payments + clinical_notes** have no natural dedupe (a doctor can legitimately write 2 notes for the same patient, a patient can pay cash twice in a visit). Migration 069 adds `client_idempotency_key TEXT` with a partial unique index (`WHERE NOT NULL`) on both tables. Client surfaces (`payments/new`, `SessionForm`) generate `nanoid()` per submit attempt; handlers look up by key first, return existing record on hit.
3. **Test discipline.** New `packages/shared/hooks/__tests__/useOfflineMutation.test.ts` follows the existing compile-time-witness pattern (`frontdesk/payments/create/__tests__/handler.test.ts`). Locks the hook surface, the `clientIdempotencyKey: optional` data-layer contract, and the idb-cache 409-as-success invariant.
**Alternatives**: Generic `idempotency_keys` table with handler-wrapping middleware (more infrastructure, higher blast radius — not justified for two write surfaces), per-endpoint inline dedupe with no schema change (works for check-in only, not generalizable), Capacitor SQLite (the previously-deleted dead code) revived — rejected since web/PWA must work standalone (D-043).
**Outcome**: TD-008 resolved. All three high-frequency frontdesk write surfaces now queue offline and replay safely on reconnect. `OfflineIndicator` badge accurately reflects pending writes (was always 0 pre-TD-008 because the localStorage queue and the IDB-backed badge were disconnected). Phase 2 work — auth-refresh-mid-replay for outages longer than the JWT lifetime, and per-row "this is queued" UI affordances — remains a separate follow-up if production telemetry shows outages long enough to need it.

---

## D-051: Phone is identity — dual-OTP verification with auth-side sync

**When**: 26 April 2026 (commits `8be5484`, `1ab442d`, `cf7d465`)
**Context**: Phone number is the global patient identity in MedAssist's architecture. Changing it affects `public.users.phone`, `auth.users.phone` (53 of 288 accounts authenticate directly against this), and every `patients.phone` row across all clinics. A naive update to `public.users.phone` alone would silently break login for phone-only auth users (walk-in patients onboarded via `createWalkInPatient`). The legacy frontdesk profile PATCH accepted any 10+ character string with no validation, no audit, and no OTP. Migration 013/041 had scaffolded `phone_change_requests` and OTP purposes but the app never wired them.
**Decision**: Three-phase approach. **Phase A** (immediate): tighten the existing frontdesk PATCH with canonical validation (`getEgyptianPhoneError`), audit logging (`logAuditEvent` with `pathway: 'phase_a_legacy_no_otp'`), and a 30-day removal trigger (TD-014). **Phase B** (server-side, feature-gated): full dual-OTP verification — user proves ownership of both old phone and new phone before the change commits. `change_phone_commit` RPC does atomic SQL propagation across all clinics; on success, `supabase.auth.admin.updateUserById` syncs `auth.users.phone`; on auth-admin failure, `change_phone_rollback` RPC fires as a compensating transaction. **Phase C** (typo correction): lightweight path for frontdesk to fix data-entry typos without OTP, scoped to the frontdesk's own clinic only. All Phase B/C endpoints gated behind `FEATURE_PHONE_CHANGE_V2` env flag — deployed but dormant until flipped. Client UI (PR-3) not yet started (TD-011).
**Alternatives**: Update `public.users.phone` only (breaks 53 phone-only auth accounts), single-OTP on new phone only (weaker security — no proof the requester controls the old phone), skip feature flag and ship everything at once (too risky for identity-critical flow), use Supabase edge functions for the commit (adds latency, makes rollback harder, no local dev parity).
**Outcome**: Migration 070 live in production. `phone-changes.ts` data module (~1400 lines, 8 public functions: `requestPhoneChange`, `verifyPhoneChangeStep`, `cancelPhoneChange`, `openPhoneChangeFallback`, `getPendingPhoneChangeRequests`, `approvePhoneChangeRequest`, `rejectPhoneChangeRequest`, `correctPatientPhone`) orchestrates the full lifecycle. Phase A live and audited. Phase B server endpoints return 404 behind flag. 1 pre-existing divergent `auth.users.phone` row discovered and flagged (TD-015). See also OPD-004 (cross-clinic identity merging deferred to Phase 2).

---

## D-052: Self-approval banned for phone-change fallback requests

**When**: 26 April 2026
**Context**: When a user cannot receive OTP on their old phone (lost/stolen), they open a "fallback" request that requires OWNER approval. In solo clinics the OWNER is also the doctor — and potentially the user requesting the change. Allowing self-approval would eliminate the security benefit of the approval step entirely.
**Decision**: `approvePhoneChangeRequest` rejects with 403 when `request.user_id === ownerId`. Solo doctors who lose their phone must go through a support email route. The rejection message is clear ("لا يمكنك الموافقة على طلب تغيير رقمك" — you cannot approve a request to change your own number).
**Alternatives**: Allow self-approval with extra verification step (adds complexity, dubious security gain), require a second OWNER to approve (most clinics are solo — there is no second OWNER), time-delayed self-approval (adds 24-48h delay, still fundamentally self-approving).
**Outcome**: Clean security boundary. Solo-clinic doctors are the majority of the user base (validated in D-049's operational note). The support email route is the existing Anthropic pattern for account recovery in identity-critical systems.

---

## D-053: Cross-clinic phone propagation is strict — no identity merging

**When**: 26 April 2026
**Context**: When a phone change commits, `change_phone_commit` RPC propagates the new phone to `patients.phone` rows across all clinics. But the same physical patient may exist under different phone numbers in different clinics (e.g., patient gave Clinic A their personal number and Clinic B their work number). Unconditional propagation would overwrite Clinic B's intentionally-different phone.
**Decision**: Propagation only touches `patients.phone` rows where the phone exactly matches the OLD phone. If Clinic B has the same patient under a different phone, B's row is untouched. Cross-clinic identity merging (recognizing that two patient rows in different clinics are the same physical person) is deferred to the Phase 2 patient-app feature (OPD-004).
**Alternatives**: Propagate to all patient rows regardless of current phone (would overwrite intentional differences), use a `global_patient_id` to link cross-clinic records (requires the patient identity network from Phase 2 — not built yet), prompt the user to confirm each clinic (UX complexity, requires knowing which clinics the patient visits).
**Outcome**: Conservative and safe for Phase 1. The strict match ensures no data corruption. Identity merging becomes a core feature of the patient mini-portal (Phase 2, PRODUCT_SPEC.md §Phased Expansion).

---

## D-054: Phase A storage format — validate strictly, write back local 11-digit form

**When**: 26 April 2026
**Context**: Plan §5.8 specified writing the normalized 12-digit no-plus form (`201xxxxxxxxx`). But production data analysis revealed `users.phone` is heterogeneous: 170/288 in local 11-digit form (`01xxxxxxxxx`), 37 in `+201...`, 9 in `201...`, 72 in other shapes. The login handler regex matches a fourth shape (`/^\+2001[0125]\d{8}$/`). Canonicalizing in Phase A would introduce a 5th storage shape and could break login for users whose auth record expects the shape they registered with.
**Decision**: Phase A validates strictly via `getEgyptianPhoneError(normalizeEgyptianDigits(phone))` but writes back the cleaned local 11-digit form (matching the 170/288 majority). Storage canonicalization stays in TD-009 — it requires updating the auth handler regex (which has a `DEV_BYPASS_OTP` branch that complicates a direct swap) and a one-time migration of all existing phone values to a single canonical form.
**Alternatives**: Canonicalize to 12-digit now (risk of breaking login for 118+ users in non-majority formats), canonicalize to E.164 `+201...` (same risk, plus existing code that strips `+2` prefix would need updating), skip Phase A entirely and wait for Phase B (leaves the frontdesk PATCH unvalidated and unaudited for weeks).
**Outcome**: Deviation documented in code with a comment pointing to TD-009. Phase A is live and safely validates without introducing login risk. The 11-digit write-back matches what `createWalkInPatient` and the registration flow already produce.

---

## D-055: Frontdesk-as-proxy pattern for patient phone changes

**When**: 26 April 2026
**Context**: Egyptian clinic workflow: the patient is physically present, the frontdesk staffer operates the computer, and the patient provides information verbally. For phone changes (Flow E in the plan), the frontdesk staffer needs to initiate the change on behalf of the patient, but the OTP goes to the patient's phone — the patient reads it aloud or shows the screen to the staffer.
**Decision**: All change-phone endpoints accept a `frontdesk` actor role in addition to the user's own role. The handler validates `actor.role === 'frontdesk' AND patient.clinic_id === getFrontdeskClinicId(actor)` to ensure the frontdesk staffer can only initiate changes for patients in their own clinic. Audit metadata records `actorRole: 'frontdesk_proxy'` so the audit trail distinguishes self-initiated changes from proxy changes. Patient role is also accepted in all endpoints for forward compatibility — patient-side UI ships in Phase 2.
**Alternatives**: Require the patient to use their own device (breaks the physical-world workflow — many patients don't have smartphones or aren't tech-literate), create a separate set of "frontdesk phone change" endpoints (duplicate logic, harder to maintain), use a generic "on behalf of" parameter (too abstract — the proxy pattern is specific to the frontdesk-patient physical-presence relationship).
**Outcome**: Mirrors the existing physical-world workflow digitally. The `getFrontdeskClinicId` guard (D-041 pattern) ensures tenant isolation. Audit trail clearly distinguishes proxy vs. self-initiated changes for compliance and dispute resolution.

---

## D-056: Hand-rolled validation over Zod for phone-change handlers

**When**: 26 April 2026
**Context**: The phone-change plan (§5.0) suggested introducing Zod for request validation across the 8 new handlers. The existing codebase uses a `validateBody` pattern with inline shape checks — no handler in the app currently uses Zod.
**Decision**: Keep the existing `validateBody` pattern. Handlers do inline shape checks (UUID format, string length, enum membership) matching the established codebase convention. Adding Zod for 8 handlers alone would introduce a new dependency with a different mental model, without the critical mass to justify it. Net validation coverage is identical.
**Alternatives**: Introduce Zod for phone-change handlers only (one-off dependency, inconsistent with rest of codebase), introduce Zod repo-wide (too large a refactor for this PR), use `io-ts` or `superstruct` (same one-off problem, less ecosystem support than Zod).
**Outcome**: Consistent with existing codebase patterns. If a future decision introduces Zod repo-wide, the phone-change handlers can be migrated then. Zero new dependencies added.

---

## D-057: Phone-first registration UI — name/age/sex disabled until phone is valid

**When**: 26 April 2026
**Context**: A frontdesk tester reported (in Egyptian Arabic) that the Register page didn't surface existing patients while she typed the name, but as soon as she submitted "as new" the server told her the patient was already saved. Investigation traced this to a real architecture/UX divergence: phone is the canonical patient identity (D-051) and `onboardPatient` deduplicates on phone exact match only, but the Register page placed the name field above phone and gave the name input no typeahead. The phone field had typeahead all along — it just wasn't where the assistant looked first. The result was a guaranteed dead-end whenever an assistant followed the natural conversation order ("اسمك إيه؟ … رقم تليفونك إيه؟").
**Decision**: Phone is the gate. On `/frontdesk/patients/register`, the phone field renders first and autoFocuses on mount; the name, age, and sex inputs (including the gender segmented control) are disabled until `isValidEgyptianLocalPhone(phone)` returns true. A green helper banner sits above the disabled fields explaining "أدخل رقم الهاتف أولاً للتحقق من المريض. باقي الحقول هتتفتح بعد كده." Phone typeahead and the existing DUPLICATE PATIENT DIALOG are unchanged — they were already correct, just unreachable through the previous field order. Name search is explicitly *retained* on the Check-in page as a discovery aid; identity remains phone everywhere.
**Alternatives**: Reorder phone-first but keep all fields enabled (loses the architectural enforcement — assistants can still fill name first and hit the post-submit dead-end), add fuzzy name typeahead to the Register page (Option B in the investigation — promotes name to a discovery primitive on a *registration* form, conflicts with phone-as-identity), keep current order and address via documentation/training only (does not solve the user's complaint).
**Outcome**: The "I added new and it told me already saved" failure mode is eliminated by construction — every existing-patient detection happens at the phone field, before the assistant invests data entry. Name search remains available where it belongs (Check-in page). The discovery-vs-identity distinction is now visible in the UI: discovery happens on Check-in, identity is established on Register.

**Companion fix**: `/api/patients/search` frontdesk path was sourcing patient IDs from `clinical_notes` + `appointments`, which silently excluded patients registered without a visit yet. Switched to `doctor_patient_relationships` filtered by `clinic_id` (NOT NULL since mig 051) — the canonical "patient is in this clinic's universe" signal. Without this fix, the Check-in page's name search would still miss freshly-registered walk-ins.

---

## D-058: Appointment empty-slots fix — onboarding auto-seed + API reason field + Arabic UX

**When**: 26 April 2026
**Context**: Frontdesk tester reported "مفيش اختيارات للمواعيد" (no options for appointments) — the time-slot picker rendered empty in the booking flow. Investigation via Supabase MCP against production revealed an onboarding gap, not a code bug: only 4 of 109 doctors (3.7%) had active `doctor_availability` rows. The remaining 105 had zero rows, so `getAvailableSlots()` correctly returned `[]`, and the UI displayed a silent generic English message with no actionable guidance. `clinics.settings` (D-025) was also empty for every clinic — the jsonb fields never shipped. Three ranked hypotheses confirmed with SQL evidence before proposing any fix.
**Decision**: Fix three layers simultaneously:
1. **Onboarding auto-seed**: `createDoctorAccount()` in `users.ts` now seeds 5 default `doctor_availability` rows (Sun–Thu 09:00–17:00, 15-min slots, matching mig 043 dev accounts). Uses `upsert` with `onConflict: 'doctor_id,day_of_week,start_time'` and `ignoreDuplicates: true` for idempotency. Failure logs but does NOT fail registration — availability is a feature, not an identity prerequisite.
2. **API reason field**: `getAvailableSlots()` return type changed from `AvailableSlot[]` to `AvailableSlotsResult` with a `SlotReason` enum (`'ok' | 'no_availability_configured' | 'doctor_off_today'`). Replaced per-day `.single()` query with one fetch of all active rows + `.find()` by dayOfWeek — both empty cases distinguishable in a single round-trip.
3. **Arabic UX**: `AppointmentBookingForm.tsx` renders reason-specific RTL Arabic messages — amber callout for `no_availability_configured` ("لم يتم ضبط مواعيد عمل هذا الطبيب بعد") surfacing the actionable next step, gray callout for `doctor_off_today` ("الطبيب غير متاح في هذا اليوم").
**Alternatives**: Backfill all 105 existing zero-availability doctors (rejected — Mo's explicit choice; owners should configure manually), seed via migration instead of onboarding code (only helps new doctors, doesn't establish the pattern for future role-specific defaults), add a "set up availability" wizard to the onboarding flow (over-engineering for Phase 1).
**Outcome**: New doctors get working slots immediately. Existing empty-availability doctors see an actionable Arabic message instead of a silent blank. API reason-enum pattern is reusable for other empty-state endpoints. 105 existing doctors NOT backfilled by design — onboarding auto-seed only applies to new registrations.

---

## D-059: clinic_id write-path fix — check-in and appointments silently broken for ~36 hours

**When**: 26 April 2026
**Context**: Frontdesk tester reported "مش بيحفظ المواعيد في تسجيل وصول / ولا بيحفظ في المواعيد" — neither check-in nor appointment was saving. Investigation traced to a direct consequence of the D-041 migrations: mig 051 added `check_in_queue.clinic_id NOT NULL` and mig 053 added `appointments.clinic_id NOT NULL`, but the data-layer functions in `frontdesk.ts` were never updated to supply the value. `checkInPatient()` never set `clinic_id` at all — every check-in 500'd at the DB constraint. `createAppointment()` used a conditional spread (`...(params.clinicId && { clinic_id })`) that silently dropped the column whenever the handler couldn't resolve a clinic. Direct DB repro confirmed: `INSERT INTO check_in_queue` without `clinic_id` → `23502: null value violates not-null constraint`. Live evidence: zero rows in either table since 2026-04-25 (constraints went live), ~36h silent outage across the fleet.
**Decision**: Fix both data-layer functions and their upstream handlers in a single commit:
1. `checkInPatient()` and `createAppointment()` now take `clinicId` as required. Runtime guard throws before reaching the DB. Mirrors the `createPayment` pattern from mig 047.
2. Both frontdesk handlers (`checkin/handler.ts`, `appointments/create/handler.ts`) swap `getUserClinicId` → `getFrontdeskClinicId` (D-041 server-resolved tenant scope). Return clean 403 "Clinic context not found" instead of letting the DB 500.
3. `urgent/route.ts` — same pattern, plus a second latent bug: the inline `check_in_queue` INSERT (when `patientAlreadyPresent=true`) was also missing `clinic_id`.
4. Cosmetic: check-in success screen was reading `data.queueNumber`/`data.queue_number` but the handler returns `{queueItem: {queue_number}}`. The "رقم الانتظار" badge was never rendering on real check-ins. Now reads `queueItem.queue_number`.
**Alternatives**: Backfill `clinic_id` via database trigger or default (rejected — hides the application-layer gap; the handler must resolve the correct clinic, not the DB), fix only `checkInPatient` and defer appointments (rejected — same root cause, same fix pattern, no reason to split), add a migration to make `clinic_id` nullable again as a rollback (rejected — D-041 constraint is correct, the handlers were wrong).
**Outcome**: Both high-frequency frontdesk flows restored. Five files changed, all following the D-041 pattern. Remaining handlers still using `getUserClinicId` flagged as TD-016 for a follow-up audit.

---

## D-060: Patient app as a separate Next.js app (`apps/patient/`)

**When**: 28 April 2026 (Prompt 0 audit review)
**Context**: The patient-facing surface (records read-only, consent UI, Rx PDFs, basic messaging — promoted to Phase 1 per D-072) needed a deployment shape. Two viable shapes: (a) put patient routes in a `(patient)` route group inside the existing `apps/clinic/` Next.js app, sharing the build and deployment with doctor + frontdesk; (b) ship a sibling `apps/patient/` Next.js app, independently deployable, that imports the same `@medassist/shared` business logic and (where useful) `@medassist/ui-clinic` components. The clinic app is doctor + frontdesk; mixing patient routes in raises risks: shared layout assumptions (e.g., the `DoctorShell` wrapper), unintentional cross-role bundle bloat, ambiguous role-gating (`requireRole('patient')` would coexist with `requireRole('doctor')` in the same app), and a coupled deploy cadence between two products with different release rhythms.
**Decision**: `apps/patient/` is a separate Next.js app. Patient-app-only components live in `apps/patient/components/`. Shared business logic (auth helpers, data layer modules, types, design tokens, RTL utilities) stays in `packages/shared/`. Where a UI component is reusable across roles it stays in `packages/ui-clinic/`; where it is patient-app-specific (PrivacyCodeCard, MessagingReConsentPrompt, RevokeShareModal, ExtendShareModal) it lives in `apps/patient/components/`. Both apps are wired into the npm workspace and use per-app-prefixed TypeScript path aliases (D-065).
**Alternatives**: Single Next.js app with a `(patient)` route group inside `apps/clinic/` (rejected — couples deploy cadences, mixes role-gating concerns in one layout tree, and lets clinic-app code path-leak into patient builds; the Phase 1 patient surface is too small to justify the coupling cost). Separate repo entirely (rejected — would lose shared `@medassist/shared` business logic, force duplicate auth/data plumbing, complicate cross-app changes).
**Outcome**: Patient app shipped at `apps/patient/` with its own `tsconfig.json`, `tailwind.config.ts`, route groups (`(auth)`, `(patient)`), and ~50 API endpoints. Both apps share `packages/shared` and `packages/ui-clinic` via npm workspaces. Patient-app routes (privacy, sharing, messaging, my-code, records, etc.) live entirely under `apps/patient/`. Captured in ARCHITECTURE §2 + §7. The 2026-04-28 ruling explicitly noted "this decision becomes D-XXX in DECISIONS_LOG.md" — captured here.

---

## D-061: Two-layer global patient identity (`global_patients` + `patient_clinic_records`)

**When**: 26 April 2026 (locked design block) + Builds 02-03 implementation (mig 071-082, 2026-04-28 → 2026-04-30)
**Context**: The legacy `patients` table is keyed by `(clinic_id, id)` — the same physical patient who visits two clinics has two unrelated rows. This was acceptable for clinic-management Phase 1 but blocks every Layer-2 product feature: cross-clinic record sharing, patient-app-mediated consent, patient-controlled identity, deduplication, and the patient records network thesis. Phone is the only reliable global identifier in Egypt (no national-ID-as-key for privacy reasons — see locked-decisions block); a patient who exists at two clinics has the same phone in both. The schema needed a new layer that keys identity by phone globally and lets clinic-specific data hang off that layer.
**Decision**: Two-layer architecture. **Global layer** (`global_patients`): one row per real human, keyed by phone (`normalized_phone` UNIQUE; NULL only for quarantined "sentinel" rows), holds `account_status` (enum `patient_account_status`: `active | suspended | locked | deceased | merged`) and the optional patient-app `claimed_user_id`. ("Sentinel" is the conceptual name for a row created when the patient's phone is unrecoverable; the enum value used is `'locked'` with `normalized_phone = NULL` per mig 076 — there is no `'sentinel'` enum value.) **Per-clinic layer** (`patient_clinic_records`, abbreviated PCR): one row per `(global_patient_id, clinic_id)` pair, holds clinic-specific notes (chief complaint, demographics-as-known-to-this-clinic, encounter history) plus `consent_to_messaging`. The legacy `patients` table is retained — every row carries `global_patient_id` (NOT NULL since mig 077) plus a back-reference to its PCR — but its role narrows to a compatibility surface that the rest of the application reads from while the data-layer migrates over to global+PCR. Eleven clinical tables (clinical_notes, prescription_items, appointments, lab_orders, lab_results, imaging_orders, vital_signs, patient_consent_grants, doctor_patient_relationships, patient_visibility, patient_phone_history) carry both `global_patient_id` and `patient_clinic_record_id` FKs since mig 080. Migration 081 adds compatibility shim triggers that normalize INSERT shapes (legacy `patient_id` only / new `gpid+pcr` only / both — verified consistent) so the cutover is incremental, not flag-day.
**Alternatives**: Add `global_patient_id` to the existing `patients` table without a separate `global_patients` table (rejected — doesn't actually create a global row; patients with no phone-equality across clinics would have no canonical home). Use national ID as the global key (rejected per locked decisions — sensitive in Egypt, not universally available, privacy-hostile). Eventual-consistency dedup via background jobs (rejected — gives no consistent identity guarantee at write time; the patient app needs `claimed_user_id` to be unambiguous). Big-bang cutover replacing `patients` with the new schema (rejected — too risky for Builds 02-03 scope; the compatibility shim is the rollback insurance).
**Outcome**: Live on staging since 2026-04-30. `global_patients` keyed by phone with quarantine paths for un-normalizable inputs (mig 076). PCR rows link gpid + clinic. Compatibility shim triggers maintain the legacy `patients` surface during data-layer cutover; retire when Prompt 6.5 drops legacy `patient_id` columns. The structural prerequisite for Layer 2 is now in place. Captured in ARCHITECTURE §5.4 + §8.1 + §8.6 (mig 071-082 era). Pairs with D-068 (directional consent — the cross-clinic read pathway built on top of this layer).

---

## D-062: Sync-transactional audit for privacy-sensitive events (with one documented exception)

**When**: 28 April 2026 (Prompt 0 audit review)
**Context**: Audit logging in MedAssist had been fire-and-forget for performance reasons — the parent transaction would commit even if the audit write failed. For most actions this is acceptable: missing an audit row for "user updated their profile" is not a privacy harm. But for privacy-sensitive events — code attempts, share grants/revokes, patient record views, SMS consent dispatches — the audit is the system-of-record for compliance and dispute resolution. A silent audit failure means the access happened with no trace. Existing call sites (`share-patient/handler.ts:41`, `patient/sharing/handler.ts:87`) had been flagged by the Prompt 0 audit as fire-and-forget on privacy-sensitive paths.
**Decision**: For privacy-sensitive events specifically — `VIEW_PATIENT`, `PRIVACY_CODE_ATTEMPT_SUCCESS`, `PRIVACY_CODE_ATTEMPT_FAILURE`, `PRIVACY_CODE_LOCKED`, `SHARE_GRANTED`, `SHARE_REVOKED`, `SHARE_EXTENDED`, `SHARE_AUTO_RENEWED`, `SHARE_EXPIRED`, `SMS_CONSENT_SENT`, `MESSAGING_CONSENT_RECONFIRMED`, `MESSAGING_CONSENT_REVOKED` — `logAuditEvent` MUST be `await`ed at the call site, MUST throw on failure, and the parent transaction MUST roll back if the audit write fails. Fire-and-forget is BANNED for these events. Other audit actions (operational/non-privacy-sensitive) may continue to fire-and-forget; this is not a blanket rule. **One documented exception**: the auto-renew-on-visit hook in the frontdesk check-in handler. Build 05 §B7 explicitly allows fire-and-forget for `SHARE_AUTO_RENEWED` because the encounter row has already inserted and preserving the encounter takes precedence over guaranteeing the renewal audit; if the renewal silently fails, the share will eventually expire on its normal schedule and a notification will fire — not a privacy hole, just a UX gap.
**Alternatives**: Make all audits sync-transactional (rejected — adds latency to every write surface for marginal benefit on non-sensitive actions). Async audit pipeline with at-least-once retry (rejected — over-engineering for Phase 1; introduces operational complexity that doesn't match current scale). Keep fire-and-forget everywhere with reconciliation jobs (rejected — reconciliation can't recover the *fact* that an access happened if no row was ever queued).
**Outcome**: Implemented in Builds 04-05. The privacy-code, share-grant, share-revoke, and reconsent paths all `await logAuditEvent` and propagate failure; the auto-renew-on-visit hook is the documented exception with explicit reasoning in source comments. Existing fire-and-forget call sites at `share-patient/handler.ts` and `patient/sharing/handler.ts` were backported to the sync-transactional pattern. Captured in ARCHITECTURE §12. The audit-action enumeration is in audit.ts (52 entries; see §12).

---

## D-063: `patients.clinic_id` retained through Prompt 6, dropped in Prompt 6.5

**When**: 28 April 2026 (Prompt 0 audit review)
**Context**: D-061 introduced the global+PCR layer; the legacy `patients.clinic_id` column became architecturally redundant (a patients row's clinic is now resolvable via its `patient_clinic_record_id` FK chain). However, the data layer that the rest of the app reads from still queries `patients.clinic_id` directly in many places (D-041 server-resolved tenant scope, RLS policies on `patients`, multi-clinic doctor membership checks). Dropping `patients.clinic_id` mid-Prompt-6 — the highest-risk phase, since RLS policy rewrites depend on consistent column shapes — would force a simultaneous data-layer rewrite under time pressure. The drop has to happen eventually (post-D-061 it's redundant), but the timing matters.
**Decision**: Keep `patients.clinic_id` populated through the entirety of Prompt 6 (RLS Policy Rewrite). The new Prompt 6.5 (Legacy Cleanup) drops it after the Prompt 6 RLS rewrite has been verified stable on staging. This deferral avoids forcing a data-layer rewrite during the riskiest phase. Compatibility shim triggers (mig 081) keep `patients.clinic_id` consistent with the new layer's `(global_patient_id, clinic_id)` pair during the overlap period.
**Alternatives**: Drop `patients.clinic_id` immediately as part of Build 03 (rejected — forces every callsite that reads it to be rewritten simultaneously, no rollback window if an unforeseen consumer breaks). Mark the column DEPRECATED but never drop (rejected — leaves the schema cluttered indefinitely; the whole point of the global+PCR layer is to make clinic_id derivable, not to keep redundant copies). Drop and provide a SQL view for backward compatibility (rejected — postgres views don't propagate RLS policies cleanly; would re-introduce the same complexity for views that the Prompt 6 rewrite is trying to clean up).
**Outcome**: `patients.clinic_id` remains populated and queryable through Prompt 6. Prompt 6.5 (Legacy Cleanup) is a tracked future prompt in EXECUTION_PROMPTS.md status; its scope explicitly includes dropping `patients.clinic_id`, retiring the mig 081 compatibility shim triggers, and dropping the legacy 055-067 RLS policy set (which still references the column). Sequencing: Prompt 6 → verify stable → Prompt 6.5 → cutover complete. Captured in ARCHITECTURE §5.4 + §8.1.

---

## D-064: Hybrid INVOKER/DEFINER RLS security mode (3 DEFINER + 2 INVOKER)

**When**: 30 April 2026 (Mo's Phase 6 ruling), finalized 3 May 2026 (forensic mig 106)
**Context**: Empirical Lesson #1 (Builds 02-03) established the rule "all RLS helpers are SECURITY DEFINER, no exceptions" — DEFINER bypasses RLS during the helper's internal joins, breaking cross-table EXISTS recursion under `authenticated`. The Prompt 6 RLS rewrite (mig 092) authored four helpers: `is_clinic_member`, `can_clinic_access_global_patient`, `can_patient_access_global_patient`, `can_view_patient_data_at_clinic`. Two of the four (`can_clinic_access_global_patient` and `can_patient_access_global_patient`) have body queries that provably do NOT recurse — both check existence directly against tables whose RLS policies don't transit back through the helper itself. DEFINER for these two helpers would over-privilege them; INVOKER respects the calling user's RLS scope, which is the more conservative default when recursion isn't a concern. Between mig 092 authoring and 2026-05-03, helpers #2 and #3 drifted on staging from INVOKER (file) → DEFINER (live) — out-of-band changes captured by the Foundation Audit (Empirical Lesson #7).
**Decision**: Hybrid security mode: **3 DEFINER + 2 INVOKER**. DEFINER for `is_clinic_member` (#1; the membership table has self-referential SELECT recursion under `authenticated`), `can_view_patient_data_at_clinic` (#4; queries multiple RLS-enabled tables internally), and `user_has_clinic_path_to_gp` (added in mig 094a; replaces inline EXISTS that would have recursed). INVOKER for `can_clinic_access_global_patient` (#2) and `can_patient_access_global_patient` (#3) — both have provably recursion-free bodies, and INVOKER pairs the helper's existence check with the calling policy's "is the caller a member of this clinic" predicate, decomposing cleanly. Empirical Lesson #1 is amended: INVOKER is allowed only for helpers whose internal queries provably do NOT trigger RLS recursion through the helper itself; DEFINER is the default; burden of proof is on the engineer proposing INVOKER.
**Alternatives**: Uniform DEFINER for all helpers (the original Empirical Lesson #1 stance; rejected per Mo's 2026-04-30 ruling — over-privileges helpers #2 and #3 unnecessarily). Uniform INVOKER (rejected — would deadlock on helper #1 / #4 / `user_has_clinic_path_to_gp`'s known-recursive queries). Make security mode configurable per-helper via a runtime flag (rejected — complexity without payoff; the per-helper analysis is the architectural commitment). Wrap INVOKER helpers in DEFINER wrappers as a workaround (rejected — same security profile as DEFINER with extra indirection).
**Outcome**: Forensic mig 106 (2026-05-03) restored helpers #2 and #3 to INVOKER on staging via `ALTER FUNCTION ... SECURITY INVOKER` after the staging drift was discovered. Empirical Lesson #1 amended in EXECUTION_PROMPTS.md (lands in Phase 5d as part of this audit). The hybrid mode is the canonical RLS helper architecture going forward; future helpers default to DEFINER unless the engineer proves recursion-safety. Captured in ARCHITECTURE §12.

### Amendment 2026-05-10 (B07 Phase D — helper family expanded to 5 DEFINER + 4 INVOKER)

Mig 113 adds two new helper pairs (`is_authorized_actor_on` + `_is_authorized_actor_on_internal`; `delegated_capability_includes` + `_delegated_capability_includes_internal`) per the inner-DEFINER + outer-INVOKER pattern that this Decision establishes. The inner DEFINER is justified because the function reads `global_patients` and `patient_delegations` whose RLS policies (post-mig-114-116) invoke the public outer wrapper — without DEFINER the inner queries would re-enter those policies and recurse. The outer INVOKER is the documented public surface invoked by the patient-side leg of every modified RLS policy and by the Phase E `requireAuthorityOver` / `requireCapability` helpers. Both pairs are `STABLE PARALLEL SAFE` with `SET search_path = public, pg_temp` per Mo's Option-B 2026-05-03 ruling.

Helper family count after mig 113: **5 DEFINER + 4 INVOKER** total —
- DEFINER: `is_clinic_member`, `can_view_patient_data_at_clinic`, `user_has_clinic_path_to_gp` (mig 094a), `_is_authorized_actor_on_internal` (mig 113), `_delegated_capability_includes_internal` (mig 113)
- INVOKER: `can_clinic_access_global_patient`, `can_patient_access_global_patient`, `is_authorized_actor_on` (mig 113), `delegated_capability_includes` (mig 113)

No explicit REVOKE/GRANT block per Phase D-E Decision 1 (`audits/b07-phase-d-e-execution-2026-05-09.md`). The architectural review §3.4's prescribed `REVOKE ALL FROM PUBLIC` on the inner functions was investigated and rejected: EXECUTE permission is checked at call time regardless of the inner's `SECURITY DEFINER`, so REVOKE'ing the inner from PUBLIC would break the wrapper invocation chain (outer INVOKER runs as `authenticated`, calls the inner, fails permission check). Mig 092 lines 330-338 codify the same precedent for the existing 4 helpers; mig 113 inherits it. The security boundary is enforced through underscore-prefixed naming (`_is_authorized_actor_on_internal`), boolean-only return (no raw rows escape), and DEFINER bypassing RLS inside the function body. Decision 1 in `audits/b07-phase-d-e-execution-2026-05-09.md` walks the four options considered and the trade-offs.

The hybrid mode now reads as: **DEFINER for any helper whose internal queries read RLS-protected tables that themselves invoke the helper through their policies; INVOKER for any wrapper or query that does not transit RLS**. Future helpers continue to default to DEFINER unless the engineer proves recursion-safety. Captured in ARCHITECTURE §8.6 (mig 113-116 row).

---

## D-065: Per-app TypeScript path aliases (`@patient/*`, `@clinic/*`); shared `@/*` retired

**When**: 4 May 2026 (commit `bb50305`, audit detour Day 2 / discipline cleanup)
**Context**: Both `apps/patient/tsconfig.json` and `apps/clinic/tsconfig.json` declared `"@/*": ["./*"]` — the same alias name pointing at different per-app directories. Root `tsconfig.json` (used by the pre-push hook's `tsc --noEmit` gate per D-045) had no `@/*` entry. The first time a file in `apps/patient/` imported via `@/components/...` (the new Build 05 sharing page introduced in commit `61f8752`), root tsc could not resolve the alias and the pre-push gate failed. Adding a single root `@/*` entry would have forced the alias to resolve to one app's directory, silently disagreeing with the other app's tsconfig — a latent collision waiting for the second app's first `@/` import.
**Decision**: Retire the shared `@/*` per-app convention. Introduce per-app-prefixed aliases at BOTH the root tsconfig (for the pre-push hook) AND each per-app tsconfig (for Next.js dev/build): `"@patient/*": ["./apps/patient/*"]` and `"@clinic/*": ["./apps/clinic/*"]` at root; `"@patient/*": ["./*"]` in `apps/patient/tsconfig.json`; `"@clinic/*": ["./*"]` in `apps/clinic/tsconfig.json`. The single Build 05 consumer (`apps/patient/.../sharing/page.tsx`) is rewritten to use `@patient/components/sharing/...`. Standing rule: when adding a new path alias, declare it at both levels with a per-app prefix; never share an alias name across apps with different resolution targets.
**Alternatives**: Add a single root `@/*` pointing at one app (rejected — silently disagrees with the other app's tsconfig; the moment apps/clinic introduces an `@/` import, root tsc fails). Convert the two import lines in sharing/page.tsx to relative paths (`../../../../components/sharing/...`) without the alias rename (rejected — leaves the latent collision in place; doesn't apply Empirical Lesson #14 going forward). Defer the rename and accept the relative-path workaround for now (rejected — Mo's standing rule for this session: "a lesson we have but don't apply isn't a lesson — it's a wishlist").
**Outcome**: Root tsc gate passes cleanly. The latent collision (same alias, two apps, different targets) is resolved structurally rather than worked around. Codified as Empirical Lesson #14 in EXECUTION_PROMPTS.md (lands in Phase 5d). Captured in ARCHITECTURE §2 ("Path alias mechanics"). Discipline-cleanup commit chain: this commit lands between B04 (`f61356f`) and B05 (`61f8752`).

> **Amendment 2026-05-07 — third level required (next.config.js webpack alias)**: The original Decision shipped with two-level scope (root `tsconfig.json` + per-app `tsconfig.json`). CI run 25475031898 proved that scope incomplete: Next 14.2.x's webpack resolver does not always honor tsconfig path aliases for cross-segment imports inside an app, so the patient-app build broke at webpack-resolution time with an opaque `Process completed with exit code 1` and no diagnostic output until build logs were captured to artifacts. The fix is a third declaration site: each app's `next.config.js` `config.resolve.alias` block, registering the same alias-to-directory mapping inside the `webpack(config, options)` hook (e.g. `config.resolve.alias['@patient'] = path.resolve(__dirname, '.')` in the patient app, and the equivalent for `@clinic`). Operationalized in commit `9774252` (CI build-log capture + per-app webpack alias additions in both `apps/patient/next.config.js` and `apps/clinic/next.config.js`; the `@clinic` entry is defensive — no consumer yet, but parity prevents the same failure mode when the first `@clinic/*` import lands). The amended standing rule supersedes the original two-level rule above: declare every per-app alias at all three levels (root tsconfig, per-app tsconfig, per-app `next.config.js` webpack alias). Empirical Lesson #14 amended in EXECUTION_PROMPTS.md and ARCHITECTURE §2 rewritten in the same commit per Lesson #13 lockstep discipline.

> **Amendment 2026-05-07 (later) — empirical-justification correction**: The amendment above states that commit `9774252` "operationalized" the fix for CI run 25475031898. Subsequent investigation proved that empirical claim wrong. Six consecutive CI failures (runs 115–120) span 2026-05-07 03:38 UTC through 22:00+ UTC; runs 118 (`aa2b991`), 119 (`134e272`), and 120 (`f766a05`) are all post-`9774252` and all failed at the same Build Patient App step. If `9774252`'s webpack-alias additions had been the operational fix, run 118 (the next CI run after that merge) would have turned the matrix green; it didn't. The actual root cause — and what was almost certainly failing at run 25475031898 too — was a route-handler type contract issue introduced at commit `61f8752` (Build 05, 2026-05-04, three days before run 25475031898): `packages/shared/lib/api/handlers/patient/sharing/handler.ts` line 27 declared `export async function GET(request?: Request)`. The optional `?` makes the parameter type `Request | undefined`, which Next.js's route-handler contract rejects at `next build` time. Pre-push `tsc --noEmit` and the CI Lint-and-Type-Check job both pass clean because `tsc --noEmit` does not enforce that contract — only `next build` does. The operational fix was a one-character source change (`?` removal) shipped in commit `80ee270`; CI run 25539467112 against that commit is green. What `9774252` actually contributed was (a) the build-log-capture mechanism in `ci.yml` that surfaced the error string to artifacts six runs later and made diagnosis possible — a load-bearing piece of operational discipline — and (b) preventive webpack-alias declarations that are defensible third-declaration-site discipline in their own right but were not the active bug fix. The three-level path-alias rule above stands as correct forward-looking discipline; the original Decision body and the first Amendment are preserved verbatim as historical record. Only the empirical-justification claim needed correction. Pairs with Empirical Lesson #17 (`tsc --noEmit` does not enforce Next.js route-handler type contracts), the lesson that codifies the gap that allowed the bug to ship.

---

## D-066: `patient_code` feature retirement (R7)

**When**: Direction set 30 April 2026 (Foundation Audit R7 ruling); operational closure 4 May 2026 (audit detour Day 2, commit `6adeffa`)
**Context**: A `patient_code` system was drafted before the 2026-04-26 locked privacy-code numerics block. Session 16 (2026-05-02) discovered the implementation contradicted the locked decisions on five axes: RNG (`Math.random` vs. `gen_random_bytes`), TTL (indefinite vs. 5-min), rate limit (none vs. 5/hr), audit trail (none vs. audit-everything-sensitive), storage (plaintext vs. bcrypt). Empirical Lesson #6 (per-callsite re-reading at Phase F start) surfaced this as a P1 security issue. The privacy-code system (Build 04, mig 084-087) was the locked-decisions-conformant replacement. R7 ruled the `patient_code` feature retired; mig 099 (`patient_code_rpcs.sql`) was drafted in session 17 but never applied successfully — its companion mig 098 (schema columns: `patient_code_hash`, `patient_code_generated_at`, `patient_code_expires_at` on `global_patients`) had already been applied to staging on 2026-05-03 02:28 UTC despite the prior R7 retirement direction.
**Decision**: Retire the `patient_code` feature direction per R7 (2026-04-30). Operational closure: delete mig 099 from the repo since it references the retired feature; the file would otherwise be a fresh-DB-reset trap. Mig 098 (schema columns) remains on staging as a known-applied artifact awaiting a future cleanup migration that drops the three columns. Code-side cleanup (delete `apps/patient/.../my-code/route.ts`, `packages/shared/lib/api/handlers/patient/my-code/handler.ts`, `apps/patient/.../more/page.tsx` my-code section, `patient_code?: string | null` field in `data/patients.ts`, regenerated `supabase/types.ts`) is a Phase F follow-up task (Task 2 in `audits/PROGRAM_STATE.md`).
**Alternatives**: Hot-fix the `patient_code` implementation to match the locked numerics (rejected — would duplicate the privacy-code mechanism that already exists at mig 084-087; two privacy-code systems with different shapes is worse than one). Apply mig 099 anyway and live with the security gap (rejected — directly contradicts the 2026-04-26 locked decisions). Roll back mig 098 immediately as part of the audit detour (rejected — the columns are NULL on every row; rolling back during a discipline-cleanup session adds risk for no operational benefit; defer to a planned cleanup migration).
**Outcome**: Mig 099 deleted (commit `6adeffa`, audit detour Day 2). Mig 098 columns persist on staging — flagged in ARCHITECTURE §8.6 row 098 with explicit "applied + retired" framing. Phase F follow-up tasks queued: code-side cleanup (PROGRAM_STATE.md Task 2), schema-side cleanup migration (not yet scheduled). The `patient_code` retirement is the canonical example of "a locked decision retroactively invalidating an in-flight feature" — Empirical Lesson #6 is the standing rule that prevents this from recurring.

---

## D-067: Locked privacy code security parameters

**When**: 26 April 2026 (locked design block; codified in EXECUTION_PROMPTS.md "Locked numerics" table)
**Context**: A pre-2026-04-26 patient-code system existed in the repo using `Math.random()`, indefinite TTL, no rate limit, no audit trail, plaintext storage — none of which met the cross-clinic privacy threat model. The Build 04 privacy-code mechanism (mig 084-087) needed concrete security parameters that would not be re-litigated in implementation. Egyptian SMS infrastructure delivers reliably but slowly (3-30 second tail in practice); older patients dictate codes back to frontdesk verbally, so transcription tolerance matters. The privacy code is the single user-facing handle for cross-clinic record access — getting the parameters wrong means either the system is brute-forceable, the UX is unusable, or both.
**Decision**: The following parameters are locked together as a coherent security envelope. Any future implementation that touches privacy codes must use these values; deviation requires explicit reopening of the decision.
- **Code length:** 6 characters.
- **Alphabet:** base32 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32 chars; ambiguous 0/1/I/O removed for verbal transcription clarity).
- **RNG:** `gen_random_bytes()` from pgcrypto. NEVER `random()` (deterministic PRNG).
- **Distribution:** unbiased — 256 ÷ 32 = 8 exactly, so simple modulo-32 sampling on each random byte produces uniform output without rejection-sampling overhead.
- **Storage:** bcrypt cost 12 (~400ms verify time on contemporary hardware). Plaintext shown to the patient on regeneration ONCE, never stored.
- **Per-clinic rate limit:** 5 attempts/hour per `(global_patient_id, clinic_id)` sliding window. Over the threshold, further attempts return the uniform failure payload (intentionally not distinguished from "wrong code" or "no such patient" externally — the uniform-shape contract) until older attempts age out of the window. NO SMS notification.
- **Per-code lockout:** 5 failures across all clinics → 24h hard lockout via explicit `locked_until` timestamp + SMS notification fires to the patient.
- **SMS-consent token TTL:** 5 minutes (accommodates Egyptian SMS delays + older patients reading codes aloud).
- **Uniform timing pad:** `check_phone_uniform` shim pads all verify-flow responses to a minimum of 50ms regardless of whether a patient exists. Defends against phone-existence enumeration via timing.
- **Test thresholds:** code distribution ±5% of uniform per position in a 10,000-code sample; latency parity <5ms p95 difference between exists / not-exists branches.
**Alternatives**: 4-character code with stricter lockouts (rejected — entropy too low; ~10⁶ keyspace gives 0.1% brute-force probability per attempt, enough to matter at scale). 8+ character code (rejected — verbal transcription failure rate climbs nonlinearly with length; the dictated-aloud UX is the dominant failure mode in Egyptian clinics). Argon2id over bcrypt (rejected — pgcrypto's bcrypt is mature in Postgres; Argon2id adds an extension dependency for marginal gain at this code size). Per-attempt SMS notification on every failure (rejected — would spam patients on transcription typos; the 24h lockout SMS is the right escalation point). 30-second uniform timing pad instead of 50ms (rejected — adds noticeable user-perceived latency to legitimate verifications). Explicit per-clinic lockout state instead of sliding window (rejected — sliding window naturally recovers; explicit state requires a state-clearing job and adds a clock-drift failure mode).
**Outcome**: Implemented as the canonical privacy-code mechanism in mig 084-087 (Build 04). Verified end-to-end against the locked envelope: alphabet matches `87_privacy_code_functions.sql` body verbatim; bcrypt cost matches; rate limits enforced via `privacy_code_attempts` table (mig 084) with sliding-window query (`WHERE created_at > NOW() - INTERVAL '1 hour'`); per-code lockout enforced via `locked_until` timestamp on `patient_privacy_codes`; uniform timing pad applied at the TS layer in `privacy-codes.ts`. Captured in ARCHITECTURE §5.5. The locked-decision register lives in EXECUTION_PROMPTS.md "Locked numerics (2026-04-28, post-Prompt-1-v2)" — this D-XXX is the canonical "why" for that table. Pairs with D-068 (directional consent — the consent grant the privacy code unlocks).

---

## D-068: Directional consent model — `patient_data_shares` lifecycle

**When**: 26 April 2026 (locked design block) + Build 05 implementation (mig 090-091, 2026-04-29 → 2026-05-04)
**Context**: D-061 established the two-layer identity that makes cross-clinic record sharing possible at the schema level; the consent mechanism that unlocks those reads was an open design question. The naive "Clinic B sees Clinic A's records once both clinics have a relationship with the patient" is wrong on two axes: it's symmetric (Clinic A would automatically see Clinic B's records too — but only one clinic was authorized by the patient), and it's permanent (no expiry, no revoke path). Egyptian patients move between clinics frequently — a referral to a specialist, a second opinion, a temporary GP — and the consent model needs to match that mobility. The legacy `patient_visibility` table (per-doctor intra-clinic grants) is structurally similar but wrong scope (intra-clinic, doctor↔doctor, not inter-clinic, clinic↔clinic).
**Decision**: Patient-data-share grants are **directional**: when a patient uses their privacy code or SMS code at Clinic B (the grantee), `patient_data_shares` rows are created from each clinic where the patient has a PCR (the grantors) → Clinic B. Clinic B can read grantors' data; grantors do NOT auto-see Clinic B's data back. Reciprocity, when it happens, requires a separate grant in the opposite direction. Grants default to **90-day expiry** and **auto-renew on visit** (when the patient checks in at Clinic B again, the share's `expires_at` advances to NOW + 90d, never shortening). Patients can extend an active share to **1 year** or **permanent** (no expiry) from the patient app. Patients can **hard-revoke** any share at any time; revoke blocks future reads; past audit-trail rows remain immutable. Stale-share expiration runs as a daily Vercel cron (02:00 UTC) — not a DB-side scheduler — and sends Egyptian-Arabic SMS notifications when shares have expired. Audit actions (`SHARE_GRANTED`, `SHARE_EXTENDED`, `SHARE_REVOKED`, `SHARE_AUTO_RENEWED`, `SHARE_EXPIRED`) are written synchronously and transactionally per D-062, with the auto-renew-on-visit hook as the documented exception.
**Alternatives**: Symmetric grants (rejected — over-shares; only one direction was authorized by the patient, so the other direction is a privacy harm). Time-unlimited grants (rejected — patients who saw a clinic once five years ago shouldn't have indefinite cross-clinic visibility). No auto-renew (rejected — without renewal, every active patient relationship becomes a 90-day chore of re-entering the privacy code; auto-renew matches the medical-relationship reality that visiting a clinic again is itself the consent signal). Per-record consent instead of per-clinic-pair (rejected — granularity dwarfs the user's ability to manage; the patient-app sharing UI would be unusable). Use the existing `patient_visibility` table (rejected — per-doctor scope, not per-clinic; would conflate the intra-clinic visibility model with the cross-clinic model). DB-side cron (rejected — `pg_cron` adds operational complexity for one daily job; Vercel Cron + the `cron-expire-stale-shares` route is a simpler shape with the same correctness guarantees).
**Outcome**: Live in Build 05 (commit `61f8752`). `patient_data_shares` table (mig 090) carries id, global_patient_id, grantor_clinic_id, grantee_clinic_id, granted_at, expires_at (NULL = permanent), revoked_at, granted_via enum (`PRIVACY_CODE | SMS_CODE | PATIENT_APP | AUTO_RENEW`), grant_reason. The `create_shares_for_grantors` RPC (mig 091) atomically inserts one share row per grantor when a privacy/SMS code verifies at a new clinic. `apps/clinic/app/api/cron/expire-stale-shares/route.ts` runs the daily expiration sweep with Twilio SMS dispatch. The patient-app `/patient/sharing` page (`apps/patient/app/(patient)/patient/sharing/page.tsx`) renders the lifecycle UI. RLS read path goes through `can_clinic_access_global_patient` (D-064 hybrid mode helper #2, INVOKER). Captured in ARCHITECTURE §5.6 + §8.5.

### Amendment 2026-05-10 (B07 Phase B)

The schema now supports parent-on-behalf-of-minor sharing and capability-scoped delegation alongside the existing share lifecycle, with no change to D-068's directional / 90-day-default / auto-renew-on-visit semantics. Two surface additions:

1. **Minors share identically to adults** under D-068. The `global_patients.is_minor BOOLEAN` flag (mig 109) does NOT alter the share read path — `can_clinic_access_global_patient` continues to gate visibility regardless of `is_minor`. When a guardian acts on a minor's behalf — verifying a privacy code at Clinic B, accepting a share, etc. — the audit trail records `actor_user_id = <guardian.user_id>`, `resolved_global_patient_id = <minor.gp.id>` (auto-derived from the existing generated column), and `metadata.acting_as = 'guardian_of_minor'`. No new column on `audit_events`; the existing `actor != subject` capability is sufficient. The mig 109 CHECK constraints (`minor_requires_guardian`, `minor_no_self_claim`) ensure that minors are always represented through a guardian in the audit chain.

2. **Capability-scoped delegation (Pattern B, mig 110)** is orthogonal to D-068 sharing. The `patient_delegations` table grants a delegate USER scoped capabilities to act on a principal's records across whichever clinics the principal already has presence at; sharing moves a record into another clinic's view. The two systems coexist on the same identity without conflict. The MVP capability set is the 5 specified in B07 architectural rulings (`view_records`, `receive_notifications`, `book_appointments`, `manage_medications`, `consent_to_messaging`); `consent_to_share` is **post-MVP** and intentionally not present in Phase B. When the post-MVP `consent_to_share` capability lands, it will gate the patient-app's "create new share" mutation on behalf of the principal — at which point this amendment will be revisited to capture how the delegation system intersects with share lifecycle (grant, extend, revoke).

Authority chain depth = 1: a delegate of a guardian cannot chain through to act on the guardian's minors. Phase D's `is_authorized_actor_on()` helper rejects chained lookups in code; no schema enforcement needed.

Doc references: `audits/B07-architectural-review-2026-05-10.md` (the architectural review at commit `07fcbf8`), `audits/b07-phase-b-execution-2026-05-10.md` (Phase B execution log with all 11 decisions). Phase C-E batch (data layer + RLS helpers + API) follows after Mo's review of this commit.

---

## D-069: Ghost Mode deleted

**When**: 26 April 2026 (locked design block)
**Context**: "Ghost Mode" was a pre-2026-04-26 feature concept: the ability to record a clinical encounter without associating it to a patient identity — useful for walk-ins where the patient declines to share their phone, for sensitive cases where the clinic preferred not to retain identity, or for stress-testing the system without polluting real patient data. The implementation was anonymous_visits table writes with no `patient_id` FK. Ghost Mode predates the patient identity network thesis (PRODUCT_SPEC Layer 2). Under Layer 2, every clinical encounter SHOULD be associated with a `global_patient` so the patient can later see their own records, exercise consent, and benefit from cross-clinic visibility. Ghost-Mode encounters are by construction invisible to the patient — they cannot claim them, share them, or use them as part of their longitudinal health record. The product thesis and the feature contradicted each other: Ghost Mode preserved data without identity; Layer 2 says the identity is the product.
**Decision**: Ghost Mode is deleted as a feature direction. New patient encounters always create or link to a `global_patient` row (phone-keyed), even for walk-ins where the patient is reluctant. Where reluctance is genuine and the patient refuses to give a phone number, the `quarantine` path in mig 076 creates a "sentinel" `global_patients` row with `normalized_phone = NULL` and `account_status = 'locked'` — "sentinel" is the conceptual name for the row; the enum value used is `'locked'` because the `patient_account_status` enum has no `'sentinel'` value (its values are `active | suspended | locked | deceased | merged`). The encounter is preserved, identity exists structurally for future merges, but no patient-app claim is possible until a phone is associated.
**Alternatives**: Keep Ghost Mode behind a feature flag (rejected — features behind flags accumulate maintenance burden; a feature contradicting the product thesis should be removed, not gated). Keep Ghost Mode for the specific stress-testing use case (rejected — test fixtures and seed data per D-029 cover that need without a production code path). Make Ghost Mode patient-claimable later (rejected — would require a fuzzy-match identity-merge mechanism that's strictly harder than just requiring identity at write time, and the merge ambiguity is the bug class Ghost Mode would create).
**Outcome**: Ghost Mode removed from product scope. The `anonymous_visits` table is repurposed for the AI training pipeline (D-070) — the table shape is similar (encounter data without patient FK), but the use case is fundamentally different (de-identified training data, not unclaimed clinical encounters). Captured in EXECUTION_PROMPTS.md "Locked design decisions (memory snapshot, 2026-04-26)" block. Pairs with D-070 (anonymous visits repurposed) and D-071 (AI training data architecture).

---

## D-070: Anonymous visits repurposed for AI training pipeline

**When**: 26 April 2026 (locked design block)
**Context**: D-069 deleted Ghost Mode but left the existing `anonymous_visits` schema in place — the table holds encounter-shaped rows without a patient FK. Two paths: drop the table (clean break, lose the schema work), or repurpose it. Separately, the Layer 2-3 product roadmap includes an AI training pipeline that extracts de-identified clinical patterns (drug interactions, presentation patterns, treatment outcomes) from the operational data. The training pipeline needs encounter-shaped data that is provably stripped of patient identity at the schema level — exactly what `anonymous_visits` already provides. The two needs converge.
**Decision**: Repurpose `anonymous_visits` as the source-of-truth schema for de-identified clinical training data. Going-forward inserts to `anonymous_visits` are training-pipeline writes, not patient-clinical writes (which go to the global+PCR layer per D-061). The table's lack of patient FK is now the FEATURE, not the bug — it provably cannot be re-identified through a foreign-key chain. Pre-Layer-2 rows in `anonymous_visits` (existing legacy rows from the deleted Ghost Mode use case) are left in place for now; they're either deleted in Phase 2/3 cleanup or repurposed as historical training samples after a privacy review (decision deferred to Phase 2/3 implementation). The actual k-anonymity, consent toggle, and PII-strip machinery are D-071's scope; this decision only repurposes the table.
**Alternatives**: Drop `anonymous_visits` and start the training pipeline schema from scratch in Phase 2/3 (rejected — wastes the schema work; the table shape is what we'd reach for anyway). Keep `anonymous_visits` strictly as Ghost-Mode legacy data and create a new `training_visits` table (rejected — two tables with near-identical shape and overlapping purpose; the operational reality is that the training pipeline IS the only forward use of an anonymous-encounter table). Migrate Ghost Mode rows into the global+PCR layer with synthetic phones (rejected — silently fakes identity; violates D-061's "every gpid is a real human or a sentinel" invariant).
**Outcome**: `anonymous_visits` table preserved with the new architectural intent recorded. No schema change; no immediate code change. The training pipeline implementation lives in Phase 2/3 (per the Layer-2 → Layer-4 sequencing in PRODUCT_SPEC.md). Pairs with D-069 (Ghost Mode deleted — the use case being repurposed) and D-071 (the architecture this enables).

---

## D-071: AI training data architecture — k-anonymous, consent default ON, no PII

**When**: 26 April 2026 (locked design block)
**Context**: The AI training pipeline (Phase 2/3 per PRODUCT_SPEC Layer 4 — service network features benefit from clinical-pattern training data) needs concrete privacy parameters locked early. If the parameters are decided at Phase 2/3 implementation time, they'll be re-litigated under release-pace pressure, and the choices made under that pressure rarely match the choices made under thoughtful design. Egyptian healthcare data is sensitive; an AI training pipeline that leaks patient identity through de-anonymization attacks would be a category-defining product failure. Three core parameters need to be locked: minimum k-anonymity threshold, consent default (opt-in vs opt-out), and the explicit list of fields that MUST be stripped before training data egresses the operational system.
**Decision**: Three parameters locked. **(1) k-anonymity threshold: k ≥ 5.** Any training data slice that would identify fewer than 5 patients gets dropped, not exported. This is a conservative threshold (k ≥ 3 is the academic minimum; k ≥ 5 is the regulated-healthcare floor) chosen because Egyptian clinical samples are smaller than US/EU samples — k=3 in a small dataset is too easy to de-anonymize by triangulating against publicly observable patient attributes. **(2) Consent toggle default: ON (opt-in).** Patients consent to anonymized training-data use by default at registration; the toggle in the patient app lets them turn it OFF at any time. Default-ON because the training pipeline's value depends on data scale, and the assumption (informed by adjacent Egyptian healthcare consumer research, not formal user research on this product) is that patients overwhelmingly choose to share data when asked transparently. Formal validation of this assumption is part of Phase 2/3 implementation; if the assumption proves wrong, the default flips to OFF. **(3) Stripped fields: no patient identity fields, period.** No phone, name, national ID, address, email, date of birth (year only retained), gender, clinic name, doctor name, encounter timestamps (only date retained), or free-text notes that could contain identity tokens (passed through a PII-strip filter before export). The training-data pipeline reads from `anonymous_visits` (D-070) plus a derived view that joins clinical_notes with patients only for the year/age computation, then drops the identity columns before egress.
**Alternatives**: k ≥ 3 (rejected — too low for the small-sample Egyptian clinical dataset; de-anonymization risk via attribute triangulation is real). Consent default OFF / opt-in only (rejected — would collapse training data scale below useful thresholds; transparent default-ON with one-tap revoke is the better tradeoff if the consumer-research assumption holds — and is falsifiable per the Decision section). Free-text notes included (rejected — Egyptian clinical notes contain patient names verbatim in dictated fields; would be a guaranteed leak source). Implement everything now in Phase 1 (rejected — premature; the operational data layer needs to mature through Builds 02-06 first; locked DESIGN now, locked IMPLEMENTATION later).
**Outcome**: **Implementation deferred to Phase 2/3** per the Layer 1-5 phasing in PRODUCT_SPEC.md. This D-XXX captures the locked design intent so Phase 2/3 implementation does not re-litigate it. The standing rule for forward-looking architecture decisions: capture the design now to prevent re-litigation later, with explicit "Implementation deferred" framing in Outcome to prevent confusion about ship status. Pairs with D-070 (the source-of-truth table) and D-069 (the deleted feature whose schema is being repurposed).

---

## D-072: Patient app moved from Phase 2 to Phase 1

**When**: 26 April 2026 (locked design block)
**Context**: The original phasing (pre-2026-04-26) put the patient app in Phase 2 — Layer 3 patient engagement was downstream of Layer 2 patient records. The reasoning was sequential: build the records system first, then expose it to patients. Re-evaluation showed this got the dependency direction wrong. The Layer-2 patient records network thesis depends on **patient consent** as the gate for cross-clinic record sharing (D-068). Patient consent depends on patients having a way to grant, see, and revoke consent — which is exactly what the patient app provides. Without a patient app, the only consent path is the clinic-mediated privacy code flow; that's necessary but not sufficient for the records network to function as a patient-controlled system. A clinic-only consent path silently re-centers the system on the clinic, not the patient — undermining the thesis.
**Decision**: Patient app is promoted to Phase 1, with a deliberately narrowed scope: records read-only, consent UI (privacy code regenerate, share grant/revoke/extend, messaging consent), Rx PDFs, and basic messaging. Anything richer (appointment booking from the patient side, lab-result push notifications, chronic-condition tracking) stays in later phases. The narrowed scope keeps Phase 1 shippable while still unlocking the consent surface that the records network depends on. Concretely this materialized as `apps/patient/` (D-060) with the routes shown in ARCHITECTURE §7.
**Alternatives**: Keep patient app in Phase 2 (rejected — re-centers Phase 1 on the clinic, undermining the records network thesis; clinics would default-consent on patients' behalf, which is exactly what the directional consent model is supposed to prevent). Ship a fuller patient app in Phase 1 with appointment booking, lab notifications, etc. (rejected — Phase 1 would slip 6-12 months; the consent-and-records core is what's load-bearing for Layer 2, not the breadth of patient features). Defer patient app indefinitely and rely on SMS for all patient-facing flows (rejected — SMS scales for transactional notifications but not for ongoing consent management; the patient needs a place to see "which clinics currently have access to my records" at a glance).
**Outcome**: Patient app shipped in Phase 1 as a separate Next.js app (D-060). Phase 1 patient surface includes records, prescriptions, medications, vitals, diary, sharing, privacy code, messaging-reconsent — see ARCHITECTURE §7 patient-app routes. Captured in PRODUCT_SPEC.md "Phased Expansion" — this D-XXX is the canonical "why" for that phasing change (PRODUCT_SPEC describes WHAT each phase contains; DECISIONS_LOG describes WHY the boundary moved). Pairs with D-060 (separate Next.js app), D-068 (directional consent the app surfaces), D-073 (paired phasing decision: pharmacy/lab schema moved into Phase 1 alongside this).

---

## D-073: Pharmacy/lab schema in Phase 1; UI deferred to Phase 2/3

**When**: 26 April 2026 (locked design block)
**Context**: Pharmacy and lab integrations (Layer 4 service network) are Phase 2/3 product work — they require partnerships, volume, and a different commercial motion than clinic adoption (Phase 1). The question was whether to defer the *schema* alongside the UI, or whether to lock the schema in Phase 1 even though the UI ships later. Schema-first carries cost (DB migrations, RLS policies, code-layer types) for tables that have no UI consumers; deferring schema carries different cost (when Phase 2/3 partnerships materialize, schema design under partnership-deadline pressure tends to overfit to the first partner's data shape). Egyptian pharmacy/lab data shapes vary across providers; designing the schema with multiple providers in mind requires more breathing room than a partner-deadline allows.
**Decision**: Pharmacy and lab **schema** lands in Phase 1 as part of the migration tree, even though the **UI** is deferred to Phase 2/3. This means tables, FKs, RLS policies, and TypeScript types are present on staging and shipped to production; the patient-app and clinic-app UI surfaces for ordering / fulfilling lab tests and pharmacy prescriptions are not built yet. Existing tables (`lab_orders`, `lab_results`, `prescriptions`, `prescription_items`) are already in the Phase 1 schema; D-073 affirms that the gap-fill schema work for pharmacy partnerships (e.g., pharmacy_orders, pharmacy_dispensations, lab_provider_routing) lands in Phase 1 migration sequence as schema-only, with UI to follow.
**Alternatives**: Defer schema alongside UI to Phase 2/3 (rejected — would force schema design under partnership-deadline pressure when those partnerships materialize, leading to overfit-to-first-partner shapes that are expensive to refactor later). Build minimal UI alongside schema in Phase 1 (rejected — UI without partnerships is a vanity feature; the schema-only path lets us validate the data model against multiple potential partners without committing UI surface area). Use a generic `external_orders` table that all integrations route through (rejected — over-abstracted; the lab-provider, pharmacy-provider, and (future) imaging-provider integrations have non-overlapping data shapes that an abstract table would muddy; concrete-table-per-domain is more maintainable).
**Outcome**: Schema-first approach codified. Lab tables (`lab_orders`, `lab_results`) are already in the Phase 1 migration tree (mig 007 + 094 RLS); pharmacy gap-fill schema is queued for Phase 1 implementation as partnerships clarify the field shapes. **Implementation note: Phase 2/3 UI work** picks up the schema and builds the actual ordering/fulfillment surfaces. Captured in PRODUCT_SPEC.md "Phased Expansion" Layer 4 — DECISIONS_LOG describes the rationale for landing schema in Phase 1 even when UI is deferred. Pairs with D-072 (paired phasing decision: patient app moved into Phase 1 alongside this schema-first approach).

---

## D-074: Phase D #1.5 reconstructed RLS test matrix as canonical regression test

**When**: 6 May 2026 (locked at end of Phase D #1.5 reconstruction session)
**Context**: Phase D run #1 (177 scenarios across 24 tables) was authored interactively across cowork sessions 5/7/10/11/13/14a in late April 2026. Outcomes were recorded in `_rls_test_results WHERE run_no = 1` but the source SQL was never persisted — a process-level finding codified as Empirical Lesson #12. Mig 106 (2026-05-03) reverted two RLS helpers from DEFINER → INVOKER, a behavioral change that warranted re-running the matrix; the push gate to `origin/main` was held until that empirical regression coverage existed. With no executable matrix, no re-run was possible. The reconstruction's job was to express the 177 scenarios as durable executable code, run them against post-mig-106 staging, and confirm 177/177 outcome agreement with run #1.
**Decision**: `audits/rls-test-matrix-reconstructed.sql` is the canonical regression test for the locked hybrid 3-DEFINER + 2-INVOKER RLS architecture (D-064 / ARCHITECTURE §12). The file is one parameterized SQL with one DO block per table, using the harness pattern from Empirical Lesson #3 (separate `SET LOCAL ROLE 'authenticated'` + `SET LOCAL "request.jwt.claims"` statements before the test query). Each scenario records to `_rls_test_results` via the `rls_test_record(...)` SECURITY DEFINER function, including a `source_file` column added by mig 107. Pre-flight calls `rls_test_teardown(); rls_test_seed();` so the matrix is fully reproducible from a clean seed. Runs are recorded under fractional `run_no` values (1.5 here, 1.6+ for future re-runs); mig 107 retyped `_rls_test_results.run_no` from INTEGER to NUMERIC to support this naming convention without integer-encoded sentinels. Future RLS-touching migrations re-run this matrix as the empirical gate before push.
**Alternatives**: Hardcode `run_no = 15` as integer encoding of "1.5" without retyping the column (rejected — encoding-via-convention violates Empirical Lesson #8 which mandates schema changes through committed migration files; mig 107 was authored instead). Skip persistence and continue running scenarios interactively as needed (rejected — repeats the Empirical Lesson #12 failure that necessitated this work in the first place; the matrix needs to be a tracked artifact future engineers can `git checkout`). Author the matrix and defer the comparison-vs-run-#1 verification (rejected — without empirical agreement against the pre-mig-106 baseline we have no evidence that mig 106's INVOKER revert preserved correctness).
**Outcome**: Matrix authored and executed against staging on 2026-05-06 producing 177/177 PASS at `run_no = 1.5`, fail = 0 across all 24 tables. The comparison query against run #1 returned a single divergence: `audit_events.S6` row count 8 → 10 (run #1 cycle-8 baseline vs run #1.5 cycle-N baseline). This is a seed-cycle accumulation artifact — `rls_test_teardown()` only cleans `audit_events` rows with `entity_type IN ('global_patients', 'patient_data_share')` but the PCR-insert trigger emits `entity_type='patient_clinic_record'` rows that aren't cleaned, accumulating +4 rows per cycle. Outcome match (SUCCESS=SUCCESS) is preserved; this is NOT an RLS regression. The matrix file's `audit_events` block computes `expected_rows` for S6 dynamically at run time as the postgres-view count, so future re-runs remain reproducible despite the seed drift. Pairs with mig 107 (column retype + source_file column), Empirical Lesson #12 (root cause), Empirical Lesson #16 (verify against ground truth). Phase D push gate cleared. Phase F follow-up tasks now unblocked.

> **Amendment 2026-05-07 — audit_events.S6 dynamic-row workaround REVERTED to hardcoded after mig 108 fix (Phase F Task 18).** The cycle-stable post-fix value is **1** (one PCR audit row resolves to `patient_y_gp` per seed cycle: the single PCR INSERT at clinic_a). Mig 108 extends `rls_test_teardown()`'s `audit_events` DELETE clause with `resolved_global_patient_id = ANY(test_gps)` plus a defensive `entity_type='patient_clinic_record' AND metadata->>'global_patient_id' = ANY(test_gps)` clause, so each seed cycle starts from a clean baseline. The matrix file's Section 19 has been updated: `audit_events.S6` `expected_rows` is now hardcoded to 1 (was the dynamic `v_y_baseline` count); the DECLARE block no longer computes a live postgres baseline. Re-ran the matrix at `run_no = 1.6` — 177/177 PASS, comparison vs run #1 reports only the audit_events.S6 row-count divergence (8 → 1) which is the *expected* post-fix invariant (run #1 was cycle-8 historical accumulation; run #1.6 is cycle-clean). One additional non-obvious schema fact surfaced during the fix and is captured in mig 108's header for forensic completeness: `audit_events.resolved_global_patient_id` is a GENERATED ALWAYS column (computed at INSERT from `metadata->>'global_patient_id'` or `entity_id` when `entity_type='global_patients'`), not a separate resolver-trigger output — so the "defensive metadata fallback" clause in the new DELETE filter is functionally redundant with the `resolved_global_patient_id` clause but is retained for readability. Pairs with mig 108 (the fix), Empirical Lesson #2 (smoke probe in mig 108 verifies cleanup), Empirical Lesson #7 (live function body pulled from `pg_proc` was the source of truth — `audits/rls-test-seed.sql`'s body was out of date relative to staging).

---

## D-075: Pre-push gate extended from 3 → 5 passes (`next build` for both apps)

**Decision Date:** 2026-05-09
**Context:** Empirical Lesson #17 (codified 2026-05-08 in `audits/EXECUTION_PROMPTS.md`) documents that `tsc --noEmit` does not enforce Next.js's route-handler type contract — a handler declaring `export async function GET(request?: Request)` (optional first parameter) compiles clean under tsc but fails inside `next build`'s typegen because the contract requires the first parameter to be `NextRequest | Request` with no `undefined` in the union. The Lesson's "Operational follow-up flagged for Phase F discussion" left open the question of whether to add `next build` to the pre-push gate.

The 6-run failure series 115-120 (2026-05-07, commits `61f8752` through `134e272`) demonstrated the cost of not catching this locally: each red CI run took ~5-8 minutes to surface the same error, and the Lint & Type Check job stayed green throughout (only Build Patient App caught it). At pre-push time, the failing handler would have been caught in ~75-150 seconds with the new gate.

**Decision:** Extend `.husky/pre-push` from 3 passes to 5 passes. Add Pass 4 (`npm run build:clinic`) and Pass 5 (`npm run build:patient`) sequentially after the existing tsc + lint:scopes passes.

**Trade-offs:**
- Sequential, not parallel — readability on failure outweighs the ~75-150s wall-clock penalty (Decision 2 in `audits/phase-f-closeout-decisions-2026-05-09.md`).
- Full `next build`, no `--no-lint` flag — pre-push mirrors CI verbatim; latency saving is small relative to total gate time and would skip per-app eslint coverage that catches additional regression classes (Decision 1).
- Apps only — shared packages already covered by Pass 1 (root tsc) which sees the entire monorepo (Decision 3).
- Total expected pre-push wall clock: ~2.3-4.4 minutes; skip via `git push --no-verify` for WIP branches per the existing convention.

**Empirical verification status:** The new gate's logic was sandbox-reproduced as the negative claim — gates 1-3 (root tsc + clinic tsc + lint:scopes) all pass clean with the Lesson #17 anti-pattern in place, confirming the gate's necessity. Empirical confirmation that Pass 4 fires on the anti-pattern was sandbox-deferred to Mac (the cowork sandbox's 45-second bash timeout cannot complete a `next build` for either app, which takes 60-180s wall clock; Decision 4).

**Outcome:** Gate shipped 2026-05-09 in the Phase F closeout autonomous batch. ARCH §3 file tree comment + Technology Stack pre-push row updated to reflect the 5-pass model. Mac-side empirical verification = single `.husky/pre-push` invocation before push (full 5-pass clean confirms the new lines work).

---

## D-076: Root `next` audited as vestigial template residue; removal deferred to Task 19a

**Decision Date:** 2026-05-09
**Context:** Phase F Task 19 (queued from 2026-05-08 D2 Dependabot triage) asked whether root `package.json`'s `next` declaration is an orphan dep removable for cleanup. The 2026-05-09 Phase F closeout batch performed the audit per Decisions 9 + 10 in `audits/phase-f-closeout-decisions-2026-05-09.md`.

**Audit findings:**
- Root has NO `app/`, `pages/`, `next.config.js`, `next-env.d.ts`, or imports of `next`.
- Four root scripts `dev/build/start/lint` reference `next` but were added in commit `4a4f368` ("initial upload") and are NEVER invoked since CI uses workspace-scoped `npm run build:clinic` / `:patient`.
- `turbo.json` task pipeline uses `dependsOn: ["^build"]` (workspace dependency chains); does not invoke root next directly.
- No `vercel.json` (deployment is workspace-scoped; apps deploy independently).
- `.next/` exists at root but contains only stale `trace` from Apr 11 — not load-bearing.
- 0 root-package.json next alerts open in `audits/dependabot-alerts-2026-05-09.json` (root next was already at 14.2.35 from yesterday's Tier 1 bump).

**Categorization:** Vestigial template residue (not orphan-clean — referenced by 4 dead scripts; not tooling-dep — turbo/CI/Vercel don't depend on it; not type-only — no imports). Same template-residue origin as other root deps (`@radix-ui/*`, `lucide-react`, `framer-motion`, `cmdk`) which appear duplicated between root and `packages/shared/package.json` from the pre-monorepo era.

**Decision:** Keep root next + the 4 vestigial scripts in this batch. **Defer removal to a focused workstream "Task 19a — root vestigial dep cleanup"** that triages all root template-residue deps together (next + Radix + lucide-react + framer-motion + cmdk + others) in one focused PR with Vercel preview deploy verification.

**Reasoning:**
- Closures expected from removal: 0 (no security urgency).
- Task 19a's blast-radius surface (turbo, possible external Vercel config, hoisted dedup deps) deserves empirical verification via a preview deployment which a focused single-purpose PR can do cleanly; bundling into the Phase F closeout batch would compound today's Tier 2 450-line lockfile delta and obscure attribution if a removal-side regression surfaced.
- REVIEW_CRITERIA §2.2 (smaller diff surface = less risk) supports the conservative option.

**Outcome:** Phase F Task 19 → AUDITED + DEFERRED 2026-05-09. New workstream Task 19a queued in `audits/PROGRAM_STATE.md` entry 13.

---

## D-077: Tier 2 Dependabot bump — apps' next + eslint-config-next 14.2.25 → 14.2.35 (paired)

**Decision Date:** 2026-05-09
**Context:** Following the 2026-05-08 Tier 1 bump (root next 14.1.0 → 14.2.35, closing 1 critical CVE-2025-29927 + 6 root-only `next` advisories), the 2026-05-09 Phase F closeout batch performed the Tier 2 bump that propagates the same fix-set to apps' lockfile entries plus apps' manifest entries.

**Decision:** Bump apps' next and apps' eslint-config-next together from 14.2.25 to 14.2.35. Keep root eslint-config-next at 14.1.0 (cosmetic lag; not invoked at root; Task 19a-shaped concern).

**Reasoning:**
- eslint-config-next must remain paired with next per the existing convention; an apps-next-only bump would create an apps' next ↔ eslint-config-next version mismatch.
- 14.2.25 → 14.2.35 is a same-minor-line patch sequence with no breaking changes per Next's release notes.
- Lockfile delta empirically inspected: 450 lines (36+, 422-) bounded entirely to next dep tree (`@next/env`, `@next/eslint-plugin-next`, `@next/swc-*` platform binaries, `nanoid`, `postcss`, `balanced-match`) + dedupe cleanup of pre-existing peer:true / license-trailing-comma drift from npm 11 vs npm 10 metadata refresh. 32 integrity hash changes = 32 distinct packages in the next transitive dep tree updating to new tarballs.
- Larger than yesterday's Tier 1 delta (113 lines) because two apps have separate `node_modules` trees.

**Expected closures: 21** (per Decision 8 in `audits/phase-f-closeout-decisions-2026-05-09.md`):
- 14 manifest closures (7 GHSAs × 2 apps): GHSA-5j59 + GHSA-mwv6 + GHSA-4342 + GHSA-xv57 + GHSA-g5qg + GHSA-3h52 + GHSA-223j (each on both apps/clinic and apps/patient).
- 7 lockfile closures: same 7 GHSAs once 14.2.25 leaves the lockfile entirely (lockfile previously contained both 14.2.25 from apps and 14.2.35 from root; Tier 2 leaves only 14.2.35).
- 10 manifest stays-open + 5 lockfile stays-open = 15 alerts requiring Next 15+ (Tier 3 territory; deferred per yesterday's triage).

**Verification gates:** All 4 sandbox-runnable gates clean post-bump (G1 root tsc 3.8s, G2 clinic tsc 3.1s, G3 patient tsc 2.3s, G4 lint:scopes 4.4s). Gate 5 (`next build` × 2) Mac-deferred per D-075's Decision 4 (sandbox 45s timeout vs 60-180s build wall clock).

**Post-push verification (Lesson #18 standing rule):**
```bash
gh api "repos/Medassist2026/medassist/dependabot/alerts?state=fixed&per_page=100" --paginate \
  | jq '[.[] | select(.fixed_at >= "2026-05-09T06:11:48Z")]'
```
Expected: 21 rows. Filter by event timestamp, NOT by net `length()` delta of open-state alerts (Lesson #18 — net delta gets corrupted by parallel arrivals from independent sources).

**Outcome:** Apps + eslint-config-next bumped 2026-05-09 in the Phase F closeout batch. ARCH §3 next-pin row updated 14.2.25 → 14.2.35.

---

*Last entry: D-077 | D-074 (amended 2026-05-07) | D-065 amended twice 2026-05-07 | 9 May 2026*
*Add new decisions at the bottom with sequential ID.*
