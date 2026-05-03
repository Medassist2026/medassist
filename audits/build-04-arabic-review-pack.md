# Arabic Strings Review Pack — Build 04 (ORPH-V4-07)

> **For:** Mo (acting as the named native Egyptian Arabic speaker reviewer)
> **Closes:** ORPH-V4-07
> **What you're checking:** every Arabic string in Build 04 reads as natural
> Egyptian dialect, not MSA, not awkward — and that legal-consent surfaces
> (the SMS especially) communicate the meaning Egyptian patients will
> actually understand.

---

## Why this matters

Egypt PDP Law 151/2020 requires explicit, informed consent for
data sharing. "Informed" means the patient understood the prompt.
If the prose reads MSA-formal or like a translation from English, a
court could later argue the consent wasn't informed. This isn't UX
polish — it's legal validity for the consent surface.

Two strings are highest-stakes:
1. The SMS body (sent to the patient's phone, the consent moment)
2. The patient app re-consent prompt (blocking the home screen)

The frontdesk modal copy is staff-facing, lower stakes — staff can ask
follow-up questions. Patient-facing surfaces (SMS, patient app) cannot.

---

## How to review

For each string below, ask:
1. **Does it read as natural Egyptian dialect?** (e.g., "بتقدر" not
   "تستطيع", "ده" not "هذا", "عايز" not "أريد")
2. **Would a non-technical 50-year-old patient understand it?** (no
   jargon, no app-developer phrasing)
3. **Does the meaning land correctly?** (especially for consent —
   does the patient understand they're authorizing record visibility?)
4. **Does grammatical gender match?** Frontdesk staff in Egyptian
   clinics is overwhelmingly female; "اطلبي منه" (feminine command)
   was used in the modal. Confirm.

Mark each string:
- ✓ APPROVE as-is
- ✏️ REVISE (provide the new text)
- ❌ REJECT (provide reasoning + alternative)

---

## 1. SMS consent template (HIGHEST STAKES)

**File:** `packages/shared/lib/data/privacy-codes.ts:417-428` —
`renderSmsConsentTemplate()`

**Current text** (what gets sent to the patient's phone):

```
عيادة {clinicName} طلبت إذنك لرؤية سجلاتك الطبية.
الكود: {code}. صالح لمدة 5 دقائق فقط.
الدكتور: {doctorName}.
لو ما طلبتش الإذن ده، تجاهل الرسالة.
```

**Example with values filled in:**

```
عيادة د. أحمد الحديثة طلبت إذنك لرؤية سجلاتك الطبية.
الكود: 4729. صالح لمدة 5 دقائق فقط.
الدكتور: د. سارة محمد.
لو ما طلبتش الإذن ده، تجاهل الرسالة.
```

**Things to check:**
- "طلبت إذنك" — is this the right word for "requested your permission"?
  ("طلبت موافقتك" might be more natural — your call)
- "لرؤية سجلاتك الطبية" — natural? Or does Egyptian dialect prefer
  "علشان تشوف سجلاتك"?
- "صالح لمدة 5 دقائق فقط" — fine in dialect, or does this read MSA?
- "لو ما طلبتش الإذن ده، تجاهل الرسالة" — confirms this is the dialect
  form ("لو ما" not "إذا لم"). Good?
- The 4-digit code in the middle line — is putting it on its own line
  with "الكود:" prefix the right format for SMS scanability?
- Full message length: 4 lines, ~150 characters. Twilio billing is per
  140 chars (one segment); this likely splits to 2 segments. If you
  want to reduce to 1 segment, what would you cut?

**Decision:** ___________________________________________________

**Revised text (if any):**

```
[your revised version here]
```

---

## 2. Frontdesk privacy code modal — title + body

**File:** `packages/shared/lib/i18n/ar.ts` — keys `privacyCode_modalTitle`
and `privacyCode_modalBody`

**Note:** I don't have the live `ar.ts` file in this review pack — the
cowork session described the keys but didn't paste the values. To
review these, run this in your terminal:

```bash
grep -A 1 "privacyCode_modalTitle\|privacyCode_modalBody\|privacyCode_uniformError\|privacyCode_requiresCodeBody\|privacyCode_openModalCta\|privacyCode_smsButton\|privacyCode_codeInputLabel" packages/shared/lib/i18n/ar.ts
```

Paste the output below for each key, then review:

**`privacyCode_modalTitle`** (modal heading shown to frontdesk staff):
- Current: ___________________________________________________
- Decision (✓ / ✏️ / ❌): _____
- Revised: ___________________________________________________

**`privacyCode_modalBody`** (modal explainer — should mention "ask the
patient for the 6-character code" without leaking that they're at
another clinic):
- Current: ___________________________________________________
- Decision: _____
- Revised: ___________________________________________________

**`privacyCode_uniformError`** (the SAME error text shown for ALL
failure cases — wrong code, no patient, locked out, rate limited.
This is the privacy-leak prevention surface):
- Current: ___________________________________________________
- Decision: _____
- Revised: ___________________________________________________
- **Note:** the cowork session shipped "الكود غير صحيح أو لا يوجد
  سجل" which reads MSA. An Egyptian dialect version might be
  "الكود غلط أو مفيش سجل." Your call.

**`privacyCode_requiresCodeBody`** (text under the "Request access"
button on the check-in page when phone normalizes but patient isn't
in this clinic — must NOT say "patient at another clinic"):
- Current: ___________________________________________________
- Decision: _____
- Revised: ___________________________________________________

**`privacyCode_openModalCta`** (the "Request access" button label):
- Current: ___________________________________________________
- Decision: _____
- Revised: ___________________________________________________
- **Suggestion:** "طلب الوصول" or "اطلب كود الوصول" — both work.

**`privacyCode_smsButton`** (the "Send code via SMS" button inside the
modal):
- Current: ___________________________________________________
- Decision: _____
- Revised: ___________________________________________________

**`privacyCode_codeInputLabel`** (the label for the 6-char code input):
- Current: ___________________________________________________
- Decision: _____
- Revised: ___________________________________________________

---

## 3. Patient app privacy code card

**File:** `packages/shared/lib/i18n/ar.ts` — keys `patientPrivacy_*`

Run:
```bash
grep -A 1 "patientPrivacy_" packages/shared/lib/i18n/ar.ts
```

Expected keys (per Build 04 results § 2):
- `patientPrivacy_pageTitle`
- `patientPrivacy_intro` (explainer: what is this code, when do you use it)
- `patientPrivacy_currentCodeLabel`
- `patientPrivacy_regenerateButton`
- `patientPrivacy_regenerateConfirmTitle`
- `patientPrivacy_regenerateConfirmBody` (warning: old code stops working)
- `patientPrivacy_regenerateConfirmYes`
- `patientPrivacy_regenerateConfirmNo`
- `patientPrivacy_newCodeShownOnceWarning` (the "this is the only time
  you'll see this code" message after regenerate)
- `patientPrivacy_copyButton`
- `patientPrivacy_noCodeYetMessage` (shown when patient hasn't minted
  a code; CTA is "Generate")
- `patientPrivacy_unclaimedMessage` (shown when patient app loaded
  but global_patient.claimed = FALSE — ORPH-V2-01 territory)

**Most important:**

**`patientPrivacy_intro`** — this is the patient's first explanation of
what the code is for. Must be:
- Plain Egyptian dialect
- Suitable for someone who has never used a patient health app
- Communicates: "this is YOUR code, you give it to a clinic when you
  go there for the first time, the doctor uses it to see your records
  from other doctors"

**Suggested phrasing** (you decide if this lands or not):
> "ده الكود اللي بتديه للسكرتيرة لما تروح عيادة جديدة. الدكتور
> هيستخدمه علشان يشوف سجلاتك من الدكاترة التانيين اللي زرتهم.
> الكود ده ليك إنت بس — متديهوش لحد غير لما تكون موافق إنه يشوف
> سجلاتك."

For each key, paste current value + your decision below:

[block for each key — fill in as you grep]

---

## 4. Re-consent prompt (patient app)

**File:** `packages/shared/lib/i18n/ar.ts` — keys `reconsent_*`

Run:
```bash
grep -A 1 "reconsent_" packages/shared/lib/i18n/ar.ts
```

Expected keys:
- `reconsent_pageTitle`
- `reconsent_intro` (explains why this is being asked — system updated)
- `reconsent_bodyTemplate` (per-clinic text with `{clinicName}` placeholder)
- `reconsent_yesButton` (keep messaging on)
- `reconsent_noButton` (turn messaging off)
- `reconsent_progressIndicator` (e.g., "Clinic 1 of 3")

**Most important:**

**`reconsent_bodyTemplate`** — this is the per-clinic question. Has
to make clear what the patient is agreeing to. The cowork session
shipped:

> "عيادة {clinicName} كانت بتقدر تبعتلك رسائل قبل تحديث النظام.
> تحب تكمل كده، ولا تختار يبعتلك رسائل في الحالات دي بس؟"

**Things to check:**
- "كانت بتقدر تبعتلك رسائل" — natural? Or "كانت بتبعتلك رسائل"
  (more direct)?
- "قبل تحديث النظام" — does this make sense to a non-technical patient?
  Maybe "قبل التحديث الجديد" or "قبل ما النظام يتحدث"?
- The second clause: "تحب تكمل كده، ولا تختار يبعتلك رسائل في الحالات
  دي بس؟" — confusing? The "في الحالات دي بس" part is unclear without
  context. What "cases"? The patient won't know.

**Suggested phrasing alternative** (your call):
> "عيادة {clinicName} كانت بتبعتلك رسائل عن مواعيدك ونتائجك.
> تحب تستمر تستقبل الرسائل دي؟"

(Simpler. No reference to "system update" — the patient doesn't care.
Just the question.)

For each key, paste + decide.

---

## 5. The patient privacy explainer overall — does it work?

Stand back from individual strings and ask: **if a 50-year-old patient
who's never used a medical app opened `/patient/privacy`, would they
understand:**

1. What the code is
2. When to use it (give to a clinic when first visiting)
3. Why to keep it private (it unlocks their records to whoever has it)
4. What "regenerate" does (the old code stops working)

If the answer to any is "they'd be confused," revise the relevant
strings. The legal/UX cost of patient confusion here is high — they
might give the code to anyone, or never use it at all.

---

## 6. SMS specifically — read it back to yourself

The single best test for the SMS body: **read it out loud, in your
natural Egyptian Arabic accent, as if you were dictating it to a
patient.**

If anything makes you pause or rephrase, REVISE.

The bar isn't "grammatically correct dialect." The bar is "would I
send this to my own grandmother."

---

## Sign-off

When done, paste this into `audits/orphan-ledger.md` to close
ORPH-V4-07:

```
| ORPH-V4-07 | SMS template + UI strings native Egyptian Arabic speaker review | I18N | Prompt 4 (Build 04) | Build 04 ORPH-V4-07 review (this prompt) | Mo (self-reviewed as native speaker) | Reviewed all strings in audits/build-04-arabic-review-pack.md on YYYY-MM-DD. Approved as-is: [list]. Revised: [list with file:line of each revision]. Sign-off: Mo, YYYY-MM-DD. |
```

Move the row from Open Items to Closed Items.

---

## After review

If no strings revised: just close ORPH-V4-07 in the ledger.

If strings revised: edit `packages/shared/lib/i18n/ar.ts` (and
`privacy-codes.ts:renderSmsConsentTemplate` if the SMS body changed)
with the new strings, commit with a message like
`i18n: Egyptian dialect review (ORPH-V4-07)`, then close the ledger.

---

## What I'm not asking you to review (out of scope)

- Existing strings from before Build 04 (those are in earlier prompts'
  scope; if you spot something off, flag separately)
- English equivalents in `en.ts` — those are Mo's call as product
  owner, but not a legal-consent issue
- The 4-digit SMS code format itself (4 vs 6 digits) — that's a
  product decision, already locked
