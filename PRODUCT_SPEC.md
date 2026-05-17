# MedAssist Product Specification

> Last updated: 26 April 2026 (phone-change flow) — Update this when strategy changes

---

## Vision

Digitalize Egyptian healthcare by building the patient records network that connects patients, doctors, labs, and pharmacies. Whoever owns the patient's longitudinal health record owns the future. Everything else is a feature.

## The Egyptian Healthcare Digitalization Stack

```
LAYER 5: ECOSYSTEM INTEGRATION (5-10 years)
  Insurance claims, Government reporting, Health analytics
  Requires government cooperation

LAYER 4: SERVICE NETWORK (3-5 years)
  Lab orders/results, Pharmacy prescriptions, Referrals
  Requires partnerships + volume

LAYER 3: PATIENT ENGAGEMENT (1-2 years)
  Patient mini-portal, Records access, Follow-up booking
  Requires clinic adoption first

LAYER 2: PATIENT RECORDS ← THIS IS THE REAL PRODUCT (6-12 months)
  Unified patient identity, Medical history, Prescriptions
  Phone-based global identity, not clinic-scoped

LAYER 1: CLINIC ADOPTION ← THIS IS JUST THE DOOR (NOW)
  Get doctors using any digital tool consistently
  Entry point, not the product
```

Layer 1 is the entry point. Layer 2 is the actual product. Everything above Layer 2 is expansion.

## Core Strategic Insight

You cannot build a digital healthcare system that requires doctors to type. They won't. The prescription workflow is the only realistic entry point because:

1. Chip-based prescription UI can be genuinely FASTER than handwriting (15-24 seconds for 3 drugs vs 30-45 seconds by hand)
2. Every prescription captured = patient medical history built as a byproduct
3. Drug interaction warnings provide immediate value with zero extra doctor effort
4. Typed prescriptions eliminate pharmacy callbacks (real daily pain point)

The prescription flow IS the patient records strategy. You don't convince doctors to "enter patient records." You convince them to write prescriptions digitally. The records are a byproduct.

### Phone-First Identity Principle (D-057)

Phone is the canonical patient identity — it's how the system deduplicates, links records across clinics, and eventually powers the patient mini-portal. The UI must enforce this:

- **Identity-establishing forms** (Register page): Phone field renders first and gates all other inputs. Name, age, and sex are disabled until the phone is valid. Existing-patient detection happens at the phone field via typeahead, never at submit. Do not add name search to registration forms.
- **Discovery forms** (Check-in page): Name search is allowed as a convenience because the patient is already in the system — the assistant is finding them, not establishing their identity. Name search sources from `doctor_patient_relationships` (the canonical "patient is in this clinic" signal).

This distinction — discovery on Check-in, identity on Register — ensures the phone-based global identity promise is enforced by the UI, not just by the database.

## Target Market

**Primary:** Egyptian private clinics — solo and two-doctor practices (75-85% of market)

> **Data validation (25 April 2026):** RLS rewrite audit confirmed all 32 live `patient_visibility` grants point to clinic OWNERs. Production is effectively 100% solo clinics today — every doctor read passes through the OWNER short-circuit. The multi-doctor visibility machinery works but serves a future state. This validates the solo-practice focus.

**Primary user:** The assistant/receptionist — NOT the doctor. The assistant taps chips while doctor dictates verbally (mirrors current workflow: doctor dictates → assistant writes). Doctor's added work = glancing at screen instead of glancing at paper. Approximately zero extra effort.

**Target specialties for initial focus:** Chronic disease doctors (diabetes, hypertension) — they see same patients repeatedly and benefit most from medication history.

**Competitors:**
- Clinicy (struggling, 250-500 EGP/month)
- DrBridge (small)
- Vezeeta (owns booking, gave it away free — but doctors still don't actively use it)
- Dozens of local "clinic management" builds

Clinic management software is a commodity. MedAssist's differentiation is NOT clinic management — it's the prescription workflow + patient records network.

## Apps & Portals

### Clinic App (Phase 1 — NOW)
Doctor + Assistant/Front Desk portal. Covers prescription workflow, patient registration, encounter notes, and basic clinic operations.

**Platform:** Web-first for v1. Single platform done well beats three platforms done poorly.

### Patient App (Phase 1 — SHIPPED, narrowed scope per D-072)
Patient mini-portal for accessing their health records and managing cross-clinic record sharing consent. **Promoted from Phase 2 to Phase 1 by D-072 (26 April 2026)** — the directional consent model (D-068) requires a patient-facing surface to grant/revoke shares, so the patient app is load-bearing for Layer 2, not optional.

**Phase 1 scope (shipped):** records read-only, consent UI (privacy code regenerate, share grant/revoke/extend, messaging consent), Rx PDFs, basic messaging. Lives at `apps/patient/` as a separate Next.js app per D-060.

**Deferred to later phases:** appointment booking from the patient side, lab-result push notifications, chronic-condition tracking, fuller engagement features.

**Implementation:** PWA/web link delivered via WhatsApp — no app download required. OTP login with phone number. Patient sees all visits across ALL MedAssist doctors (chronological health timeline). Can share records with any doctor via the privacy code or via patient-app share grants.

**Entry-layer UX (codified by D-085 + Mo's I-7(a) ruling, 2026-05-15).** Unauthenticated visitors land on `/intro` — a mobile-first Arabic-first splash showing the MedAssist brand mark, a one-line tagline ("صحتك معك في كل مكان" — "Your health with you everywhere"), a short value-prop sentence, and two CTAs: "تسجيل الدخول" (Sign in → `/auth?tab=login`) and "إنشاء حساب جديد" (Register → `/auth?tab=register`). Authenticated patients on `/intro` short-circuit to `/patient/dashboard`. The `/auth` page is **patient-only** — no role selector, no specialty dropdown, no doctor/frontdesk variants (doctor + frontdesk auth lives only in the clinic app per D-085). The page exposes two tabs (login + register), an Arabic-first form, and a back link to `/intro`. After the user submits a registration, an OTP screen verifies their phone and lands them on `/patient/dashboard` — at which point the empty-state UX described next takes over.

**Self-registration UX (codified by D-084, 2026-05-15).** A patient who signs up via the patient app before ever visiting a MedAssist clinic gets a canonical phone-first identity (a `global_patients` row, claimed to their auth user) but **no clinical history** until their first MedAssist clinic visit. The dashboard, settings/family, prescriptions, appointments, lab results, vital signs, immunizations, medications, conditions, allergies, notes, and diary screens all render their empty states for this pre-first-visit user — no errors, no spinners stuck loading, just "no data yet" + the appropriate "we'll show this here after you visit a clinic" framing. Family/dependents flow works fully (the patient can register minor dependents pre-visit since dependents are guardian-bound, not clinic-bound — Phase G). On first clinic visit, frontdesk creates the `patients` + PCR + DPR rows (the clinic-presence triple, D-080), at which point the dashboard fills in with that visit's data and continues to fill in as the patient is seen at more clinics. The conversion from "canonical-only" to "canonical + has clinic presence at clinic X" is invisible to the patient — they just see their dashboard populate. Behind the scenes, the `patients.id` column is the foreign-key target for every clinical-event row (35 tables: appointments, prescriptions, lab orders, etc., per ARCHITECTURE.md §5.4), and a self-registered patient with no `patients` row has zero rows in any of these tables — that's why the empty-state UX is the correct UX.

**Network effect rationale (preserved from earlier framing):** Patient visits Dr. A (MedAssist) → gets digital records → visits Dr. B (not MedAssist) → shows records via privacy code → Dr. B sees value → Dr. B signs up. This is how you beat Vezeeta without spending millions on marketing.

## Three Adoption Hooks (The Combined Pitch)

"MedAssist بيخليك تكتب الروشتة أسرع من القلم، وبينبهك لو في تعارض بين الأدوية، ومفيش صيدلي هيتصل يسأل عن الخط."

("MedAssist lets you write prescriptions faster than pen, warns you about drug interactions, and no pharmacist will call asking about handwriting.")

### Hook 1: Speed Through Smart Chips (P0)
- 3-character drug autocomplete from Egyptian pharmacopeia
- Smart defaults: Select Augmentin → auto-fills 625mg, twice daily, 7 days, after food
- Learning doctor's patterns: Dr. Ahmed always prescribes Augmentin 1g → show 1g first
- Target: <30 seconds for a 3-drug prescription (vs 30-45 seconds handwriting)

### Hook 2: Drug Interaction Warnings (P0)
- Rule-based, not ML — database of ~500 critical drug interactions
- Check new prescription against patient's current medications
- Zero extra work for doctor — warning just appears
- Liability protection angle: "the system warned me"
- Requires patient medication history (captured through prescriptions — chicken-and-egg solved by first-visit medication intake)

### Hook 3: Pharmacy Callback Elimination (P0)
- Typed prescriptions are legible — pharmacists stop calling to clarify handwriting
- Real daily pain point for Egyptian doctors
- No extra work required — direct consequence of using digital prescriptions

**None of these hooks require extra work from the doctor. All solve real problems.**

## What NOT to Build in Phase 1

- Appointment scheduling (not the differentiator, WhatsApp/phone works fine)
- Complex encounter templates (adds friction)
- AI diagnosis (trust not established)
- Full EMR features (over-engineering)
- Multi-doctor complex permissions (optimized for 5-10% of market)
- Lab/pharmacy integration (Phase 3)

## Go-to-Market Strategy

### Pricing
- **Free tier:** Basic clinic management + limited prescriptions (20 patients/month)
- **Pro (200 EGP/month):** Unlimited patients, WhatsApp delivery, drug interaction warnings, reports
- **Clinic (400 EGP/month):** 2 doctors, 1 assistant, shared patients

Free removes one objection (money) but speed is what drives adoption. Free ≠ adoption — adoption is about workflow change cost.

### Sales Motion
1. Live demo at clinic (5 minutes) — show chip prescription is faster than pen
2. Risk-free 1-week trial — assistant uses it, if not faster than paper, remove it
3. First win = drug interaction warning caught within first week ("aha moment")

### Onboarding
- Train the assistant, not the doctor. If the assistant likes it, they advocate to the doctor.
- Doctor's workflow unchanged: examine patient → dictate → assistant taps chips → doctor glances at screen and confirms

### Milestones
- Week 1: Validate with 10 doctor interviews (7+ say "I'd use this")
- Week 2-3: Build MVP (2 weeks, not 2 months)
- Week 4: Get 5 paying customers (not beta users, not free trials — paying)
- Month 2-3: Iterate based on actual usage data
- Month 4: 100 clinics target or assess pivot
- Month 5-8: Patient engagement expansion (Phase 2) — appointment booking, lab notifications, chronic-condition tracking on top of the Phase 1 patient-app foundation

## Phased Expansion

### Phase 1: Clinic Adoption + Patient Identity Foundation (Months 1-4)
Doctor portal with smart prescription UI, drug interactions, patient registration (phone-based global identity), basic encounter notes, PDF prescription generation. **Plus** (per D-072) the narrowed-scope patient mini-portal (PWA via WhatsApp link, OTP login) covering records read-only, consent UI (privacy code regenerate, share grant/revoke/extend, messaging consent), Rx PDFs, and basic messaging — load-bearing for the directional consent model (D-068).

### Phase 2: Patient Engagement Expansion (Months 5-8)
Cross-doctor record visibility surfaces, follow-up booking from the patient side, lab-result push notifications, chronic-condition tracking, fuller engagement features layered on the Phase 1 patient-app foundation.

### Phase 3: Lab & Pharmacy Integration (Months 9-14)
Lab: Doctor creates order → patient receives on WhatsApp with QR → partner lab processes → results sent to MedAssist → doctor notified → patient receives results. Revenue: labs pay per referral (10-20 EGP/test) or monthly subscription.
Pharmacy: Digital prescription → patient sees partner pharmacy options → delivery via WhatsApp → pharmacy pays commission.

### Phase 4: Service Network (Year 2+)
Cross-doctor referrals, insurance integration (digital claims), government reporting readiness, national health ID alignment.

### Phase 5: Ecosystem (Year 3+)
Insurance claims processing, government health analytics, population health reporting.

## AI Strategy

AI is NOT abandoned — it's phased carefully:

- **Phase 1:** Drug interaction warnings (rule-based, zero cost, P0), drug name autocomplete (local DB, zero cost, P0)
- **Month 4:** Voice-to-prescription as optional feature for solo doctors in quiet offices (Whisper API, ~$2/month per doctor) — environment-dependent, not universal
- **Month 6+:** Smart prescription suggestions based on doctor's patterns
- **Year 2+:** AI-assisted diagnosis support (only after trust is established with existing features)

Voice-to-text limitations in Egyptian clinics: 60dB+ ambient noise, frequent interruptions, Egyptian dialect variations for drug names, privacy awkwardness with patient present. It works in quiet private offices but not in typical busy clinics. Chip UI is the reliable path.

## Critical Dependencies

### Egyptian Drug Database (P0 — 2-4 weeks to compile)
- Every drug available in Egyptian pharmacies
- Every brand name (Augmentin, Clavimox, Megamox = same active ingredient)
- Every available strength with common dosage frequencies
- Arabic and English names
- Drug interaction data (~500 critical interactions)
- This database is valuable IP and a competitive advantage

### WhatsApp Business API
- Providers: 360dialog, Twilio, or WATI
- Cost: ~$50-100/month for 1000 messages, scales from there
- Required for prescription delivery to patients and patient portal links

## Success Metrics

**Daily:** Prescriptions created (growth), active clinics (growth), interaction warnings shown (track), app crashes (target: 0)

**Weekly:** New clinic signups (target: 5+), activation rate >20 Rx in 7 days (target: >60%), churned clinics (target: <5%)

**Monthly:** Total active clinics (growth), total patient records (growth), paid conversion rate (target: >15%), cost per acquisition (target: <2000 EGP), LTV:CAC ratio (target: >3:1)

---

## Open Product Decisions

> Decisions that need Mo's call before engineering can proceed. Added 22 April 2026.

#### OPD-004: Cross-clinic patient identity merging

**Added**: 26 April 2026 — surfaced during phone-change flow development (D-051, D-053).

**Context**: When a phone change commits, `change_phone_commit` propagates the new phone to `patients.phone` rows across clinics — but only where the phone exactly matches the OLD phone. If the same physical patient is registered under different phone numbers in different clinics (personal vs. work number, typo in one clinic, etc.), those rows are NOT linked and NOT updated. There is currently no mechanism to recognize that two patient rows in different clinics represent the same physical person.

**Why this matters**: The patient mini-portal (Phase 2) needs a unified health timeline across all doctors. That requires a global patient identity — linking patient rows across clinics into a single longitudinal record. Without identity merging, a patient visiting 3 doctors sees 3 disconnected records.

**Options**:
1. **Phone-based auto-merge**: Assume same phone = same patient. Simple but fragile (shared family phones, changed numbers, typos).
2. **Patient-initiated merge via QR/link**: Patient logs into mini-portal, sees records from each clinic separately, and explicitly confirms "these are all me." Safest — patient consents to the merge. Requires the patient app.
3. **NID-based merge**: Use national ID as the canonical key. Most accurate but requires collecting NID (privacy/trust barrier) and government ID validation infrastructure.

**Recommendation**: Option 2 (patient-initiated merge) as the default, with phone-match as a suggestion heuristic ("we found records at these clinics — are these yours?"). Defer to Phase 2 patient-app feature. See D-053.

**Status**: Open — deferred to Phase 2 (patient mini-portal). No engineering work needed until 50+ clinics are active.

### Resolved

#### OPD-003: NULL `clinic_id` backfill strategy for legacy clinical_notes

**Resolved**: 25 April 2026 — **Backfill executed via migrations 045-051.** 56 orphan `clinical_notes` rows and 9 orphan `payments` rows backfilled. 19 additional tables that were missing `clinic_id` entirely (mig 019/026 never applied to live) now have the column with `NOT NULL` constraint. Save-path tightened in 5 handler files. `clinic_memberships` is now authoritative across all 21 tenant-scoped tables. See D-041.

#### OPD-001: "زيارة" (visit) vs "جلسة" (session) — what does analytics count?

**Resolved**: 22 April 2026 — **Option 1 selected.** Analytics visit counts now read from `clinical_notes` to match the profile page. Revenue/income numbers read from `payments` separately. Implemented as dual-source model in `computeIncomeStats()`. See D-036.

#### OPD-002: Analytics scope — per-doctor or per-doctor-per-clinic?

**Resolved**: 22 April 2026 — **Option 1 selected.** Analytics scoped to active `clinic_id`, consistent with the rest of the app. Exception: session-timing KPIs from `analytics_events` remain doctor-scoped (table lacks `clinic_id` column). An "all clinics" toggle (option 3) may be added later as a progressive enhancement. See D-034.
