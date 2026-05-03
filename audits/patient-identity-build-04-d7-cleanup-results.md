# Build 04 D7 Cleanup — Type-check Fix + V4-D7-02 String Fix

Date: 2026-04-29
Scope: two mechanical fixes — broken module resolution from D7 wire-up, and
the privacy-leaking `privacyCode_modalBody` copy. No new functionality.

## 1. File location finding

`PrivacyCodeEntryModal.tsx` lives at:

```
apps/clinic/components/frontdesk/PrivacyCodeEntryModal.tsx
```

`find . -name "PrivacyCodeEntryModal.tsx" -not -path '*/node_modules/*'`
returned exactly one path. The D7 results doc § 2 was correct about
the file location — the bug was in the import side, not the file side.

The file exports `PrivacyCodeEntryModal` as a named export (named function +
named props interface), so a re-export shim is not needed; only the import
specifier had to change.

## 2. tsconfig paths — what aliases exist

Root `tsconfig.json` (used by `npm run type-check` → `tsc --noEmit`):

```json
"paths": {
  "@shared/*": ["./packages/shared/*"],
  "@ui-clinic/*": ["./packages/ui-clinic/*"]
}
```

`apps/clinic/tsconfig.json` (used by Next.js dev/build inside the clinic app):

```json
"paths": {
  "@/*": ["./*"],
  "@shared/*": ["../../packages/shared/*"],
  "@ui-clinic/*": ["../../packages/ui-clinic/*"]
}
```

**Root cause.** `@/*` is only declared in `apps/clinic/tsconfig.json`. The
root tsconfig has no `@/*` alias and no project-references wiring, so
`tsc --noEmit` from the repo root cannot resolve `@/components/...`. Next
dev would have resolved it (it picks up the app-local tsconfig), but the
type-check gate runs against the root tsconfig and broke. Per project
constraints (no new aliases, no file move), the fix is a relative import.

Convention check: every other clinic-app page imports frontdesk components
via `@ui-clinic/components/frontdesk/...`, and that alias maps to
`packages/ui-clinic/components/frontdesk/`. Our modal doesn't live there —
it lives inside the clinic app. Moving it would have been the architecturally
clean answer (per ARCHITECTURE.md § 2 frontdesk components belong in
`packages/ui-clinic`), but the cleanup brief explicitly forbids the move.
Flagging this as a follow-up consideration, not acting on it.

## 3. Import diff

`apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx` line 11:

Before:
```ts
import { PrivacyCodeEntryModal } from '@/components/frontdesk/PrivacyCodeEntryModal'
```

After:
```ts
import { PrivacyCodeEntryModal } from '../../../../components/frontdesk/PrivacyCodeEntryModal'
```

Hop count from `apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx`:
`../` × 4 climbs out of `checkin/`, `frontdesk/`, `(frontdesk)/`, `app/` →
lands in `apps/clinic/`, then descends into
`components/frontdesk/PrivacyCodeEntryModal`. Resolves under both root and
app-local tsconfig (relative paths don't depend on aliases).

## 4. type-check output

After both fixes (import + i18n strings):

```
> medassist@0.1.0 type-check
> tsc --noEmit
```

Zero errors. Original `TS2307: Cannot find module '@/components/...'` is gone;
no new errors surfaced from the i18n value changes.

## 5. String diff (V4-D7-02)

`packages/shared/lib/i18n/ar.ts` line 640:

Before:
```ts
privacyCode_modalBody: 'المريض ده عنده سجلات في عيادة تانية. اطلبي منه كود الخصوصية ٦ حروف، أو ابعتيله كود عبر SMS لو مش معاه الكود.',
```

After:
```ts
privacyCode_modalBody: 'اطلبي من المريض كود الخصوصية بتاعه أو ابعتي له كود عبر SMS',
```

`packages/shared/lib/i18n/en.ts` line 520:

Before:
```ts
privacyCode_modalBody: 'This patient has records at another clinic. Ask them for their 6-character privacy code, or send a one-time SMS code if they don\'t have it.',
```

After:
```ts
privacyCode_modalBody: 'Ask the patient for their privacy code, or send them a code via SMS',
```

Why it matters. The previous body ("patient at another clinic" / "المريض ده
عنده سجلات في عيادة تانية") asserted cross-clinic existence the moment the
modal appeared, leaking the same fact the uniform `requires_code` API
response was designed to hide. The replacement describes only the operator's
next action, preserving the privacy invariant: the modal opens uniformly
whether or not records actually exist elsewhere.

Same key in both locales — no new i18n keys, no callers to update,
no tests touched.

## 6. Orphan ledger update

`audits/orphan-ledger.md` Closed Items: appended one row for ORPH-V4-D7-02
immediately after ORPH-V4-07. Closed-in column reads "Build 04 D7 cleanup
(this prompt)"; Notes record Mo's 2026-04-29 approval and quote the new
Arabic value. No other rows touched.

ORPH-V4-D7-02 was never carried into the main ledger's Open Items by the D7
wire-up session — it was opened in the D7 results doc table only — so this
is an additive close, not a state-transition row move. The other two D7
orphans (V4-D7-01 register prefill, V4-D7-03 multi-doctor selection) are
out-of-scope for this cleanup and remain in the D7 results doc.

## Files touched

- `apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx` (import line)
- `packages/shared/lib/i18n/ar.ts` (one string value)
- `packages/shared/lib/i18n/en.ts` (one string value)
- `audits/orphan-ledger.md` (one new Closed Items row)

## What might need follow-up

Architecture nit: `PrivacyCodeEntryModal` lives in `apps/clinic/components/`
rather than `packages/ui-clinic/components/frontdesk/` where every other
frontdesk component lives. The relative import works but is the only
`../../../../components` path in the clinic app. If/when Mo wants to align
with ARCHITECTURE.md § 2, the move + import update is a separate session.

## What to test

- Pixel 6 + iPhone SE manual smoke (already on Mo's queue post-fix).
- The modal should still open from the check-in page when phone search
  returns `requires_code`; the only visible difference is the body copy.
- No behavioral change to the modal itself — props, callbacks, and the
  unlock flow are untouched.
