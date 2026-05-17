# B07 Phase K-2e — Messages-Conversation Investigation

**Date:** 2026-05-15
**Cowork session:** Phase K-completion prompt, Bundle 4
**Trigger:** Finding I-4 (Phase I.A) — A2-9 messages-conversation flow deferred during Mo's A1+A2 walkthrough; cowork to surface findings without code changes (unless typo-only).

## Executive summary

The current messages + conversations schema and handlers are **compatible with the A2 delegation flow as designed**. No blocking-production findings surfaced. Two nice-to-have UX gaps and three documentation gaps catalogued. No code changes in this commit; one trivial typo / inconsistency surfaced but is debatable and noted for Mo's call.

**Classification:**
- **Works as designed:** core A2 flow (delegation grants `consent_to_messaging` → son acts on father's behalf → conversation FKs to father, sender_id = son's auth.users.id, audit trail preserves both)
- **Nice-to-have-pre-launch:** 2 findings (delegate-attribution UX on doctor side; conversations.clinic_id resolution path)
- **Future / documentation only:** 3 findings (no MESSAGE_SENT audit action; `messages.read_at` semantics around delegate-read; minor schema observations)
- **Blocking-production:** 0 findings

## Schema (verified against staging `mtmdotixlhwksyoordbl` 2026-05-15)

### `public.conversations`

| Column | Type | NULL | Notes |
|---|---|---|---|
| id | uuid | NO | PK, `uuid_generate_v4()` default |
| patient_id | uuid | **NO** | FK → `patients.id` (clinic-presence scoped) |
| doctor_id | uuid | **NO** | FK → `doctors.id` |
| clinic_id | uuid | **NO** | FK → `clinics.id` (TD-005 multi-tenant — every conversation is clinic-scoped) |
| created_from_appointment_id | uuid | YES | FK → `appointments.id` (nullable; conversations can originate organically) |
| status | text | YES | default `'active'`; informal — no CHECK constraint |
| blocked_by | uuid | YES | FK shape unclear from staging probe; per handlers, holds doctor's `auth.users.id` when doctor blocks the conversation |
| blocked_at | tstz | YES | set when `blocked_by IS NOT NULL` |
| last_message_at | tstz | YES | denormalized; updated on every message insert |
| patient_unread_count | int | YES (default 0) | denormalized; updated by handlers |
| doctor_unread_count | int | YES (default 0) | denormalized; updated by handlers |
| created_at | tstz | YES (default now()) | |
| updated_at | tstz | YES (default now()) | |

### `public.messages`

| Column | Type | NULL | Notes |
|---|---|---|---|
| id | uuid | NO | PK, `uuid_generate_v4()` default |
| conversation_id | uuid | **NO** | FK → `conversations.id` |
| sender_id | uuid | **NO** | **The ACTING user's `auth.users.id`** — NOT the subject. For A2 delegate sending on father's behalf, this is the son's id. |
| sender_type | text | **NO** | `'patient'` or `'doctor'`. Identifies the SIDE; the specific human is `sender_id`. |
| content | text | NO | message body |
| attachments | text[] | YES (default `'{}'`) | |
| read_at | tstz | YES | set when the OTHER side reads |
| sent_at | tstz | YES (default now()) | |
| created_at | tstz | YES (default now()) | |
| clinic_id | uuid | **NO** | FK → `clinics.id`; redundant with conversation's clinic_id but materialized for query convenience |

### FK chain (verified)

```
conversations.patient_id      → patients.id
conversations.doctor_id       → doctors.id
conversations.clinic_id       → clinics.id
conversations.created_from_appointment_id → appointments.id

messages.conversation_id      → conversations.id
messages.clinic_id            → clinics.id
```

`messages.sender_id` has **no FK constraint** on staging (verified) — it's a free-form UUID expected to point at `auth.users.id`. Defensive: the value is set by handlers from `requireApiRole().id`, so it's always a valid auth user; lack of FK is performance-driven rather than data-integrity-loose.

## Handler trace — A2 flow (son acts as father's delegate)

### Step 1 — Son logs in, switches active context to father
Mechanism: `?as=<father's gp.id>` query param threaded by `useApiPath()` (Phase F.5). Resolved server-side by `resolvePatientContext()` which returns `{ resolvedPatientId, basis, gpId, delegationId, isMinor }`. For an adult cross-context delegation, `resolvedPatientId = gp.claimed_user_id` per the legacy `patients.id === auth.users.id` 1:1 convention (Phase F.5 Decision 3).

**Post-K-2c interaction:** If father is self-registered and has NEVER visited a clinic, he has NO `patients` row. `conversations.patient_id` FKs to `patients.id`, so `conversations` is empty for father. `ensurePatientVisitedDoctor()` will also fail. **Result: messaging is implicitly gated on first-clinic-visit** for any patient — son cannot message a doctor on father's behalf until father has visited that doctor. Semantically correct (you can't message a doctor you haven't seen).

### Step 2 — Son opens messages with Dr. X
`GET /api/patient/messages?doctorId=<X>&as=<father>` (with `?as=` in URL). Handler flow:
1. `requireApiRole('patient')` → son authenticated as patient
2. `resolvePatientContext()` → `{ resolvedPatientId: father.auth.users.id, basis: 'delegated_by_principal', gpId: father.gpId, delegationId: <active grant> }`
3. `ensurePatientVisitedDoctor(doctorId, resolvedPatientId)` checks father has visit history with Dr. X (correct — visit check against father's history, son's own visits irrelevant)
4. Query `conversations.where({ doctor_id: X, patient_id: father.id }).maybeSingle()` → returns father+X conversation (if exists)
5. Query `messages.where({ conversation_id })` → returns all messages
6. Mark all doctor-sent messages as read, reset father's unread count

**Authorization model:** `resolvePatientContext()` default uses `requireAuthorityOver(gpId, userId)` which verifies son has an active delegation row covering father's gp. **No capability gate on GET** — read access is implicit in the delegation.

**Finding K-2e-1 (nice-to-have UX):** Marking messages as read on the GET side uses `son's auth.users.id`-driven read. The DB only records `read_at` timestamp; it doesn't record WHO read (no `read_by` column). So the audit trail can't distinguish "father read this himself" from "son read this on father's behalf." For HIPAA-equivalent (Egyptian PDPL) compliance this might matter eventually — patient data was accessed, by whom is a load-bearing fact for accounting-of-disclosures. Current schema doesn't capture it. Recommendation: defer to a future hardening pass; not blocking MVP.

### Step 3 — Son sends a message on father's behalf
`POST /api/patient/messages?as=<father>` with body `{ doctor_id, content }`. Handler flow:
1. `requireApiRole('patient')` → son authenticated as patient
2. `resolvePatientContext()` with `authorize: (gpId, uid) => requireCapability(gpId, 'consent_to_messaging', uid)` → THIS is the capability gate. Son's delegation MUST include `consent_to_messaging` in capabilities; otherwise throws `CapabilityError` → 403.
3. `getOrCreatePatientConversation({ doctorId, patientId: father.auth.users.id })` → returns conversation id (creates if needed; visit-based per `ensurePatientVisitedDoctor`)
4. `messages.insert({ conversation_id, sender_id: user.id, sender_type: 'patient', content })` — **`sender_id` is son's auth.users.id** (line 152 inline comment confirms intent: "actor is the calling user, not the subject")
5. Update `conversations.last_message_at`

**Finding K-2e-2 (nice-to-have UX — doctor side):** The doctor receiving the message sees `sender_type: 'patient'` and gets father's name in the conversation header (because conversation is keyed on father). The DB has `sender_id` = son's auth.users.id which encodes "son sent this on father's behalf," but the doctor-side UI doesn't render this attribution. Doctor sees a message from father, not "Message from father (sent by son on father's behalf)." Audit trail has it; user-facing UI doesn't. **Recommendation:** when delegate-context UI ships, surface `sender_id` lookup → user.full_name when ≠ father's name. Render small attribution badge. Defer to a Phase L UX polish pass.

### A2 capability requirement
Per Phase E delegation model (D-068), the delegate's grant must include `'consent_to_messaging'` capability for them to POST messages. The constant set lives in `packages/shared/lib/data/delegations.ts` `ALLOWED_DELEGATION_CAPABILITIES` and is enforced by the `no-unregistered-delegation-capability` eslint rule (D-008 pattern). Verified: capability is present in the allow-list; no gap.

**Conclusion for A2-9:** The flow works as designed. Father grants son `consent_to_messaging` capability via the delegation flow, son visits messages page with `?as=father`, son sends/reads messages on father's behalf. The conversation correctly belongs to father (patient_id = father), the audit trail correctly shows son as actor (sender_id = son, audit_events.actor_user_id = son, metadata.acting_as = `delegated_by_principal`, metadata.authority_grant_id = the delegation row).

## Findings

### K-2e-1 — No `read_by` column on `messages`
**Severity:** future / nice-to-have-PDPL  
**Type:** Schema observation  
**Detail:** `messages.read_at` records WHEN a message was read but not WHO did the reading. In the A2 delegation case, "son read this on father's behalf" vs "father read this himself" is indistinguishable in the data. PDPL accounting-of-disclosures may eventually require this granularity. Workaround today: emit an audit event on read (currently not done). Future option: add `read_by_user_id uuid REFERENCES auth.users(id)` column + emit `MESSAGE_READ` audit. Migration scope; deferred.

### K-2e-2 — Doctor-side UI lacks delegate attribution
**Severity:** nice-to-have-pre-launch (UX polish)  
**Type:** UI gap  
**Detail:** When son sends a message on father's behalf, the doctor sees `sender_type: 'patient'` and father's name in the conversation header. The DB has `messages.sender_id` (son's auth.users.id) which encodes the delegate context, but doctor-side UI doesn't render "sent by son" attribution. Audit trail is correct; UI surface is incomplete. **Fix scope:** doctor-side message-render component should LEFT JOIN `users` on `sender_id` to fetch `full_name`, then render a small "sent by <son>" badge when sender's full_name ≠ patient_id's gp display_name. Estimated diff: ~20 lines in `apps/clinic/app/(doctor)/doctor/messages/page.tsx` + the data-fetcher. Out of K-2e scope (investigation only); queue as a Phase L UX polish task or a B07 follow-up.

### K-2e-3 — No `MESSAGE_SENT` audit action
**Severity:** future / documentation  
**Type:** Audit-trail gap  
**Detail:** The `AuditAction` enum has `MESSAGING_CONSENT_RECONFIRMED` and `MESSAGING_CONSENT_REVOKED` but no per-message action. Every message insert is invisible to the audit pipeline; only the consent state changes audit. For an MVP that's acceptable (PHI in messages is the same severity as PHI in any other clinical row), but PDPL accounting requirements might want it eventually. **Recommendation:** defer to post-MVP. If we ever ship K-2e-1's `read_by` column, the same migration can add `MESSAGE_SENT` + `MESSAGE_READ` audit emitters.

### K-2e-4 — `conversations.clinic_id` resolution path is opaque
**Severity:** documentation gap  
**Type:** Architectural clarity  
**Detail:** `conversations.clinic_id` is `NOT NULL` (multi-tenant per TD-005 / D-041). The schema requires it set on every insert. The `getOrCreatePatientConversation` helper in `packages/shared/lib/data/messaging-consent.ts` is responsible for filling it. From the function name + signature `({ doctorId, patientId })`, it's not obvious where `clinic_id` comes from — presumably resolved from the doctor's primary clinic membership, or from the appointment context when `created_from_appointment_id` is set. **Recommendation:** add a doc-block to `getOrCreatePatientConversation` explaining the clinic_id resolution rule. Trivial; could be done in the K-2e commit if Mo wants the typo-class inline fix. Surfaced for the call, not silently applied.

### K-2e-5 — `messages.sender_id` lacks FK constraint
**Severity:** future / nice-to-have-hardening  
**Type:** Schema observation  
**Detail:** `messages.sender_id` is `NOT NULL` but has no FK to `auth.users(id)` (verified against staging FK metadata). The value is set by handler code from `requireApiRole().id`, so it's always valid in practice. Adding an FK would tighten the contract at the cost of a migration. **Recommendation:** consider for a future hardening pass; not blocking.

### K-2e-6 — Doctor-side block flow uses `blocked_by` without role context
**Severity:** observation  
**Type:** Schema observation  
**Detail:** `conversations.blocked_by` is a `uuid` (probably `auth.users.id` of whoever blocked). There's no column saying whether the blocker is the doctor or the patient — implicit from which side the API call came from. Currently only doctor-side block/unblock endpoints exist (`apps/clinic/app/api/doctor/messages/block/route.ts` + `unblock`). If the patient-side were ever to gain a "block this doctor" capability, the schema couldn't distinguish "patient blocked doctor" from "doctor blocked patient" without inference from the value of `blocked_by`. Currently a non-issue (patient doesn't have a block endpoint). **Recommendation:** if patient-side block ships in the future, add a `blocked_by_type` column or use `sender_type` semantics. Not blocking today.

### K-2e-7 — Post-K-2c interaction: self-registered patients can't message until first clinic visit
**Severity:** documented (D-084 + this investigation); confirms-as-designed  
**Type:** Architectural cross-reference  
**Detail:** D-084 (createPatientAccount drops `patients.insert`) means a brand-new self-registered patient has no `patients` row until first clinic visit. `conversations.patient_id` FKs to `patients.id`, so the conversation query in `GET /api/patient/messages` returns empty for them. `ensurePatientVisitedDoctor()` also fails (no clinical history). **This is the correct empty-state behavior** per D-084's documented contract — you can't message a doctor you haven't visited. The patient-app dashboard renders the empty state cleanly. No fix needed; documenting the cross-reference so future readers don't think it's a bug.

## Recommendations (no code in this commit)

For the messages-conversation surface specifically, A2-9 is functional as designed. Phase M can run the A2 walkthrough end-to-end against this code.

**For Phase L (deployment-readiness) consideration:**
- K-2e-2 (delegate attribution UX) is a nice-to-have UX polish. Could ship alongside the clinic-app L-1 deployment work or as a B07 follow-up commit if you want it visible at launch.

**For post-MVP / future hardening:**
- K-2e-1 + K-2e-3 (MESSAGE_READ / MESSAGE_SENT audit actions + read_by column) — defense-in-depth for PDPL accounting-of-disclosures.
- K-2e-5 (sender_id FK constraint) — schema tightening.
- K-2e-6 (blocked_by role context) — only relevant if patient-side block ever ships.

**Documentation candidate (could ship inline if Mo wants the typo-class):**
- K-2e-4: doc-block on `getOrCreatePatientConversation` explaining clinic_id resolution. Surfaced for the call.

## Cross-references

- `audits/b07-phase-i-execution-2026-05-12.md` Finding I-4 (the original deferral)
- `audits/b07-phase-j-review-2026-05-15.md` §2 K-2e (Mo's K-2e scope ratification — "investigation only, surface findings")
- `DECISIONS_LOG.md` D-068 (directional consent / `acting_as` audit metadata), D-084 (createPatientAccount K-2c — context for K-2e-7)
- `packages/shared/lib/api/handlers/patient/messages/handler.ts` (canonical patient-side message API)
- `packages/shared/lib/data/messaging-consent.ts` (effective_messaging_consent view + getOrCreatePatientConversation helper)
- `supabase/migrations/083_effective_messaging_consent_view.sql` (consent model)
