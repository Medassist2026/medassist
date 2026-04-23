# Notes — after the doctor-analytics clinic-scoping PR (2026-04-22)

This file tracks items NOT covered by the 2026-04-22 PR that folded
(1) the `payment_status 'paid' → 'completed'` hotfix,
(2) the profile API clinic-scoping fix (use `getClinicContext`),
(3) the "ملخص هذا الشهر" header/field alignment,
(4) the Africa/Cairo TZ fix,
(5) the analytics `clinic_id` scoping, and
(6) Mo's product decision: analytics `زيارة` now counts
    `clinical_notes`, matching profile `جلسة`.

See `analytics-bug-report.md` in this folder for the original
diagnostic that kicked off the whole thread.

## Architecture caveats worth knowing

- **`analytics_events` has no `clinic_id` column.** Timing KPIs
  (`avgDurationSeconds`, `sessionsUnder45sRate`, weekly comparison)
  are still doctor-scoped only — a multi-clinic doctor sees those
  KPIs summed across all their clinics. Adding
  `analytics_events.clinic_id` is a separate migration + tracking
  change. Flagged in the doc comment on `fetchSessionEvents` so the
  next person knows. If a multi-clinic doctor complains that their
  "seconds per session" number doesn't match what the active clinic
  dashboard shows, this is why.

- **`doctor_patient_relationships.created_at` = pair onboarding
  timestamp.** The profile page now labels the "مريض جديد" stat using
  that row's `created_at`, so "new patients this month" means "new
  doctor-patient pairs created this month" — it will undercount if a
  patient was onboarded long ago but had their first visit this
  month. Good enough for an MVP month-summary card; revisit if Mo
  wants a sharper definition.

## Tooling TODO (carries over from prior PR)

- **No test runner configured for `@medassist/shared`.** Neither the
  repo root nor `packages/shared/package.json` installs jest or
  vitest. The `drug-interactions.test.ts` and `doctor-stats.test.ts`
  files use a hand-rolled `test()` harness run via `tsx`. Run locally
  with:

      npx tsx packages/shared/lib/analytics/__tests__/doctor-stats.test.ts
      npx tsx packages/shared/lib/data/__tests__/drug-interactions.test.ts

  Before the next PR that adds substantial coverage, install vitest
  (native ESM + tsconfig-paths support) and wire it into root
  `package.json` scripts so CI can enforce the suite. The new
  `packages/shared/lib/date/cairo-date.ts` module also deserves its
  own test file once the runner is in place.

## Open product decisions (not code bugs)

No open product decisions as of 2026-04-22 — Mo signed off on
`زيارة = clinical_notes` (see commit message for the dated
reference).
