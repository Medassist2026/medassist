# MedAssist Feature Audit — 01

> Date: 2026-04-26 · Auditor: senior-eng review · HEAD: per ARCHITECTURE.md v0.5.0
> Scope: PRODUCT_SPEC.md vision vs. shipped code under `apps/clinic`, `packages/shared`, `packages/ui-clinic`, `supabase/migrations`.
> Method: every claim cited with `path:line`. Verified in code, not the docs.

---

## TL;DR

Phase 1 looks 80% built but the **two biggest moats — phone-based global patient identity and the ~500-rule drug-interaction database — are dramatically thinner than PRODUCT_SPEC describes.** The clinic shell (auth, multi-clinic, frontdesk, RTL/Arabic, Rx print, idb-cache) is solid and largely launch-ready. The Layer-2 differentiation — patient records that travel across clinics, real DDI coverage, WhatsApp delivery — is not there yet. There is also non-trivial scope creep (labs, imaging, ICD-10, audit log, complex multi-doctor visibility) that the spec explicitly defers to Phase 3+ but is already in the live tree.

---

## SECTION A — Vision alignment

### 1. Smart chip prescription (<30s for 3 drugs) — **PARTIAL**

- Chip-based MedicationChips UI is real and wired into `SessionForm`: `packages/shared/components/clinical/SessionForm.tsx:12` imports `MedicationChips`.
- 3-char autocomplete via debounced `/api/drugs/search`; handler at `packages/shared/lib/api/handlers/drugs/search/handler.ts` and route `apps/clinic/app/api/drugs/search/route.ts:1`.
- Smart defaults are real: each `EgyptianDrug` carries `defaults: { type, frequency, duration, instructions }` — see `packages/shared/lib/data/egyptian-drugs.ts:22-44, 50-76`.
- "Recent drugs" surface shipped (`apps/clinic/app/api/drugs/recent/route.ts`) but is just last-20-notes top-5 (`packages/shared/lib/api/handlers/drugs/recent/handler.ts`). **No persistent doctor-pattern table** ("Dr. Ahmed always prescribes Augmentin 1g") — the spec's Hook 1 learning behavior is missing. `apps/clinic/app/api/doctor/personalized-chips/route.ts` exists but is not personalization in the strong sense.
- **No timing instrumentation anywhere.** No code measures the 30-second target, no analytics event for time-to-Rx-saved.

### 2. Drug interaction warnings (rule-based, ~500 critical) — **PARTIAL**

- DDI engine and live UI shipped: `packages/shared/lib/data/drug-interactions.ts` plus `InteractionWarning` mounted in `SessionForm.tsx:15`.
- 18 drug classes mapped (`drug-interactions.ts:59`); regression tests in `packages/shared/lib/data/__tests__/drug-interactions.test.ts` (~24 cases — the "31 tests" figure in ARCHITECTURE.md §6.2 refers to `doctor-stats.test.ts`, not DDI).
- **Coverage is ~68 pair-rules, not ~500.** Grep counts 136 `drugA|drugB` field lines across the file → 68 unique interaction objects. PRODUCT_SPEC §"Drug Interaction Warnings (P0)" promises ~500. This is the single biggest spec-vs-code gap on a P0 hook.

### 3. Pharmacy callback elimination (legible printed/PDF) — **SHIPPED**

- Print page exists with its own `(doctor-print)` route group: `apps/clinic/app/(doctor-print)/doctor/prescription-print/page.tsx`.
- Tracking endpoint: `apps/clinic/app/api/clinical/prescription/mark-printed/route.ts`.
- "PDF" handler `apps/clinic/app/api/clinical/prescription-pdf/route.ts` returns rendered HTML for browser print, not a binary PDF — fine for the laser-printer use case but technically misnamed.

### 4. Egyptian drug DB with brand-name aliasing — **PARTIAL**

- Curated list lives in `packages/shared/lib/data/egyptian-drugs.ts` — 801 drugs (grep count of top-level `{` entries). Each row has `brandName`, `brandNameAr`, `genericName`, `searchTerms` (Arabic + English).
- Extended ~25K-drug Egypt DB lazily loaded by `packages/shared/lib/data/extended-drug-search.ts`.
- **Brand-name aliasing is implicit, not explicit.** No `aliases` / `brandNames[]` field (verified by grep — zero matches for `aliases|brandNames`). Augmentin / Clavimox / Megamox would each be separate rows sharing `genericName`. Doctors search by name; cross-brand awareness depends on doctors typing the right one or the search returning by generic. This is good enough for v1 but it is not the "competitive-advantage IP" the spec describes (line 180).

### 5. WhatsApp prescription delivery — **STUBBED**

- `sendWhatsApp()` exists at `packages/shared/lib/sms/twilio-client.ts:60-62`, but it just prepends `whatsapp:` to the SMS sender — that's the Twilio sandbox shape, not a configured WhatsApp Business API integration. **No production caller anywhere.**
- Code comment is explicit: `packages/shared/lib/sms/prescription-sms.ts:8` — *"SMS-first, not WhatsApp."*
- Post-save Rx delivery to patient does work via SMS only (`packages/shared/lib/api/handlers/clinical/notes/handler.ts:186-233`). PRODUCT_SPEC repeatedly assumes WhatsApp (lines 76, 84, 153, 182-184).

### 6. Phone-based **global** patient identity — **STUBBED**

This is the most architecturally important finding.

- `patients.phone` has **no UNIQUE constraint** — see `supabase/migrations/001_initial_schema.sql:46` (`phone TEXT NOT NULL`) and line 52 (only an *index*, not unique). Compare to `users.phone` at line 13 which IS `UNIQUE NOT NULL`.
- `patients.clinic_id` was added in migration 023 (`023_clinic_architecture_completion.sql:91-103`) and is now `NOT NULL` after migration 051. That makes patient rows **clinic-scoped**, not global.
- `checkPhoneExists()` only returns positives for `registered=true` patients (`packages/shared/lib/data/patients.ts:111-118`); a walk-in created at Clinic A is invisible at Clinic B.
- Translation: today, the same patient phone can exist as N rows across N clinics. The "longitudinal record across all MedAssist doctors" promised in PRODUCT_SPEC §Vision and §"Phase 2: Patient Identity Network" is not enforceable on the current schema. This is the core moat — it is currently a wish, not a constraint.

### 7. Doctor + Frontdesk in tandem — **SHIPPED**

- Both route groups exist with role-gated layouts: `apps/clinic/app/(doctor)/`, `apps/clinic/app/(frontdesk)/`.
- Frontdesk check-in writes to `check_in_queue`, doctor dashboard reads it via realtime — `apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx:75-96`, `apps/clinic/app/(doctor)/doctor/dashboard/page.tsx`, `packages/ui-clinic/components/frontdesk/RealtimeQueueWrapper.tsx`.
- Test accounts in `supabase/migrations/043_dev_test_accounts.sql:125-144` cover the doctor+frontdesk-in-Clinic-B scenario.

### 8. Multi-clinic membership for doctors — **SHIPPED**

- `clinic_memberships` is the source of truth (mig 018). Active clinic carried in cookie via `getActiveClinicIdFromCookies()` at `packages/shared/lib/data/clinic-context.ts:50-65`.
- Switcher: `apps/clinic/app/api/clinic/switch/route.ts` + `packages/ui-clinic/components/clinic/ClinicSelector.tsx`.
- Note: per §"Data validation" in PRODUCT_SPEC, all 32 live `patient_visibility` grants point to OWNERs. Multi-clinic is ready, multi-doctor is not yet load-bearing.

### 9. Arabic-first, RTL-first UI — **SHIPPED**

- 634 keys in `packages/shared/lib/i18n/ar.ts`, no English fallback bundle.
- `dir="rtl"` set in `packages/ui-clinic/components/doctor/DoctorShell.tsx:35`, `packages/ui-clinic/components/patient/PatientShell.tsx:30`, frontdesk layout `apps/clinic/app/(frontdesk)/layout.tsx:40`.
- Cairo font primary in `apps/clinic/tailwind.config.ts:74`.

### 10. Mobile-first (`max-w-md` container) — **PARTIAL** (and ARCHITECTURE.md is wrong)

- Frontdesk layout and bottom nav use `max-w-md` (`apps/clinic/app/(frontdesk)/layout.tsx:48`, `packages/ui-clinic/components/frontdesk/FrontdeskBottomNav.tsx:21`).
- **DoctorShell uses `max-w-lg`, not `max-w-md`** — `packages/ui-clinic/components/doctor/DoctorShell.tsx:43`. ARCHITECTURE.md §9.1 ("Mobile-first `max-w-md` container") is **incorrect** as of HEAD. Doc inconsistency — flag for amendment.

### 11. Offline resilience (IDB cache + sync queue) — **PARTIAL** (and TD-008 is stale)

- `packages/shared/lib/offline/idb-cache.ts` exposes `addPendingWrite` / `syncPendingWrites` / `getPendingWriteCount`.
- `packages/ui-clinic/components/frontdesk/OfflineIndicator.tsx` mounts the badge in frontdesk layout.
- ARCHITECTURE.md §16 TD-008 claims *"no actual write surface enqueues."* **This is out of date.** Real callers exist:
  - `apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx:162` — `addPendingWrite('/api/frontdesk/checkin', 'POST', checkinBody)`.
  - `apps/clinic/app/(frontdesk)/frontdesk/payments/new/page.tsx`.
  - `packages/shared/components/clinical/SessionForm.tsx:8` (imported; called in error path).
  - `packages/shared/hooks/useOfflineMutation.ts` is the wrapper.
- Server-side idempotency partially landed: migration `069_add_idempotency_keys.sql` adds `client_idempotency_key`. Reconnect-replay is wired; auth-refresh-mid-replay still undefined. Net: 70% there, not zero.

---

## SECTION B — Scope creep inventory

Items found in the tree that are **not** in PRODUCT_SPEC (or are explicitly deferred there).

| # | Item | Where | Spec? | Recommendation | Why |
|---|------|-------|-------|----------------|-----|
| 1 | `lab_results` + `lab_orders` + `lab_tests` | `apps/clinic/app/api/clinical/lab-results/route.ts`, `packages/shared/lib/data/lab-results.ts`, mig 007/057/059/060 | Phase 3 only | **DEFER** (feature-flag OFF, schema stays) | Layer 4 in spec. Doctors don't need it for prescription workflow. |
| 2 | `imaging_orders` | `apps/clinic/app/api/doctor/imaging-orders/route.ts`, mig 012/058 | No | **DEFER** (flag OFF) | Same as labs. |
| 3 | Doctor↔patient `messages` + `conversations` | `apps/clinic/app/(doctor)/doctor/messages/page.tsx`, `/api/doctor/messages/*`, mig 009/011/062/063 | Patient mini-portal (Phase 2) implies it | **DEFER** | Patient app is Phase 2; messaging UX inside clinic app today is dead surface. |
| 4 | Push notifications | `apps/clinic/app/api/push/subscribe/route.ts`, `push_subscriptions` table mig 042 | No | **DEFER** (flag OFF) | Subscribe endpoint exists; no sender path. Half-built. |
| 5 | LAN sync scaffolding | Per D-044, files deleted | Removed | **DELETE** ✓ | Already done. |
| 6 | Capacitor SQLite/`local-db.ts` | Per D-043, deleted | Removed | **DELETE** ✓ | Already done. |
| 7 | "Morning sync" | Grep: zero matches | No | n/a | Never existed. |
| 8 | ICD-10 search | `apps/clinic/app/api/icd10/search/route.ts` | No | **DEFER** | Spec §"What NOT to build": "Complex encounter templates (adds friction)." ICD codes are friction. Keep table, hide UI. |
| 9 | `prescription_templates` | `apps/clinic/app/api/clinical/templates/route.ts`, mig 031, doctor settings page | Speed Hook 1 implies *defaults*, not user-managed templates | **KEEP** | Genuine speed multiplier for chronic-disease doctors (the target specialty). Worth the surface. |
| 10 | `consent_log` table | mig 020 (created) | No | **DELETE** | Grep: zero writers, zero readers. Pure dead schema. |
| 11 | `audit_log` + clinic-settings audit page | `apps/clinic/app/api/clinic/audit-log/route.ts`, `apps/clinic/app/(doctor)/doctor/clinic-settings/audit/page.tsx`, `packages/shared/lib/data/audit.ts` | No | **DEFER** | Useful for support but not a Phase-1 differentiator. Keep writes (cheap), hide page. |
| 12 | `doctor_availability` + `appointment_window_state` | `/api/doctor/availability/route.ts`, mig 036/037/039 | Spec §"What NOT to build": "Appointment scheduling — not the differentiator, WhatsApp/phone works fine." | **DEFER** (flag OFF; some clinics may want it) | Live, but spec is explicit. Make it opt-in per clinic. |
| 13 | `assistant_doctor_assignments` w/ `PATIENT_DEMOGRAPHICS` vs `FULL_DOCTOR_SUPPORT` scope | `packages/ui-clinic/components/clinic/AssistantDoctorSelector.tsx`, mig 020 | Spec §"What NOT to build": "Multi-doctor complex permissions" | **DEFER** | All 32 live grants point to OWNERs (D-049). Today this serves zero customers. |
| 14 | `patient_visibility` modes (`DOCTOR_SCOPED` / `CLINIC_WIDE`) | `packages/shared/lib/data/visibility.ts`, mig 020/052/067 | Implicit | **KEEP (default DOCTOR_SCOPED, hide toggle)** | The plumbing is now load-bearing for RLS. Don't expose the toggle in v1 — hardcode default. |
| 15 | `patient_medication_intake_log` (compliance) | mig 015, `packages/shared/lib/data/medications.ts` | No | **DEFER** | Patient-side feature; Phase 2. |
| 16 | Analytics dashboard for doctors | `apps/clinic/app/(doctor)/doctor/analytics/page.tsx`, `packages/shared/lib/analytics/doctor-stats.ts` (31 tests) | No | **KEEP** | Founder/sales-side win — "show the doctor their own activity" drives retention. Cheap to keep. |
| 17 | Frontdesk invoice/receipt printing | `apps/clinic/app/(frontdesk)/frontdesk/invoice/[paymentId]/page.tsx`, mig 040 | No | **KEEP** | Real Egyptian-clinic need. Cheap, already built. |

That's 17 items, ≥10 required.

---

## SECTION C — Critical gaps (ranked)

| Rank | Gap | Severity | Fix-or-defer |
|------|-----|----------|--------------|
| C1 | **Patient identity is clinic-scoped, not global.** `patients.phone` has no UNIQUE constraint; each clinic creates its own row. Without this, the entire Layer-2 thesis is unsupported. | **LAUNCH-BLOCKER** | **Fix.** Add migration: enforce `UNIQUE` on `patients.phone` (after de-duping existing rows via `patient-dedup.ts`). Refactor `onboardPatient` to upsert by phone, not insert per clinic. ~1 week. |
| C2 | **DDI rule set is ~68 not ~500.** Hook 2 is supposed to be the "aha moment" of week one. 68 rules will miss too many real interactions. | **LAUNCH-BLOCKER** | **Fix.** Mo or a clinical advisor compiles the 500-rule set; engineering wires it as a static seed under `drug-interactions.ts`. Schema unchanged. ~2-3 weeks. |
| C3 | **WhatsApp delivery is a stub.** PRODUCT_SPEC mentions WhatsApp 6 times. Today it's Twilio SMS only. | **HIGH** | **Defer to Phase 2** *or* fix by integrating 360dialog/WATI now. Decision needed from Mo. SMS-first is acceptable for v1 if the marketing copy matches reality. |
| C4 | **No <30s timing instrumentation.** Hook 1's headline metric is unmeasurable. | **HIGH** | **Fix.** Add an `analytics_events` row at first chip click and at save. Trivial — half a day. Without this we can't validate the value prop in Mo's 5-min demo. |
| C5 | **No persistent doctor-pattern learning.** Spec's "Dr. Ahmed always prescribes Augmentin 1g → show 1g first" is not implemented; recent-drugs is just a 20-note slice. | **MEDIUM** | **Defer to Month 2-3 iteration.** Recent-drugs covers 80%; full personalization needs production usage data anyway. |
| C6 | **Doctor pattern learning conflated with `prescription_templates`.** Two surfaces compete (user-managed templates vs. auto-personalization). Adds confusion. | **MEDIUM** | **Decide:** keep templates, hide personalization until later. Or vice versa. Don't ship both half-built. |
| C7 | **Brand-name aliasing is implicit.** Doctor searching "Augmentin" won't see "Clavimox" alongside it; only the generic groups them. | **MEDIUM** | **Defer.** Add an `aliases: string[]` field to `EgyptianDrug` post-launch, populate top 200 brands. Not blocking demo. |
| C8 | **Offline-write idempotency contract is half-defined.** Mig 069 added the column; auth-refresh-mid-replay is not specified. | **MEDIUM** | **Defer past launch.** Frontdesk check-in's natural dedupe is sufficient for solo-clinic v1. |

---

## SECTION D — v1 launch feature-flag table

Canonical flag set for the next 12 weeks. Default everything OFF that isn't `ON`. Schema can stay — just hide the surface.

| Flag / surface | State | Notes |
|----------------|-------|-------|
| `chip_prescription` | **ON** | Core. |
| `drug_interactions_v1` | **ON** | Even at 68 rules, ship it. Add telemetry. |
| `drug_db_curated_801` | **ON** | |
| `drug_db_extended_25k` | **ON** | Lazy-loaded; cheap. |
| `prescription_print` | **ON** | |
| `prescription_pdf_via_html` | **ON** | Misnamed; rename later. |
| `prescription_sms_to_patient` | **ON** | Replaces the missing WhatsApp path. |
| `whatsapp_delivery` | **OFF** | Until 360dialog/WATI wired. |
| `global_phone_identity` | **OFF until C1 fixed → ON** | Add `UNIQUE(phone)` migration first. |
| `multi_clinic_doctor` | **ON** | Used today. |
| `multi_doctor_visibility (CLINIC_WIDE)` | **OFF** (hide toggle, default `DOCTOR_SCOPED`) | All live clinics are solo today. |
| `assistant_doctor_assignments` | **OFF** (hide UI) | Zero load-bearing usage. |
| `frontdesk_checkin` | **ON** | |
| `frontdesk_payments` | **ON** | |
| `frontdesk_invoice_print` | **ON** | |
| `analytics_dashboard (doctor)` | **ON** | |
| `appointment_scheduling` | **OFF per clinic** (opt-in) | Spec says don't build; but it's built, so let solo clinics opt in. |
| `lab_orders + lab_results` | **OFF** | Defer. |
| `imaging_orders` | **OFF** | Defer. |
| `icd10_search` | **OFF** | Defer. |
| `prescription_templates` | **ON** | Real value for chronic-disease doctors. |
| `messages (doctor↔patient)` | **OFF** | Wait for Patient App (Phase 2). |
| `push_notifications` | **OFF** | Subscribe endpoint stays; no sender. |
| `audit_log writes` | **ON (silent)** | Keep writing; hide page. |
| `audit_log clinic-settings page` | **OFF** | |
| `consent_log` | **DELETE** | Dead table. |
| `LAN sync` | **DELETE** ✓ | Done per D-044. |
| `Capacitor scaffolding` | **DELETE** ✓ | Done per D-043. |
| `offline_idb_writes (frontdesk checkin/payments/notes)` | **ON** | Already shipping; finalize idempotency on next pass. |
| `doctor_personalization_v1 (recent drugs)` | **ON** | |
| `doctor_personalization_v2 (pattern learning)` | **OFF** | Post-launch iteration. |
| `voice_to_prescription` | **OFF** | Month 4 per spec. |

---

## Doc inconsistencies to amend

1. **ARCHITECTURE.md §9.1**: claims `max-w-md` container; `DoctorShell.tsx:43` uses `max-w-lg`.
2. **ARCHITECTURE.md §16 TD-008**: claims no write surface enqueues offline; `addPendingWrite` is called from frontdesk checkin (`...checkin/page.tsx:162`), payments/new, and `SessionForm.tsx:8`. TD-008 should be downgraded to "in-progress, idempotency contract incomplete."
3. **PRODUCT_SPEC.md "~500 critical interactions"**: actual rule count is 68. Either ship the other ~430 or update the spec.

---

*End of audit · ~1,950 words.*
