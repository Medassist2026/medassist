# B07 Phase G.5 — Execution Decision Log

**Date:** 2026-05-11
**Branch:** main
**Pre-work HEAD:** `39e3c2f` (Phase G)
**Cowork session:** B07 Phase G.5 — Finding #1 investigation + narrow-viewport polish

---

## Pre-work verification status

| Check | Result |
|-------|--------|
| `git log -1 HEAD` = `39e3c2f` | ✓ |
| `git ls-remote origin main` = `39e3c2f` | ✓ |
| Working tree clean | ✓ |
| `gh` CI verification | ✗ (gh unavailable in sandbox — STOP exception #11; will note in final surface) |
| `packages/ui-clinic/components/patient/PediatricBadge.tsx` present | ✓ |
| `apps/clinic/app/api/admin/patient/[gpId]/care-network/route.ts` present | ✓ |
| `packages/shared/lib/api/handlers/admin/patient/care-network/handler.ts` present | ✓ |
| `audits/b07-phase-g-execution-2026-05-10.md` present | ✓ |
| `audits/b07-phase-g-fatima-dpr-backfill-2026-05-10.sql` present | ✓ |
| `.gitignore` includes `.git-commit-message-*.txt` | ✓ |
| Commit-message file NOT tracked (`git ls-files | grep commit-message` empty) | ✓ |
| 3 mig-111 minors consistent (`patients`, PCR, DPR) = (1, 1, 1) | ✓ |

---

## Section 1 — Finding #1 investigation

### 1.1 Methodology

1. Grep'd every code path writing to `doctor_patient_relationships`:
   - `grep -rn "createWalkInPatient\b"` → 3 callers, 1 definition in `patients.ts`
   - `grep -rn "'doctor_patient_relationships'"` → 35+ matches; filtered to `.insert()` calls
   - `grep -rn "relationship_type:\s*['\"]"` → 5 source-code matches
2. For each insertion site, read the literal `relationship_type` value sent
3. Empirical verification via Supabase MCP `execute_sql`: tried the offending payload directly against staging

### 1.2 Survey results — `relationship_type` writes

| File:Line | Function context | Value written | CHECK OK? |
|-----------|------------------|---------------|-----------|
| `packages/shared/lib/data/patients.ts:336` (was 331 pre-fix) | `onboardPatient` existing-patient branch | `isVerifiedByCode ? 'primary' : 'walk_in'` | ✗ walk-in branch fails CHECK |
| `packages/shared/lib/data/patients.ts:516` (was 511 pre-fix) | `createWalkInPatient` dedup-dependent branch | `'walk_in'` | ✗ fails CHECK |
| `packages/shared/lib/data/patients.ts:699` (was 694 pre-fix) | `createWalkInPatient` main walk-in branch | `'walk_in'` | ✗ fails CHECK |
| `packages/shared/lib/data/patients.ts:1019` | `verifyPatientCodeAndUpgrade` (UPDATE, not INSERT) | `'primary'` | ✓ |
| `packages/shared/lib/data/dependents.ts:567` (Phase G `establishMinorClinicPresence`) | minor 4-row landing | `'primary'` | ✓ |
| `packages/shared/lib/api/handlers/doctor/patients/add/handler.ts:51` | doctor-side "add patient" | `'walk_in'` | ✗ fails CHECK |

### 1.3 Empirical CHECK probe (Supabase MCP)

Ran the exact payload from `createWalkInPatient:694` against staging:

```sql
INSERT INTO public.doctor_patient_relationships
  (doctor_id, patient_id, clinic_id, status, relationship_type,
   access_level, consent_state, access_type, notes, last_visit_at)
VALUES (..., 'pending', 'walk_in', 'walk_in_limited', 'pending', 'walk_in', 'TEST', NOW());
```

Result: **`ERROR 23514: check_violation on doctor_patient_relationships_relationship_type_check`**.

Then ran the same payload with `'primary'`:

```sql
... VALUES (..., 'pending', 'primary', ...);
```

Result: **INSERT succeeded** (probe row `a45ce4c8-...` immediately deleted; staging clean).

### 1.4 Conclusion — Case A confirmed

Phase G finding #1 is **empirically correct**. The CHECK constraint defined in mig 010 (`relationship_type IN ('primary', 'secondary', 'consultant')`) rejects every code path that writes `'walk_in'`. Three INSERT sites fail and one UPDATE site is fine. The 30 staging rows with `relationship_type='primary'` exist because:

- The main INSERT path silently fails CHECK
- The legacy-fallback INSERT (e.g., `patients.ts:716`) strips `relationship_type` from the payload
- Stripped INSERT relies on the column DEFAULT='primary' (also from mig 010)
- The fallback also strips `clinic_id`, `status`, `access_level`, `consent_state`, `notes`, `last_visit_at` — so 28 of 30 rows on staging have those columns NULL/default-only

This explains the empirical row shape distribution surfaced in Phase G housekeeping (`audits/b07-phase-g-fatima-dpr-backfill-2026-05-10.sql`). The bug has been silently degrading walk-in DPR data quality for the entire history of `createWalkInPatient`.

### 1.5 Fix shipped

Four sites changed (`walk_in` → `'primary'`):

| File | Line (post-fix) | Change |
|------|-----------------|--------|
| `packages/shared/lib/data/patients.ts` | 336 | `isVerifiedByCode ? 'primary' : 'walk_in'` → `'primary'` (constant) |
| `packages/shared/lib/data/patients.ts` | 516 | `'walk_in'` → `'primary'` (dedup-dependent branch) |
| `packages/shared/lib/data/patients.ts` | 699 | `'walk_in'` → `'primary'` (main walk-in branch) |
| `packages/shared/lib/api/handlers/doctor/patients/add/handler.ts` | 51 | `'walk_in'` → `'primary'` (doctor "add patient") |

`access_type` field unchanged everywhere (`'walk_in'` is the correct value for that column per `access_type_check` allowing `'walk_in' | 'verified'`).

The legacy-fallback INSERT blocks remain in place — they're defense-in-depth against unrelated future schema changes. Now they will rarely execute because the main INSERT succeeds on the first try.

### 1.6 Side effect — data-quality improvement going forward

After this commit lands, new walk-in DPRs will carry the full payload: `clinic_id`, `status='pending'`, `access_level='walk_in_limited'`, `consent_state='pending'`, `notes='walk-in'`, `last_visit_at=NOW()`. Pre-G.5 rows (the 28 stripped rows on staging) are NOT backfilled here — that's a separate data-hygiene workstream.

---

## Section 2 — Narrow-viewport overflow polish

### 2.1 Survey — sites rendering `PediatricBadge` / `AgeBadge`

Clinic-side (`PediatricBadge`):

| Site | Parent layout | Verdict |
|------|---------------|---------|
| `/doctor/patients/[id]/page.tsx:529` | `flex items-center gap-2 flex-wrap` | ✓ wraps cleanly |
| `/doctor/patients/page.tsx:458` | `flex items-center gap-2 flex-wrap` | ✓ wraps cleanly |
| `/frontdesk/dashboard/page.tsx:308` | `flex items-center gap-1.5 flex-wrap justify-end` | ✓ wraps cleanly |
| `SessionForm.tsx:2084` sticky bar | `flex items-center gap-2 flex-wrap` | ✓ wraps cleanly |

Patient-side (`AgeBadge`):

| Site | Parent layout | Verdict |
|------|---------------|---------|
| `/patient/settings/family/page.tsx:99` | `flex items-center gap-1.5` + sibling `truncate` | ✓ truncates name; badge stays |
| `/patient/settings/family/[id]/page.tsx:147` | `flex items-center gap-1.5` + sibling `truncate` | ✓ truncates name; badge stays |
| `AccountSwitcher.tsx:202` | `flex items-center gap-1.5` inside `flex-1 min-w-0`; sibling `truncate` | ✓ truncates name; badge stays |
| `DependentRegistrationForm.tsx` | (only imports `calculateAge`, no `<AgeBadge>`) | n/a |
| `CaregiverBanner.tsx` | (only imports `calculateAge`, no `<AgeBadge>`) | n/a |

**All sites already wrap or truncate cleanly at ≥320px iPhone SE width.** No layout-level changes needed.

### 2.2 Defensive polish applied

Two component-level changes for robustness:

1. `packages/ui-clinic/components/patient/PediatricBadge.tsx`:
   - Age label gains `whitespace-nowrap` so "(عمر N)" / "(Age N)" never breaks mid-token
   - Pill gains `whitespace-nowrap flex-shrink-0` so "Pediatric patient" / "مريض تابع" stays as one chip and doesn't compress its padding under flex pressure
   - Inner icon gains `flex-shrink-0` so it never disappears under extreme compression

2. `apps/patient/components/AgeBadge.tsx`:
   - Span gains `whitespace-nowrap` so "(عمر N)" / "(Age N)" stays as one token even when the parent's available space is tight

Both changes are component-internal and invisible at typical viewports. They protect against pathological cases (extremely long Arabic names, narrow Android folded screens, future i18n locales with longer pluralized age strings).

### 2.3 No-fix decisions

No layout (parent-side) changes shipped because every surveyed site already uses `flex-wrap` (clinic) or `truncate` + flex-1 min-w-0 (patient) — the prompt's "if badge wraps cleanly via flex-wrap: no fix needed" criterion applies uniformly.

---

## Decision log — Sections 1 + 2

### Decision 1: Empirical-first investigation (Lesson #16)

**Date:** 2026-05-11
**Context:** Phase G finding #1's description claimed `createWalkInPatient` writes `relationship_type='walk_in'` — but 30 staging rows show `'primary'`. Phase G.5 prompt explicitly invited "Case B" doc-update if the finding was misread.

**Decision:** Run the actual INSERT payload against staging CHECK to determine the truth.

**Reasoning:** Source-code grep + CHECK constraint definition are necessary but not sufficient. Only an empirical INSERT proves whether (a) the code path is dead, (b) supabase-js silently coerces, or (c) a fallback path catches the failure. The probe revealed (c) — the legacy fallback at line 716 catches the failure and writes a stripped row that picks up DEFAULT='primary'. This explains why staging rows show 'primary' AND why 28 of 30 rows are missing `notes` and `last_visit_at`.

### Decision 2: Fix all 4 sites in one commit

**Date:** 2026-05-11
**Context:** Two files contain the bug: `packages/shared/lib/data/patients.ts` (3 sites) and `packages/shared/lib/api/handlers/doctor/patients/add/handler.ts` (1 site). Could split into per-site commits or bundle.

**Decision:** Single commit covering all 4 sites.

**Reasoning:** The fix is uniform (one-token change per site). Per-site commits add review-hygiene overhead without proportional benefit. Phase G.5's whole scope is a small targeted polish session per the prompt; multiple commits would inflate scope perception.

### Decision 3: Keep legacy-fallback INSERT blocks in place

**Date:** 2026-05-11
**Context:** The legacy fallbacks at `patients.ts:716` and `doctor/patients/add/handler.ts:64` exist specifically to catch the CHECK failure caused by the now-fixed bug. Now they will rarely execute. Could remove them.

**Decision:** Leave fallbacks in place; do not refactor.

**Reasoning:** The fallbacks were written as defense-in-depth against unrelated schema variants (the comment at line 723 says "Backward-compatible fallback for older schema variants"). Removing them now introduces a new failure mode — any future schema drift that breaks the main INSERT would 500 instead of silently degrading to the legacy shape. The cost of keeping them is two unreachable code paths at runtime; the benefit is fail-safe protection for unknown future changes. Cost ≪ benefit.

### Decision 4: No data backfill for 28 stripped staging rows

**Date:** 2026-05-11
**Context:** The 28 staging walk-in DPR rows missing `notes` and `last_visit_at` could be backfilled now.

**Decision:** Do NOT backfill in Phase G.5.

**Reasoning:** Phase G.5 scope is "narrow-viewport overflow + finding #1 investigation/fix" — data hygiene of historical rows is out of scope. The missing fields are non-critical: `notes='walk-in'` is informational, `last_visit_at` can be reconstructed from `created_at` if needed. Phase H (RLS matrix expansion) or a separate hygiene session can address this if it becomes load-bearing. Adding it to Phase G.5 risks scope creep per the prompt's STOP exception #5.

### Decision 5: Component-internal polish only (no parent-layout changes)

**Date:** 2026-05-11
**Context:** Section 2 survey found all 7 sites already wrap/truncate cleanly. Could (a) ship no change, (b) ship defensive component-internal polish, or (c) audit responsive behavior at parent containers.

**Decision:** Ship (b) — component-internal `whitespace-nowrap` / `flex-shrink-0` on `PediatricBadge` and `AgeBadge` only.

**Reasoning:** (a) leaves the badge text vulnerable to mid-token wrapping in pathological cases (very long Arabic guardian names, future i18n strings). (c) violates the prompt's "narrow-viewport overflow only — a single targeted polish" rule and STOP exception #3. Option (b) is the minimum defensive change that closes the finding and matches the prompt's "if badge text itself truncates ugly: shorten copy variant" guidance applied at the token level instead of the layout level.

### Decision 6: Phase G finding #1 description was accurate

**Date:** 2026-05-11
**Context:** Phase G.5 prompt explicitly raised the possibility that the cowork session "misread" the codebase.

**Decision:** Phase G's description was accurate (Case A). The empirical staging data Mo cited ("30 rows show 'primary'") looked like contradicting evidence but is actually a symptom of the fallback path catching the failure — confirming rather than refuting the bug.

**Reasoning:** Source code at all 4 sites verifiably writes `'walk_in'` (verified by grep + visual inspection). The CHECK rejects it (verified empirically). The DEFAULT + fallback explain how staging stays consistent despite the bug. Phase G's description is preserved in `audits/b07-phase-g-execution-2026-05-10.md` line 273+314 unchanged; Phase G.5 closes the finding via fix rather than via doc retraction.

---

## Phase G findings — final status

| # | Title | Phase G status | Phase G.5 status |
|---|-------|----------------|-------------------|
| 1 | `createWalkInPatient` `relationship_type='walk_in'` violates CHECK | out-of-scope flag | **RESOLVED** via 4-site fix |
| 2 | fatima ahmad missing DPR | RESOLVED | (unchanged) |
| 3 | Phase E onboard comment outdated | RESOLVED | (unchanged) |
| 4 | search-row minor border accent | RESOLVED | (unchanged) |
| 5 | narrow-viewport pediatric tag overflow (ties to Phase F #6) | future | **RESOLVED** via `whitespace-nowrap` polish |
| 6 | `gh` unavailable in sandbox | ops (STOP #11) | (unchanged — same condition holds) |

All 6 Phase G findings are now either RESOLVED or operational-flagged with no action needed.

---

## Sympathetic doc updates

Pending application:

- `audits/STATE_OF_WORK.md` — Phase G.5 header addendum
- `audits/PROGRAM_STATE.md` — Phase G.5 entry (NEW, brief)
- `audits/b07-phase-g-execution-2026-05-10.md` — finding #1 status amendment (cross-reference to G.5)
- `audits/b07-phase-g5-execution-2026-05-11.md` — THIS file (NEW)

Phase G.5 does NOT update:

- `ARCHITECTURE.md` (no architectural change)
- `DECISIONS_LOG.md` D-NNN entries (the 6 G.5 decisions live here; nothing rises to load-bearing D-NNN status)
- Phase G/H/I/J prompts

---

## Verification gates

| Gate | Status |
|------|--------|
| Root `tsc --noEmit` | ✓ |
| `apps/clinic` `tsc --noEmit` | ✓ |
| `apps/patient` `tsc --noEmit` | ✓ |
| `npm run lint:scopes` | ✓ |
| Empirical INSERT verification on staging (post-fix payload) | ✓ (probe row `a45ce4c8-...` inserted then deleted) |
| Mac-side `next build` (clinic + patient) | Pending — Mac-side via pre-push hook |
