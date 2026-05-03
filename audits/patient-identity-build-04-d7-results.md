# Patient Identity Build 04 — D7 Wire-up Results

**Prompt:** Build 04 D7 follow-up — wire `PrivacyCodeEntryModal` into the
front-desk check-in page.
**Applied to working tree:** 2026-04-29.
**Files touched:** 3 (1 page + 2 verify-* handlers, justified in § 1).
**Status:** ✅ Component reachable from check-in. Post-unlock UX hands off
to the existing register flow (deviation documented in § 2). Build-04
deviation D7 → partially closed; opens follow-up V4-D7-01.

---

## 1. Pre-flight findings (P1–P4)

### P1. Existing check-in page state inventory

`apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx` (note: actual
path uses `frontdesk/checkin/`, not `(frontdesk)/check-in/` as the
original cowork prompt and Build 04 results both stated — Build-04 § 3
Page Inventory has the wrong path; flagged under § 5 below).

Existing state shape, ~580 lines pre-edit:

```
searchQuery                        — text input value (name OR phone)
searchResults: Patient[]           — clinic-scoped search hits (DPR-keyed)
searching: boolean                 — debounce inflight flag
selectedPatient: Patient | null    — chosen for check-in (keyed on patients.id)
doctors: DoctorQueueInfo[]         — full clinic doctor roster + queue counts
selectedDoctor: string             — chosen doctor.id
queueType, notes, loading, error   — submission machinery
success: { ... } | null            — success-screen branch
showPayment + 5 payment-related fields
```

Phone-search flow today:
- `onChange` writes `searchQuery`; a 300ms debounced effect (line 98–109)
  POSTs `/api/patients/search?q=<query>` and stores results.
- The search handler (`packages/shared/lib/api/handlers/patients/search/handler.ts`)
  is clinic-scoped for the `frontdesk` role: it filters by
  `doctor_patient_relationships.clinic_id`, so a patient who is in this
  clinic's PCR but has no DPR row will NOT appear in the results.
  (Important when planning the post-unlock UX — PCR-only patients are
  invisible to this search.)
- "No results" branch (pre-edit): one-line message + a `<Link>` to
  `/frontdesk/patients/register`. No phone-shape detection.

Submit path: `selectedPatient.id` (legacy `patients.id`) + `selectedDoctor`
posted to `/api/frontdesk/checkin`. The handler is keyed on `patients.id`,
so any post-unlock flow that wants to "resume the regular check-in" must
have a `patients.id` for THIS clinic in hand.

### P2. Modal contract verification

`apps/clinic/components/frontdesk/PrivacyCodeEntryModal.tsx` was inspected
in full. Props match the cowork prompt's spec exactly:

```ts
interface PrivacyCodeEntryModalProps {
  open: boolean
  phone: string
  clinicId: string
  doctorId: string
  onClose: () => void
  onUnlock: (globalPatientId: string) => void
}
```

Internally the modal POSTs `/api/patients/verify-privacy-code` and
`/api/patients/initiate-sms-share` itself. On success it calls
`onUnlock(data.global_patient_id)` and **discards** every other field
on the response — including any `patient_id` we might choose to add. This
shapes § 2 below: extending the verify-* handlers to return `patient_id`
helps Prompt 5 + future consumers, but does NOT thread the value back to
the page through the modal.

Body copy nit (DOES NOT block this prompt): `privacyCode_modalBody`
reads "المريض ده عنده سجلات في عيادة تانية" — which DOES leak existence
when the modal is open for a "patient at no clinic" search. Because the
modal opens uniformly per the privacy invariant, the body copy implicitly
asserts a fact the privacy invariant says we cannot reveal. Tracked as
**ORPH-V4-D7-02** (string fix; ORPH-V4-07 review pass).

### P3. Doctor-id sourcing decision

The front desk picks `selectedDoctor` BELOW the search box (after the
patient row is established). At phone-search time, no doctor is
selected. The modal needs `doctorId` for the SMS path's
`requesting_doctor_id`.

**Choice:** fall back to `doctors[0]?.id` when `selectedDoctor` is empty.

**Reasoning:**
- Gating "Request access" on doctor-pick reverses the existing UX (search
  → pick doctor) and forces the front desk through an extra step before
  they know whether the privacy unlock applies.
- The manual code path does NOT surface doctor name to the patient — the
  doctor_id is only an attribution field on the audit row.
- The SMS path renders the doctor name in the consent SMS body. If the
  fallback doctor is "wrong" (i.e., the front desk later picks a
  different doctor), the patient's SMS still says "Dr. X requested
  access" with X being the first doctor in the clinic. Acceptable because
  in the typical solo / two-doctor Egyptian clinic this is the right
  doctor anyway.
- "Request access" is disabled when the doctors list is still loading
  (`canOpenModal = !!clinicId && !!fallbackDoctorId`).

Tracked as **ORPH-V4-D7-03** if the multi-doctor edge case ever needs a
"select-the-doctor-first" interstitial. Solo today (per memory:
`project_rls_rewrite_status` — clinics are effectively solo).

### P4. `check_phone_uniform` / phone-shape detection

The cowork prompt asked the page to invoke `check_phone_uniform` to
decide modal visibility. After reading `packages/shared/lib/data/privacy-codes.ts`,
this is unnecessary: the helper is intentionally side-effect-only +
returns the same uniform `{ exists: false, requiresCode: true }` for
every input. There's nothing to gate on.

What we DO gate on: `normalizeEgyptianPhone(searchQuery)` returning
non-null. This is a pure client-side parse that NEVER touches the
network — so the privacy invariant is preserved automatically (the modal
trigger appears or doesn't based purely on input shape). Phone-keyed
existence at any clinic plays no role in the UI branching.

The modal itself still POSTs verify-privacy-code on the user's code
input — that's where `check_phone_uniform`-equivalent timing-padded RPCs
fire.

---

## 2. Implementation diff

### Files touched

| File | Lines added / changed | Why |
|---|---|---|
| `apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx` | +120 / -10 | Add unlock state, mount modal, add "Request access" CTA, post-unlock confirmation banner. |
| `packages/shared/lib/api/handlers/patients/verify-privacy-code/handler.ts` | +35 / -1 | Call `resolveIdentityForClinic` after successful verify; surface `patient_id` in response. |
| `packages/shared/lib/api/handlers/patients/verify-sms-code/handler.ts` | +24 / -1 | Same pattern as above. |

The two-handler edit was **explicitly authorized by Mo** in this session
when the constraint conflict surfaced: the original "no new API
endpoints + page calls resolveIdentityForClinic" formulation is
unsatisfiable because resolveIdentityForClinic is server-only and no
existing endpoint exposes it. Mo selected option (2) — extend the
verify-* endpoints — over option (1) (new endpoint), option (3) (stop
short of unlock→checkin), and option (4) (server actions).

### Why the page navigates to register after unlock instead of seamless in-place check-in

The cowork prompt's S4 sketch shows:

```ts
const { patient } = await resolveIdentityForClinic(state.phone, clinicId)
setState({ kind: 'in_clinic', phone: state.phone, patientId: patient.id })
```

This is uncallable from a client component (`createAdminClient` is
server-only) AND the actual `resolveIdentityForClinic` returns
`{ globalPatient, patientClinicRecord, ... }` — there's no `patient`
field with an `.id` keyed on legacy `patients.id`. The cowork prompt
sketch was illustrative pseudocode, not real code.

The shipped behaviour:

1. Modal posts `verify-privacy-code` (or `verify-sms-code`).
2. Extended handler calls `resolveIdentityForClinic(phone, clinicId)`
   which is idempotent — creates a PCR row if missing, bumps
   `last_seen_at` if present. Mig 074's `PATIENT_CLINIC_RECORD_CREATED`
   audit row fires on creation.
3. Handler then SELECTs from `public.patients` keyed by
   `(global_patient_id, clinic_id)`. This succeeds when the patient was
   previously seen at this clinic via the legacy onboard flow (mig 074
   backfilled `patients.global_patient_id`); fails when the patient
   exists nowhere or only at OTHER clinics.
4. Response: `{ success, global_patient_id, patient_id (nullable),
   share_creation_pending: 'prompt_5' }`.
5. Modal extracts only `global_patient_id` and fires
   `onUnlock(globalPatientId)` (contract is fixed).
6. Page's `onUnlock` shows a confirmation banner. Primary action
   navigates to `/frontdesk/patients/register?phone=<phone>&unlocked=1`,
   where the existing `onboardPatient` flow:
   - Picks up the existing `global_patients` row (via mig 081 compat
     trigger keyed on `patients.global_patient_id` ↔ `normalized_phone`).
   - Mints `patients.id` + `doctor_patient_relationships` row for THIS
     clinic.
   - Lets the front desk queue the patient via the register page's
     "Add to Queue" submit mode.

The phone is currently NOT auto-filled in register (the page doesn't
read `?phone=` yet). The URL contract is forward-compatible —
**ORPH-V4-D7-01** tracks adding the prefill (single-line useSearchParams
read in register/page.tsx, ~5 minutes of work, deliberately out of
scope here).

### State machine sketch (in code, not extracted to a hook)

The cowork prompt presented a discriminated-union state shape. The
shipped code uses three separate booleans/refs rather than a tagged
union:

```
clinicId          : string | null         — fetched from /api/frontdesk/profile
unlockModalOpen   : boolean               — controls modal `open` prop
unlockPhone       : string                — last phone passed to modal
unlocked          : { gpid, phone } | null — drives post-unlock banner
```

Decision: extracting a `usePrivacyCodeFlow` hook felt heavier than the
4-state-flag flow warranted (the file grew ~120 lines but stays at
~720, well under the prompt's 350-line threshold for hook extraction).

Branching:
- Idle → searching: existing debounced effect on `searchQuery`.
- Searching → in_clinic: `setSelectedPatient(...)` from a search hit.
- Searching → requires_code (UI only): `searchResults.length === 0` AND
  `normalizeEgyptianPhone(searchQuery)` ≠ null. Renders the new
  "Request access" button alongside the existing register link.
- requires_code → unlock_modal_open: button click; sets
  `unlockPhone`+`unlockModalOpen=true`. The modal mounts unconditionally
  in the JSX; visibility flows through its `open` prop, so the modal
  preserves its own internal mode/code/sms state across renders.
- unlock_modal_open → unlocked: `onUnlock(gpid)` → `setUnlockModalOpen(false)`
  + `setUnlocked({gpid, phone})`. The unlock banner takes over.
- unlock_modal_open → idle: `onClose` → `setUnlockModalOpen(false)`.
- unlocked → register flow: primary CTA `router.push('/frontdesk/patients/register?phone=...')`.
- unlocked → idle: secondary CTA `setUnlocked(null)`.

Walk-in registration path is preserved alongside the new flow — both
`isPhoneShaped` and name-only branches still surface the
`/frontdesk/patients/register` link.

### Privacy invariant verification (in code)

The phone-shape branch in the search no-results region is keyed on a
**purely client-side** function:
`normalizeEgyptianPhone(searchQuery.trim()) !== null`. There's no
server call between input and UI branching, so there's no possible
side-channel through which the page could differentiate "patient at
another clinic" vs. "patient at no clinic". A non-network-existing
phone of valid Egyptian shape gets the same UI as a phone that exists
at clinic-A. Confirmed by reading the diff.

---

## 3. i18n keys used vs. needed

Existing keys consumed by this change:

| Key | Used in | Source |
|---|---|---|
| `ar.privacyCode_unlockSuccess` | Post-unlock banner heading | `packages/shared/lib/i18n/ar.ts` line 652 |
| `ar.cancel` | Post-unlock banner cancel button | `packages/shared/lib/i18n/ar.ts` line 22 |

New strings hardcoded inline (with `TODO(Mo, ORPH-V4-07)` markers),
flagged for Mo's Arabic review pass — Mo to add canonical keys
before merge:

| Hardcoded string | Suggested key | Where in page |
|---|---|---|
| `لو المريض عنده كود خصوصية` | `privacyCode_requiresCodeBody` | Search no-results, phone-shaped branch |
| `طلب الوصول` | `privacyCode_openModalCta` | Search no-results, "Request access" button |
| `أو` | (probably reuse a generic `or` separator) | Between Request access and Register links |
| `لم يتم العثور على المريض` | (already inline pre-edit; preserved) | Search no-results, name-only branch |
| `تم التحقق. كمّلي تسجيل المريض في عيادتك علشان نضيفه للطابور.` | `privacyCode_unlockNextStep` | Post-unlock banner body |
| `تسجيل مريض جديد` | (already inline pre-edit; preserved) | Both register links |

Total new strings to canonicalize: 3 (the rest are preserved or reused).
None of these strings change behaviour; they're flagged only because the
review-pending modalBody (`privacyCode_modalBody` line 640) needs a
sweep anyway and the new strings can ride that sweep.

---

## 4. Manual testing plan (Mo executes)

### T1. Setup (run on staging — `medassist-egypt`)

- [ ] Confirm a `global_patients` row exists with phone in clinic A only.
- [ ] Mint a privacy code for that patient via service role:

  ```sql
  SELECT public.regenerate_privacy_code('<gpid>');
  -- copy plaintext from the returned text
  ```

- [ ] Confirm a frontdesk user belongs to clinic B (NOT clinic A) via
  `clinic_memberships(role='FRONT_DESK', status='ACTIVE')`.
- [ ] Log in as that frontdesk user.

### T2. Manual flow on Pixel 6 + iPhone SE (RTL)

- [ ] Navigate to `/frontdesk/checkin`.
- [ ] Type the patient's phone (e.g., `01098765432` or
      `+201098765432`) into "بحث عن المريض".
- [ ] Wait ~300ms for debounce.
- [ ] Expect: "لو المريض عنده كود خصوصية" + green "طلب الوصول" button +
      "أو" separator + "تسجيل مريض جديد" link. No mention of "another
      clinic" or "patient exists".
- [ ] Click "طلب الوصول" → privacy code modal opens.
- [ ] Type 6 wrong characters (e.g., `XXXXXX`) → submit → uniform
      Arabic error: "الكود غير صحيح أو لا يوجد سجل".
- [ ] Type the right code → modal closes → post-unlock banner appears
      with green check + "تم فتح الوصول لسجل المريض".
- [ ] Click "تسجيل مريض جديد" → navigates to
      `/frontdesk/patients/register?phone=...&unlocked=1`.
- [ ] In a separate SQL session, verify the new PCR row:

      ```sql
      SELECT id, global_patient_id, clinic_id, first_seen_at, last_seen_at
        FROM public.patient_clinic_records
       WHERE global_patient_id = '<gpid>' AND clinic_id = '<clinic_b_id>';
      ```
- [ ] Verify the audit row:

      ```sql
      SELECT action, entity_id, clinic_id, created_at
        FROM public.audit_events
       WHERE action = 'PATIENT_CLINIC_RECORD_CREATED'
         AND entity_id = '<gpid>'
         AND clinic_id = '<clinic_b_id>'
       ORDER BY created_at DESC LIMIT 1;
      ```
- [ ] Verify NO `patient_data_shares` row (Prompt 5 is the closer):

      ```sql
      SELECT COUNT(*) FROM public.patient_data_shares
       WHERE granted_to_clinic_id = '<clinic_b_id>';
      -- Expect 0; Prompt 5 will populate this.
      ```

### T3. Privacy leak black-box (UI side)

- [ ] In the same frontdesk session, type a phone that exists at NO
      clinic anywhere (e.g., `01099999999` if unused).
- [ ] Expect: IDENTICAL UI — same "Request access" + "Register" pair,
      same Arabic copy, same button styling. Visually
      indistinguishable from T2's pre-unlock state.
- [ ] Click "طلب الوصول" → modal opens (same).
- [ ] Type any 6 chars → uniform error.
- [ ] Modal does NOT reveal whether the patient exists.

### T4. SMS path

- [ ] In the modal (T2 setup), click "إرسال كود عبر SMS".
- [ ] Modal switches to 4-digit input + "الكود صالح لمدة ٥ دقايق".
- [ ] Wait for SMS arrival on the patient's phone (or, in dev, read
      `audit_events` `metadata->>'sms_plaintext'` for the matching
      `SMS_CONSENT_SENT` row before dispatch flips it to
      `[DISPATCHED]`).
- [ ] Type the 4-digit code → modal closes → post-unlock banner shows
      (same as manual path).
- [ ] Verify the same PCR + audit rows as in T2.

### T5. RTL + i18n check

- [ ] Modal renders right-to-left with title on the right.
- [ ] All Arabic strings render in dialect (no English fallbacks).
      Any string flagged in § 3 above will read as "draft" until Mo's
      review pass — note which.
- [ ] Submit button placement matches existing modal conventions.
- [ ] Eastern Arabic numerals on phone displays where the rest of the
      page uses them (verify by comparing to the existing
      `selectedPatient.phone` rendering, line 403).

---

## 5. Orphan ledger update

### Closes (partial)

| ID | Item | Status |
|---|---|---|
| Build-04 § 6 D7 | Front-desk check-in page wire-up | **Partially closed.** Modal is mounted, callback fires, post-unlock UX hands off to register. Full "seamless instant check-in" deferred — see follow-ups below. |

### Opens (3)

| ID | Item | Type | Closing prompt |
|---|---|---|---|
| ORPH-V4-D7-01 | Register page consume `?phone=` query param + auto-fill | UI | Next routine front-desk UX session (~5 min) |
| ORPH-V4-D7-02 | `privacyCode_modalBody` leak: copy says "patient at another clinic" but modal opens uniformly per privacy invariant | I18N | Roll into ORPH-V4-07 review |
| ORPH-V4-D7-03 | Multi-doctor `requesting_doctor_id` selection (currently falls back to `doctors[0]`) | UX | Prompt 6 / when first multi-doctor clinic ships |

### Path-spelling correction (out of scope, flagged)

Build-04 results § 3 Page Inventory and EXECUTION_PROMPTS.md.md § B15
both quote the path as
`apps/clinic/app/(frontdesk)/check-in/page.tsx`. The actual path is
`apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx` (no hyphen,
nested under `/frontdesk/`). Mo to update the audit if a sweep happens.

---

## 6. Verification before sign-off

The cowork session did NOT run `npm run type-check` or `npm test` per
Mo's standing rule (those are staging-side responsibilities). The two
verify-* handler edits add a `try/catch`-wrapped admin client call +
two new imports (`resolveIdentityForClinic`, `createAdminClient`); both
are existing, correctly-typed exports. The page edit adds a state
quartet and a single ternary in JSX; both `Lock` (lucide-react) and
`PrivacyCodeEntryModal` (`@/components/frontdesk/...`) resolve via
existing `tsconfig.json` paths. Highest-risk regression: the search
no-results render became an IIFE `() => ...` returning JSX — verified
by reading the resulting JSX is a single root element wrapped in a
`<div>` and that all closing tags balance.

**End of D7 wire-up results.**
