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

---

## D-005: Monorepo with npm workspaces

**When**: Early architecture
**Context**: Business logic (auth, data, validation) needs to be shared between the web app and a future mobile app. UI components are role-specific but share design tokens.
**Decision**: Three-package monorepo: `apps/clinic` (web app), `packages/shared` (business logic), `packages/ui-clinic` (React components).
**Alternatives**: Single app (no code reuse), Turborepo-only (added but not required), Nx (too heavy).
**Outcome**: `@medassist/shared` has 60+ modules covering auth, data, SMS, analytics, offline, validation. `@medassist/ui-clinic` has 26 components organized by role. Mobile-strategy-agnostic separation that pays off for the chosen mobile path.

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
**Outcome**: Migration 070 live in production. `phone-changes.ts` data module (~1100 lines, 8 public functions) orchestrates the full lifecycle. Phase A live and audited. Phase B server endpoints return 404 behind flag. 1 pre-existing divergent `auth.users.phone` row discovered and flagged (TD-015). See also OPD-004 (cross-clinic identity merging deferred to Phase 2).

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

*Last entry: D-057 | 26 April 2026*
*Add new decisions at the bottom with sequential ID.*
