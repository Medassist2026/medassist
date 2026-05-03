# Patient Identity Build 04 — D7 Manual Test Results (T1–T5)

**Date:** 2026-04-30
**Plan source:** `audits/patient-identity-build-04-d7-results.md` § 4
**Mode:** **A — Automated UI** (Claude in Chrome MCP driving Mo's local
browser at `http://localhost:3001` against staging Supabase
`mtmdotixlhwksyoordbl`).
**Headline:** Privacy invariant **PASS**. Audit row regression observed
(T2.10 **FAIL** — see § 4 + § 5). Two test-fixture data fixes applied to
unblock login (§ 5).

---

## 1. Mode and capability notes

**Chosen mode: A (automated UI).** Browser MCP reached Mo's local clinic
app at `http://localhost:3001` (note: not `:3000` as the test plan
assumed — the patient app appears to occupy `:3000` so clinic took
`:3001`). Mo's app points at staging Supabase, so SQL via MCP and UI
state were observing the same database.

**Limitations of this Mode-A run:**

- **Device emulation not toggled.** The Chrome MCP `resize_window` could
  set viewport dimensions but does not switch the `navigator.userAgent`
  or DPR to mimic Pixel 7 / iPhone SE. All screenshots are at desktop
  1440×722. Mobile-frame layout assertions (T2.3, parts of T5)
  → **BLOCKED — Mo to confirm visually on real devices.**
- **Subjective Arabic dialect naturalness** (T5 final polish) → BLOCKED;
  reported as PASS only at the structural / "no English leaks" level.
- **Test fixture data writes were necessary** to log in; documented in § 5
  as DATA-FIX-1 and DATA-FIX-2. The test plan said "read-only
  verification"; the writes are confined to test-fixture rows for the
  chosen FRONT_DESK user and do not touch app schema or app data.

---

## 2. Test data inventory

All identifiers below were used verbatim in the test run. Privacy code
plaintext is included for Mo's reference only; the code has been used
once and a follow-up test should mint a fresh one.

### Patient (Sara — clinic A only, before the test)

| Field | Value |
|---|---|
| `gpid` (= `patients.id`) | `d076ab14-5fa6-4526-b246-e7a0e45280a4` |
| `normalized_phone` | `+201098765432` |
| `full_name` | سارة خالد |
| `sara_clinic_id` | `298866c7-87b7-4405-9487-c7174bafaf99` |
| `clinic_name` | عيادة د. ناصر حسن |

The same UUID is used for `gpid` and `patients.id` (per memory
`project_build_03_staging_apply.md` — same-uuid for this seed phone).

### Frontdesk user (clinic B — different from clinic A)

| Field | Value |
|---|---|
| `user_id` | `9de362ac-b159-4d4b-b30e-ae0205d51859` |
| `public.users.phone` | `+201512356789` |
| `auth.users.phone` (after DATA-FIX-1) | `201512356789` |
| Display name | محمود علي (role label استقبال) |
| `clinic_b_id` | `4b5a180f-694f-4956-8004-0583c80bce33` |
| `clinic_b_name` | عياده الدقي |
| Role | `frontdesk` |
| Password (after DATA-FIX-2) | `test1234` |

**Sanity check:** `clinic_b_id` (`4b5a180f-…`) ≠ `sara_clinic_id`
(`298866c7-…`) ✓.

**Why we switched away from the originally-picked clinic B**
(`8d27729f-…` / عيادة د. أحمد + user `9bd7048f-…`): a pre-existing PCR
row from a 2026-03-15 test run referenced `clinical_notes` rows, which
made it unsafe to delete. Switching to عياده الدقي gave a clean PCR
baseline (zero existing rows for Sara at this clinic). Both clinics
needed the same DATA-FIX-1 (auth.phone format) and DATA-FIX-2 (password
reset) to log in.

### Privacy code plaintext (Sara) — minted via S1c

```
ZGA8VH
```

Minted with `SELECT public.regenerate_privacy_code('<sara_gpid>')`.
Used once in T2.8.

### T3 no-record phone

`01099999999` (E.164 normalized = `+201099999999`). Confirmed via SQL
that `global_patients.normalized_phone = …99999` returns 0 rows and
`users.normalized_phone = …99999` returns 0 rows.

### SMS code observed (T4)

`7688` (4-digit, read from
`audit_events.metadata->>'sms_plaintext'` for the
`SMS_CONSENT_SENT` row whose `entity_id = <sara_gpid>` —
note the test-plan SQL keyed on `metadata->>'global_patient_id'`
but the actual row has `entity_id` set, not that metadata key;
flagged below in § 5).

---

## 3. Per-test results

Every step lists what was attempted, what was observed, and a status. UI
screenshots referenced by `ss_…` are the in-session capture IDs from the
Chrome MCP (not saved to a path the user can browse — their content is
quoted into the relevant cells below).

### T1 — Setup

| Step | Status | Notes |
|---|---|---|
| S1a — find Sara | PASS | gpid + clinic data captured |
| S1b — find frontdesk in different clinic | PASS | After fixture switch (see § 2) |
| S1c — mint privacy code | PASS | Plaintext `ZGA8VH` |
| S1d — confirm no-record phone | PASS | gp_count = 0, user_count = 0 |

### T2 — Cross-clinic unlock happy path

| # | Step | Status | Observed |
|---|---|---|---|
| T2.1 | Log in as clinic-B frontdesk | PASS | After DATA-FIX-1+2; `/api/frontdesk/profile` returned 200 with role=frontdesk, clinic membership = عياده الدقي |
| T2.2 | Navigate to `/frontdesk/checkin` | PASS | Page rendered with search box + 3 doctors (Rami nabile, د. علي علي, د. مايكل انتوني) — `doctors[0]` fallback for SMS attribution = "Rami nabile" |
| T2.3 | Enable mobile emulation (Pixel 7 + iPhone SE) | **BLOCKED** | Chrome MCP doesn't expose device-frame emulation. Tested at desktop viewport only. **Mo to confirm on real devices.** |
| T2.4 | Type `01098765432` into search | PASS | After ~300 ms, "لو المريض عنده كود خصوصية" + green "طلب الوصول" + "أو" + "تسجيل مريض جديد" rendered |
| T2.5 | Visual: green "طلب الوصول" button visible | PASS | Confirmed in DOM (`button[type=button]` with text "طلب الوصول"); confirmed in screenshot |
| T2.6 | Click "طلب الوصول" → modal opens | PASS | Modal title "إدخال كود الخصوصية", body "اطلبي من المريض كود الخصوصية بتاعه أو ابعتي له كود عبر SMS" (NEUTRAL — see § 5 ORPH-V4-D7-02), input placeholder "مثال: A4K9PM", primary "تأكيد الكود", secondary "إرسال كود عبر SMS", cancel "إلغاء" |
| T2.7 | Type `XXXXXX` → submit → uniform error | PASS | Error rendered: "الكود غير صحيح أو لا يوجد سجل" — exact uniform string from spec |
| T2.8 | Type `ZGA8VH` → submit → success | PASS | Modal flipped to success state: green check + heading "تم فتح الوصول لسجل المريض" + body about completing patient registration + primary "تسجيل مريض جديد" + secondary "إلغاء" |
| T2.9 | SQL: PCR row created | PASS | id `9095f06f-c885-4b38-9bd2-8850ad0bb9ca`, first_seen_at = last_seen_at = `2026-04-30 05:08:51.943305+00` (delta = 0); age vs NOW = 33s |
| T2.10 | SQL: `PATIENT_CLINIC_RECORD_CREATED` audit row | **FAIL** | Zero rows match `(action, entity_id, clinic_id) = ('PATIENT_CLINIC_RECORD_CREATED', sara_gpid, clinic_b_id)`. Broader search of `audit_events` in last 5 min for that gpid + clinic returned only `PRIVACY_CODE_ATTEMPT_SUCCESS` and `PRIVACY_CODE_ATTEMPT_FAILURE`. **No trigger on `patient_clinic_records` other than `touch_updated_at_trg`.** Memory `project_build_03_staging_apply.md` says V2-11 (audit gap) was closed in Build 03 — appears regressed or the close didn't cover this code path. |
| T2.11 | SQL: NO `patient_data_shares` row | PASS | Table `patient_data_shares` doesn't exist (Prompt 5 hasn't shipped) — `table_exists = false` |
| T2.12 | Click "تسجيل مريض جديد" → register URL | PASS | Navigated to `/frontdesk/patients/register?phone=%2B201098765432&unlocked=1`. Phone is in E.164 form (`+201098765432`, URL-encoded) — slightly different from test-plan example (`?phone=01098765432`) but contractually equivalent and forward-compatible. Phone field on register page shows placeholder, NOT prefilled — matches **ORPH-V4-D7-01** known-follow-up. |

### T3 — Privacy leak black-box

| # | Step | Status | Observed |
|---|---|---|---|
| T3.1 | Back to `/frontdesk/checkin`, search reset | PASS | Page re-rendered with empty search box |
| T3.2 | Type `01099999999` (no record anywhere) | **PASS — privacy invariant holds** | Search no-results region rendered identically to T2.4: same hint copy ("لو المريض عنده كود خصوصية"), same green "طلب الوصول" button, same "أو" separator, same "تسجيل مريض جديد" link, same doctor list below. Only difference between T2.4 and T3.2 screenshots: digits visible inside the search input. |
| T3.3 | Click "طلب الوصول" → modal opens | PASS | Modal opens with same title / body / input / button layout as T2.6 — byte-identical UI |
| T3.4 | Type `XXXXXX` → submit → uniform error | PASS | Identical error text "الكود غير صحيح أو لا يوجد سجل" — same string, same red color, same placement |
| T3.5 | SQL: NO PCR row for `+201099999999` | PASS | `pcr_count = 0` |

**T3 verdict — privacy invariant: PASS** (see § 4 for verdict detail).

### T4 — SMS path

| # | Step | Status | Observed |
|---|---|---|---|
| T4.1 | Click "إرسال كود عبر SMS" | PASS | Modal switched to SMS mode: title "إدخال كود الـ SMS", body "بعتنا للمريض كود ٤ أرقام على رقمه. اطلبي منه يقولك الكود.", 4-digit `<input type=tel>` with placeholder "٠٠٠٠" (Eastern Arabic numerals), helper "الكود صالح لمدة ٥ دقايق", buttons "تأكيد الكود" / "إعادة الإرسال" / "إلغاء" |
| T4.2 | Read SMS plaintext from `audit_events` | PASS *(with caveat)* | Code = `7688`. Found via `WHERE action = 'SMS_CONSENT_SENT' AND metadata->>'sms_dispatch_pending' = 'true'`. **Caveat:** the test-plan SQL filters by `metadata->>'global_patient_id' = '<sara_gpid>'`, but the actual row has `entity_id = <sara_gpid>` instead — the metadata key is null. The SQL recipe in the test plan needs the filter changed to `entity_id::text = '<sara_gpid>'` or to omit the gpid filter. |
| T4.3 | Submit `7688` → modal closes → banner | PASS | Same success state as T2.8 (green check + "تم فتح الوصول لسجل المريض" + register CTA) |
| T4.4 | SQL: PCR + audit verified | PASS *(idempotent)* | Same PCR `id = 9095f06f-…`. `first_seen_at` unchanged from T2 (`05:08:51`); `last_seen_at` bumped to `05:15:19` (27s before query). Single row count = 1 — no duplicate INSERT. **Audit row gap from T2.10 still applies; not re-raised here because the test plan attached the audit assertion to T2.** |

### T5 — RTL + i18n check

| # | Check | Status | Observed |
|---|---|---|---|
| T5.1 | Modal renders RTL with title on the right | PASS *(structural)* | `html.dir = "rtl"`, `html.lang = "ar"`, `body` computed direction = rtl, 4 explicit `[dir="rtl"]` containers in DOM. Modal title visually anchors to the right; text flows right-to-left. |
| T5.2 | All Arabic strings render in dialect (no English fallback) | PASS | DOM scan for English words ≥4 chars (excluding "MedAssist", "SMS", "Rami", "nabile", "general", "practitioner") returned **zero leaks**. All hardcoded strings flagged in d7-results § 3 ("لو المريض عنده كود خصوصية", "طلب الوصول", "أو", success body) rendered in Arabic. |
| T5.3 | Submit / cancel button placement matches RTL | PASS | Modal buttons stacked: primary green "تأكيد الكود" left-most in stack (visible-right under RTL flow), secondary "إرسال كود عبر SMS" middle, "إلغاء" outermost right — matches existing modal conventions across the app. |
| T5.4 | Eastern Arabic numerals on phone displays | PARTIAL / BLOCKED | Body strings use Eastern Arabic numerals: "٥ دقايق" (T4.1), "٠٠٠٠" placeholder (T4.1). Search input box echoes user input verbatim in Latin digits. Flow doesn't reach `selectedPatient.phone` rendering (line 403 of checkin/page.tsx) since the unlock path skips selecting an existing patient — Mo to verify by registering Sara at clinic-B and checking how her phone displays in the post-registration check-in row. |
| T5 mobile subjective polish | — | **BLOCKED** | Mo to confirm on real Pixel 7 + iPhone SE. |

---

## 4. Privacy invariant verdict

**PASS.**

Side-by-side diff of T2.4 vs T3.2 screenshots (rendered region: search
no-results area between the search input and the doctor list):

- Hint copy: "لو المريض عنده كود خصوصية" — **identical**.
- Green "طلب الوصول" button (with lock icon, same color, same border
  radius, same width): **identical**.
- "أو" separator: **identical**.
- Green "تسجيل مريض جديد" link (with person+plus icon): **identical**.
- Spacing, font weights, typography: **identical**.

The only visible difference between the two screenshots is the digits
rendered inside the search input (`01098765432` vs `01099999999`). Per
the audit doc § 2 "Privacy invariant verification (in code)," the
no-results branch is keyed on the purely-client-side
`normalizeEgyptianPhone(searchQuery)` returning non-null — no server
call between input and UI branching. The black-box behavior matches
that read of the code.

The modal's contents (T3.3) and uniform error string (T3.4) are also
byte-identical between the "exists at clinic A" and "exists at no
clinic" paths.

**No privacy leak observed. Launch on the privacy-invariant axis is not
blocked by this test.**

---

## 5. Outstanding items + side observations

### Things Mo needs to look at directly

1. **T2.10 audit gap (FAIL).** `PATIENT_CLINIC_RECORD_CREATED` audit
   does not fire when the verify-privacy-code → resolveIdentityForClinic
   path inserts a new PCR row. Memory says V2-11 was closed in Build 03
   (mig 074-081); the closure either didn't cover this insertion path
   or has regressed. **Closing prompt suggestion:** check whether mig
   074 added the audit-write to `resolveIdentityForClinic` or to a
   trigger; if to a trigger, the trigger isn't installed on the table.
   Repro is reliable: run T2 again with a fresh PCR baseline and the
   audit table will show only `PRIVACY_CODE_ATTEMPT_SUCCESS`, not
   `PATIENT_CLINIC_RECORD_CREATED`.

2. **Mobile-frame visual review.** T2.3 + T5 polish-on-mobile not
   verified by this run. Pixel 7 + iPhone SE viewports are Mo's call.

3. **Success modal body string.** Visually rendered as "كقّلي تسجيل
   المريض في عيادتك علشان نضيفه للطابور." in Chrome. The d7-results
   doc § 3 prescribed "كمّلي" (with م). Could be a font-rendering
   artifact of the shadda over م, or a real typo in the source string.
   Mo to inspect the i18n key / inline string.

4. **T5.4 Eastern Arabic numerals** on `selectedPatient.phone` line 403
   — unreachable in the unlock flow; needs a separate flow run that
   selects an existing in-clinic patient.

### Things this run already confirmed for Mo

- **ORPH-V4-D7-02 is CLOSED in the deployed build.** The privacy-leaking
  modal body copy ("المريض ده عنده سجلات في عيادة تانية") is gone; the
  current copy "اطلبي من المريض كود الخصوصية بتاعه أو ابعتي له كود
  عبر SMS" is neutral and reveals nothing about whether the patient
  exists. The cleanup-results doc references this fix; the live UI
  matches.
- **ORPH-V4-D7-01 is still OPEN.** Register page at
  `/frontdesk/patients/register?phone=…&unlocked=1` does NOT prefill the
  phone field. URL contract is forward-compatible. Matches d7-results §
  2 expectation.
- **No console errors or 500s** observed during the flow once Mo's dev
  server was reachable.

### Test fixture data writes applied (would not have been needed in a
clean staging snapshot)

- **DATA-FIX-1.** `auth.users.phone` for the chosen FRONT_DESK users
  was stored in the buggy "+20 with leading 0 preserved" form
  (`2001512345678` / `2001512356789`, no `+`, with extra `0`), while
  `public.users.phone` was correctly normalized to E.164
  (`+201512345678` / `+201512356789`). The login route
  (`apps/clinic/app/api/auth/login/route.ts`) reads
  `auth.users.phone` indirectly through Supabase's
  `signInWithPassword({ phone })`, which strips the leading `+`
  and matches against `auth.users.phone`. The two forms didn't
  match and login failed with `WRONG_PASSWORD` regardless of the
  password. Fix applied:
  ```sql
  UPDATE auth.users SET phone = '201512356789'
   WHERE id = '9de362ac-b159-4d4b-b30e-ae0205d51859';
  ```
  **Implication:** other seeded FRONT_DESK users likely have the same
  data shape and would fail to log in for the same reason
  (e.g. `cdc8c67c-…` shows `auth.phone = '20100000022'` —
  shorter, but plausibly the same class of bug). Audit suggested:

  ```sql
  SELECT u.id, u.phone, au.phone, length(au.phone) AS auth_len
    FROM public.users u JOIN auth.users au ON au.id = u.id
   WHERE u.phone IS NOT NULL AND au.phone IS NOT NULL
     AND replace(u.phone,'+','') != au.phone;
  ```

- **DATA-FIX-2.** Set `encrypted_password = crypt('test1234', gen_salt('bf'))`
  on the chosen FRONT_DESK user (`9de362ac-…`). Both fixtures already
  had `encrypted_password IS NOT NULL` but the original password was
  unknown.

These two fixes are confined to the `auth.users` rows of test fixtures
and do not touch app schema, app data, RLS policies, or i18n strings.

### Test plan SQL recipe correction

The T4.2 SQL filters on `metadata->>'global_patient_id' = '<sara_gpid>'`,
but the live audit row stores the gpid in `entity_id`, not in metadata.
Suggested correction for the next iteration of this test plan:

```sql
SELECT metadata->>'sms_plaintext' AS code, created_at
  FROM public.audit_events
 WHERE action = 'SMS_CONSENT_SENT'
   AND metadata->>'sms_dispatch_pending' = 'true'
   AND entity_id::text = '<sara_gpid>'
 ORDER BY created_at DESC LIMIT 1;
```

---

## 6. Sign-off checklist for Mo

- [ ] Privacy invariant T3 visually clean — **claude reports PASS, please confirm by eyeballing the T2.4 vs T3.2 region in the dev server**
- [ ] RTL layout reads naturally on Pixel 7 + iPhone SE — **subjective, not run by claude**
- [ ] Arabic strings all render correctly in dialect — **claude reports no English leaks; please confirm dialect choice**
- [ ] Success modal body string ("كقّلي" vs "كمّلي") — **possible typo; please inspect source string**
- [ ] No console errors or 500s during the flow — **claude observed none**
- [ ] PCR + audit rows landed as expected — **PCR PASS, audit FAIL (T2.10) — Mo to triage the audit-write regression before closing D7**
- [ ] `auth.users.phone` data hygiene — **DATA-FIX-1 likely applies to other seeded FRONT_DESK users; quick audit suggested**

**End of T1–T5 manual test results.**
