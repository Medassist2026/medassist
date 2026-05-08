# MedAssist — Review Criteria for Cowork Session Deliverables

> Self-check checklist applied by the cowork session BEFORE surfacing any
> deliverable to Mo. The cowork session reads this doc at the start of every
> work block and verifies their deliverable against each applicable criterion.
>
> Criteria are concrete and verifiable. If a criterion can't be checked
> mechanically (`grep` / file view / `git` command / SQL query), it doesn't
> belong here.

**Last updated:** 2026-05-08
**Authority:** Codifies Mo's review framework as applied through the 2026-05-08
session. The framework supersedes ad-hoc review patterns; deviations require
an explicit ruling captured in `DECISIONS_LOG.md`.
**Lockstep peers:** `ARCHITECTURE.md`, `DECISIONS_LOG.md`, `PRODUCT_SPEC.md`,
`audits/STATE_OF_WORK.md`, `audits/EXECUTION_PROMPTS.md`, `REVIEW_CRITERIA.md`
(this doc). Per Lesson #13 in `audits/EXECUTION_PROMPTS.md`, all six update
together when the methodology evolves.

The first empirical evidence that this gate works showed up while authoring
this very doc: the §1.2 STATE_OF_WORK currency check caught an off-by-amend
artifact (`5ad4003 → 0abce28` in line 125 of STATE_OF_WORK.md) before any
authoring began. The bug fix shipped in the same commit that codified the
discipline. See §4 entry "Off-by-amend hash artifacts" for the full case.

---

## Section 1: Pre-work verification (run BEFORE starting the task)

> Cowork sessions verify the prompt's premises against ground truth BEFORE
> starting work. A wrong premise compounds into a wrong deliverable. This
> section catches prompt errors early.

### 1.1 Empirical claim verification

Every load-bearing factual claim in the prompt that involves any of the
following must be verified against ground truth before the cowork session
begins authoring work:

- Numeric constants and counts (row counts, file counts, line counts,
  thresholds, rate limits, cost parameters)
- Table, column, function, RPC, or enum names
- File paths (with extensions)
- Commit hashes (verify reachability AND that the message matches)
- Dates and ISO timestamps
- Security parameters (bcrypt cost, TTLs, attempt thresholds, timing pads)
- Version numbers (Next, Postgres, Tailwind, Capacitor)
- CI run IDs and their pass/fail outcomes

**Concrete example.** The Lesson #14 amendment prompt claimed commit
`9774252` was the operational fix for CI run 25475031898. A pre-work
`gh run list` would have shown runs 118-120 all failed *post-*`9774252` —
surfacing the contradiction before 24 minutes of doc-amendment work shipped
on a wrong premise. Two commits later (`80ee270`), Mo's session had to
re-amend Lesson #14 / ARCH §2 / D-065 to correct the empirical justification.
Captured as Lesson #17 and reflected in STATE_OF_WORK.md's "CI fix-attribution
doc reconciliation" entry.

**Procedure when verification surfaces a contradiction with the prompt:**

1. STOP. Do not start the task.
2. Surface the contradiction with: (a) the prompt's claim verbatim, (b) the
   ground-truth value, (c) the command/query used to check each.
3. Wait for Mo's ruling. Do not author work that papers over the gap.

### 1.2 STATE_OF_WORK.md currency check

The cowork session verifies STATE_OF_WORK.md is current with the actual repo
state before adding their workstream entry:

- HEAD commit hash (`git log -1 --format=%H`) matches what STATE_OF_WORK.md
  "Last updated" / most-recent Completed entry reflects.
- Each Completed-workstream entry's `Last commit:` field is reachable from
  HEAD (`git cat-file -e <hash>` succeeds; `git log --oneline | grep <hash>`
  finds it).
- Active workstreams section accurately reflects current work — no
  already-completed workstream still listed Active.

**Concrete example.** While authoring this very doc, the §1.2 check caught
that STATE_OF_WORK.md line 125 recorded Phase F Task 10's last commit as
`5ad4003`. `git log --oneline -10` did not list `5ad4003`; `git show 5ad4003`
returned a commit with the same message + same author timestamp as `0abce28`
(actual HEAD), confirming `5ad4003` was an unreachable orphan from a
`git commit --amend`. Identical off-by-amend pattern to the `d8daa60 →
bad1100` fix STATE_OF_WORK.md itself documents in line 122. The fix was
bundled into this workstream's commit; see §4 entry below.

### 1.3 Cross-reference resolvability

If the prompt references "ARCH §X.Y", "D-NNN", "Empirical Lesson #N", "Phase
F Task N", "TD-NNN", or any commit hash, verify each reference resolves to
existing content before starting:

- `grep -n "^### D-NNN" DECISIONS_LOG.md` — decision exists
- `grep -n "^## NN\\." ARCHITECTURE.md` — section exists
- `grep -n "^### Lesson NN" audits/EXECUTION_PROMPTS.md` — lesson exists
- `git cat-file -e <hash>` — commit reachable

Forward references are acceptable IF the prompt explicitly says they're
being created in this workstream (e.g., "this prompt creates Lesson #17");
unintentional forward references are bugs.

**Concrete example.** The doc-verification-sweep-2026-05-04.md UNVERIFIABLE
section flagged ARCH §2 / D-065 cross-referencing "Empirical Lesson #14" in
EXECUTION_PROMPTS.md before Lesson 14 had been written into the file — the
sweep correctly classified this as a forward-reference bug, not a content
bug. Distinguishing the two requires the resolvability check.

---

## Section 2: Mid-work checkpoints

> Applied as the cowork session does the work, before any commit.

### 2.1 Verification before claim (Lesson #16 operationalized)

Every factual claim in a deliverable (code comment, commit message, doc body,
surface report) is verified against ground truth before the deliverable
surfaces. Specifically:

| Claim type | Verification method |
|---|---|
| Numeric counts | `grep \| wc -l`, `find \| wc -l`, or SQL `COUNT(*)` |
| Table/column existence | Read the migration file AND query the staging schema dump (`audits/database-audit/staging-schema-2026-05-03.sql` or successor) |
| Function security mode | `pg_proc.prosecdef` query against staging — NOT inferred from authoring migration |
| Enum value list | `pg_type` / `pg_enum` query OR migration file `CREATE TYPE` source |
| File paths | `view` / `ls` |
| Commit hashes | `git show --stat <hash>` |
| Date claims | `git log --format=%ci <hash>` |
| CI run outcomes | `gh run view <run-id>` |
| Test counts | Run the test, count from output |

**Concrete example.** The doc-verification-sweep-2026-05-04.md found 14
factual errors that all had this in common — claimed without verifying.
Sample failures the sweep caught:

- ARCH §6.2 claimed `phone-changes.ts` had 8 functions including
  `commitPhoneChange`. The actual file has 8 exports but no
  `commitPhoneChange` (commit logic lives in the SQL RPC `change_phone_commit`).
- ARCH §8.6 claimed mig 098 added a `verification_method DEFAULT
  'patient_code'` column. The migration file adds three columns
  (`patient_code_hash`, `patient_code_generated_at`,
  `patient_code_expires_at`) — no `verification_method` exists.
- ARCH §6.2 / §12 / D-008 claimed `~95` distinct admin scopes in use.
  Actual `grep "createAdminClient(" packages/shared apps/clinic apps/patient
  | sort -u | wc -l` = 135.

### 2.2 Lesson #13 lockstep — concrete trigger list

Code or schema change requires a doc update in the same commit when:

- **New table or column** → `ARCHITECTURE.md` §5.X (matrix), §8.5 (table
  list), §8.6 (migration timeline + row count), and `DECISIONS_LOG.md` if
  the change codifies a decision.
- **New migration file** → `ARCHITECTURE.md` §3 file count + §8.6 timeline.
- **New `D-NNN` decision** → `DECISIONS_LOG.md` entry + cross-refs from
  `ARCHITECTURE.md` (the section that documents the affected surface) +
  `STATE_OF_WORK.md` (Methodology rules in force, if it codifies one).
- **RLS helper change** (security mode flip, new helper) → `ARCHITECTURE.md`
  §12 + `audits/EXECUTION_PROMPTS.md` Lesson #1 amendment.
- **Route handler signature change** (e.g., `request?: Request` →
  `request: Request`) → check Lesson #17 standing rule; ARCH §2 if it
  affects the path-alias / tsc-vs-build-gate model.
- **New admin scope used at a callsite** → `packages/shared/lib/supabase/
  admin.ts` `ALLOWED_ADMIN_SCOPES` + `ARCHITECTURE.md` §12 scope count +
  `DECISIONS_LOG.md` D-008 if the count crosses a documented threshold.
- **PRODUCT_SPEC.md phase reassignment** → both `PRODUCT_SPEC.md` and
  `DECISIONS_LOG.md` (the decision that promoted/demoted) — no orphan
  decisions.

If a change in one of those categories ships without the paired doc update,
the cowork session has violated lockstep. Mo will reject the deliverable.

**Concrete example.** D-072 promoted the patient app from Phase 2 to Phase 1
in DECISIONS_LOG.md but PRODUCT_SPEC.md still said "Patient App (Phase 2 —
After clinic adoption proven)" at the time of the doc-verification sweep.
The two docs disagreed for ~6 days. Lockstep requires the paired update.

### 2.3 Continuation rule application

Every workstream prompt has a continuation rule — typically "if X happens,
STOP and surface; if Y happens, keep going." The cowork session evaluates
the continuation rule at every checkpoint, not just at task end.
Specifically these are STOP triggers:

- Investigation surfaces broader scope than the prompt anticipated (e.g.,
  the prompt assumed 1 callsite, the cowork session finds 4).
- A fix is applied but doesn't take (e.g., tests still fail with the same
  signature after the patch).
- An empirical result contradicts an assumption embedded in the prompt
  (e.g., the prompt says X is true; verification shows X is false).
- A required input is missing or unreadable (e.g., the prompt references
  a file the cowork session can't find).

Continuing through them produces deliverables Mo will reject. The session
that produced Lesson #17 surfaced exactly this pattern: 6 consecutive failed
CI runs were a STOP signal that the prior amendment's empirical foundation
was wrong; continuing to author would have shipped a doubly-wrong amendment.

---

## Section 3: Surface format requirements

> A surface must contain THESE elements OR Mo will request the cowork
> session re-surface with the missing pieces.

### 3.1 Required elements in every surface

- A brief self-review summary stating what was done and against which
  criteria the deliverable was checked.
- Complete diff or full file content of every changed file (no
  "I also touched X" without the diff).
- Ground-truth verification output for any factual claim made in the
  deliverable (`grep` results quoted verbatim, SQL output quoted verbatim,
  `git show --stat` output quoted verbatim).
- Commit hash if committed, push status (e.g., "pushed to origin/main as
  commit `<hash>`; CI run <id> green / red / pending").
- One-line summary of the STATE_OF_WORK.md + 3 core docs update made in
  this commit.

### 3.2 Format conventions

- Diffs in fenced code blocks with old/new visible (` ```diff ` blocks).
- Commit messages quoted verbatim, not summarized — Mo audits message text.
- Verification output (grep results, SQL outputs, `git log` lines) quoted
  verbatim, not paraphrased.
- Cross-references include the resolved content, not just the reference
  ("D-064 says 'helpers default to SECURITY DEFINER unless internal queries
  provably do not trigger recursion'" — not just "see D-064").

### 3.3 What NOT to include

- Speculation about what Mo will think.
- "Probably won't be a problem" hedges. Either verify it's not a problem,
  or flag it as a known unknown.
- Apologies or self-criticism. Wastes tokens; Mo cares about the
  correctness, not the contrition.
- Redundant context-loading prose ("as we discussed, the sharing system
  has..."). Mo has the prior context.

---

## Section 4: Failure-mode catalog (patterns from past mistakes)

> Each entry: pattern → concrete example(s) from this project → discipline
> that prevents it.

### 4.1 Project-memory drift on enum / identifier values

**Pattern.** A canonical name evolves in code (enum value renamed,
identifier replaced) but project memory or prior-draft doc text retains
the old form. Doc shipped from memory restates the obsolete name.

**Examples (from doc-verification-sweep-2026-05-04.md):**

- ARCH §5.4 / D-061 / D-069 referred to `account_status='sentinel'` for the
  quarantine path. The actual `patient_account_status` enum (mig 073)
  contains `active | suspended | locked | deceased | merged` — no
  `sentinel`. The conceptual "sentinel" lives at
  `account_status='locked' AND normalized_phone IS NULL` (mig 076).
- ARCH §5.3 referred to `visibility_mode = DOCTOR_SCOPED`. The actual enum
  (mig 053) contains `DOCTOR_SCOPED_OWNER | CLINIC_WIDE | SHARED_BY_CONSENT`.
  The string `DOCTOR_SCOPED` does not exist.
- ARCH §6.2 / D-051 listed `commitPhoneChange` as one of phone-changes.ts's
  8 exports. The actual file has 8 exports but the commit logic is the SQL
  RPC `change_phone_commit`; there is no JS `commitPhoneChange`.

**Discipline that prevents it.** §2.1 verification-before-claim for every
enum value, function name, or identifier — query `pg_enum` / `pg_proc` /
`grep -n "^export" <file>` rather than recalling from memory.

### 4.2 Phantom claims (column / table / function never existed)

**Pattern.** A doc claims an artifact exists with a specific shape, but
no migration file or source file actually creates it. Often the artifact
was *planned* in a spec, then deferred or implemented differently, and the
doc never caught up.

**Examples (from doc-verification-sweep-2026-05-04.md):**

- ARCH §8.6 / D-066 claimed mig 098 added a `verification_method DEFAULT
  'patient_code'` column. Mig 098 adds three columns
  (`patient_code_hash`, `patient_code_generated_at`,
  `patient_code_expires_at`) and no `verification_method` column.
- ARCH §5.4 referenced an SQL function `normalize_egyptian_phone` (mig 071).
  Actual function is `normalize_phone_e164`; the name
  `normalize_egyptian_phone` appears nowhere in `supabase/migrations/`.
  The TS counterpart `normalizeEgyptianPhone` is real but is a separate
  thing.
- ARCH §5.5 listed `regenerated_at` on `patient_privacy_codes`. Actual
  column (mig 085) is `regenerated_count INTEGER`. There is no
  `regenerated_at`.

**Discipline that prevents it.** §2.1 cross-check against the migration
file AND the staging schema dump — both must show the artifact. If the
spec says it should exist but the dump shows it doesn't, the doc claim
is a forward reference and must be flagged as such, not stated as fact.

### 4.3 Count-shorthand drift

**Pattern.** Approximate counts (`~30`, `~95`, `~1100 lines`) are written
into docs, then the underlying surface grows or shrinks, and the
approximate count stays. The shorthand was a pointer to "this is roughly
the order of magnitude," but it's read as a fact.

**Examples (from doc-verification-sweep-2026-05-04.md):**

- ARCH §6.2 / §12 / D-008 claimed `~95` distinct admin scopes in use. Actual
  `createAdminClient` callsite scope strings: 135 unique values.
- ARCH §6.2 claimed phone-changes.ts is `~1100 lines`. Actual `wc -l`: 1388.
- ARCH §12 listed AuditAction enum bucket "Build 04, 11 entries". Actual
  count: 12 entries. Total enum size of 52 was correct, but the bucket
  breakdown summed to 51, off by one.
- D-005 claimed `@medassist/ui-clinic` has 26 components. Actual: 30.

**Discipline that prevents it.** When citing a count in a doc, run the
count fresh as part of authoring (not from memory) and quote the command
in the verification surface. When the count is approximate by design,
spell out the approximation method ("as of mig 108: ~30 scopes; precise
count drifts; see admin.ts for current") so readers know not to treat it
as a hard fact.

### 4.4 Forward references without flag

**Pattern.** A doc cross-references content that doesn't yet exist —
"see Lesson #14 in EXECUTION_PROMPTS.md", "tracked in Phase F Task 16"
— but the referenced content was never written. The cross-reference
becomes a dead link; readers chase a thing that isn't there.

**Examples (from doc-verification-sweep-2026-05-04.md):**

- ARCH §2 / D-065 referenced "Empirical Lesson #14" in EXECUTION_PROMPTS.md
  before Lesson #14 had been written into the file. The sweep flagged this
  as UNVERIFIABLE pending a human decision: write the lesson or fix the
  cross-ref.
- ARCH §6.2 / §12 / D-008 referenced "Phase F Task 16" tracking the admin
  scope reconciliation. PROGRAM_STATE.md Phase F task list at the time
  contained tasks 1–9 only — Task 16 didn't exist. (Task 16 was queued
  in `audits/discipline-cleanup/inventory-2026-05-04.md` as "planned" but
  not yet promoted to PROGRAM_STATE.md.)

**Discipline that prevents it.** §1.3 cross-reference resolvability check.
Every `D-NNN`, `Lesson #N`, `Phase F Task N`, `TD-NNN`, `§X.Y`, and commit
hash in a deliverable is checked to resolve before commit. Forward
references are acceptable but must be marked as such ("(planned; lands
in this workstream)" or "(deferred to Phase F Task NN; not yet on the
canonical task list)").

### 4.5 Misattribution of cause

**Pattern.** A symptom is observed, a candidate cause is identified, the
fix-credit is assigned to that candidate without verifying it actually
made the symptom go away. When the symptom recurs, the doc still credits
the wrong cause; future readers chase the wrong fix.

**Example (from session history, 2026-05-07):**

The Lesson #14 amendment shipped in commit `134e272` claimed `9774252`'s
webpack-alias additions were the operational fix for CI run 25475031898's
opaque exit-code-1 failure. Empirical disproof: runs 118 (`aa2b991`), 119
(`134e272`), and 120 (`f766a05`) all failed *post-*`9774252` with the same
opaque exit code 1. The actual fix (one-character `?` removal in
`packages/shared/lib/api/handlers/patient/sharing/handler.ts:27`) shipped
two commits later as `80ee270`; CI run 25539467112 went green. Mo
reframed the Lesson #14 / ARCH §2 / D-065 amendments via annotation
(commit `bad1100`) and codified Lesson #17 to lock the correct rule
("`tsc --noEmit` does not enforce Next route-handler type contracts").

**Discipline that prevents it.** §1.1 empirical claim verification —
when a fix is credited, verify it actually fixed the symptom: the
post-fix CI run is green, the post-fix repro case passes. If you can't
verify the symptom went away with the fix in place, don't credit the fix.

### 4.6 Off-by-amend hash artifacts

**Pattern.** A commit gets `git commit --amend`-ed (typically to fix the
message or add a missed file), creating a new commit with a new hash.
Surrounding docs that recorded the pre-amend hash are now pointing at
an unreachable orphan. Future readers debugging "why does this commit
hash not exist?" can't tell whether the doc is wrong or the commit was
rebased away.

**Examples (from session history):**

- `d8daa60 → bad1100` in STATE_OF_WORK.md's CI fix-attribution entry.
  The original commit was amended; STATE_OF_WORK.md kept the pre-amend
  hash. Caught and corrected inline in Phase F Task 10's commit on
  2026-05-08, with a parenthetical annotation preserving the original
  incorrect hash for audit trail.
- `5ad4003 → 0abce28` in STATE_OF_WORK.md's Phase F Task 10 closure
  entry — same pattern, second instance. Caught by §1.2 STATE_OF_WORK
  currency check during pre-work verification for *this very doc's*
  authoring session. Corrected inline in this commit per Mo's ruling
  (Path 2: bundle the fix into the REVIEW_CRITERIA.md commit, with an
  annotation matching the `d8daa60 → bad1100` precedent).

**Discipline that prevents it.** §1.2 STATE_OF_WORK currency check —
verify HEAD matches recorded commits before adding new entries. When
correcting an off-by-amend hash, never silently overwrite — preserve
the audit trail with a parenthetical: `(originally recorded as <pre>;
off-by-amend artifact, corrected <date> per <reason>)`. Future readers
debugging will see what was originally recorded and why it changed.

The §1.2 gate caught the second instance during this very doc's
authoring. That bug fix shipped in the same commit that codified the
discipline — the gate works and is empirically demonstrated.

---

## Section 5: Push-back authorization

> The cowork session has explicit authority to push back on Mo's prompts.

When the cowork session must push back, not execute:

- The prompt's empirical claims contradict ground truth (Section 1.1).
- The prompt's scope is internally inconsistent (e.g., asks to "fix all
  callsites" but lists only 2 of 4 known callsites).
- The prompt's continuation rule is missing for high-stakes work
  (multi-table migrations, RLS helper edits, security-parameter changes).
- The prompt asks for a deliverable that violates Lesson #13 lockstep
  (e.g., "ship the code change without doc updates").
- The prompt's verification methodology won't actually verify what it
  claims to verify (e.g., asks for "tsc clean" as proof a Next route
  handler builds — Lesson #17 says it isn't).

**How to push back:**

1. Surface the issue at task start, before authoring any work.
2. Quote the problematic prompt text verbatim.
3. State the contradiction or gap.
4. Propose 1-2 resolution paths.
5. Wait for Mo's ruling.

The expectation is NOT obedience — it's correctness. A cowork session
that executes a flawed prompt and ships wrong work has failed the same
discipline a Mo-authored prompt would have failed. Mo's prompts are
input data, not infallible spec.

---

## Section 6: Maintenance

This doc is part of the lockstep set: `ARCHITECTURE.md`,
`DECISIONS_LOG.md`, `PRODUCT_SPEC.md`, `audits/STATE_OF_WORK.md`,
`audits/EXECUTION_PROMPTS.md`, `audits/REVIEW_CRITERIA.md`. It updates
when the review framework evolves. Specific update triggers:

- New Empirical Lesson codified in `EXECUTION_PROMPTS.md` → check whether
  it introduces a new criterion here. Lesson #17, for instance, fed
  Section 4.5 (Misattribution of cause) and Section 5 ("verification
  methodology won't actually verify what it claims to verify").
- Mo provides feedback that contradicts an existing criterion → update
  the criterion or document the exception inline. Don't accumulate
  exceptions silently.
- A class of Mo-rejected deliverable surfaces a new failure mode → add
  to Section 4 catalog. Section 4 grows empirically; abstract entries
  without project-specific examples are cut.

**Cross-referenced from:**

- `audits/STATE_OF_WORK.md` "Session protocol" — required reading at
  every cowork session start, alongside STATE_OF_WORK.md itself.
- The standing prompt-template note in STATE_OF_WORK.md "Session protocol"
  — every workstream prompt cites this doc's §1.1 pre-work verification
  gate.
- `ARCHITECTURE.md` §16 — listed as part of the lockstep doc set.
- `audits/EXECUTION_PROMPTS.md` "Empirical lessons" preamble — pointed
  to as the operational distillation of Lessons #1-#17 into a checklist
  cowork sessions can run mechanically.

**First empirical evidence the gate works:** while authoring this very
doc, §1.2's STATE_OF_WORK currency check caught the `5ad4003 → 0abce28`
off-by-amend artifact in line 125 of STATE_OF_WORK.md before any
authoring began. The fix shipped in the same commit that codified the
discipline. See §4.6.
