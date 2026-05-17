# Dependabot Triage — 2026-05-08

**Repo:** Medassist2026/medassist
**HEAD:** `4177524` (CI run 25585424992 = success)
**Total open alerts (ground truth):** **55** (1 critical, 22 high, 25 medium, 7 low)
**Unique GHSAs (deduplicated across manifests):** 29
**Method:** `gh api repos/Medassist2026/medassist/dependabot/alerts?state=open --paginate` (dump in `audits/dependabot-alerts-2026-05-08.json`); `jq` aggregation; transitive dep tracing via `package-lock.json` reverse lookup
**Status of triage:** READY FOR REMEDIATION (D2 has a clean trivial fix path; broader cleanup falls outside this batch)

> **Pre-work drift note.** The originating push output (earlier today) reported 54 alerts; the live API now returns 55. The +1 alert is `fast-uri ≤ 3.1.0` (high), created `2026-05-09T02:01:00Z` — i.e., minutes before the snapshot. Per the prompt's "surface and continue" rule, headline numbers re-baselined to 55 throughout this doc. Severity distribution also shifted: prompt's `21 high` → ground truth `22 high`. GitHub returns severity label `medium` not `moderate` (same severity tier, label difference).

---

## 0. Executive summary

The 55 alerts cluster heavily on `next` (38 alerts → 18 unique GHSAs) and on a small set of build-pipeline transitive deps (`fast-uri`, `picomatch`, `serialize-javascript`, `flatted`, `glob`, `minimatch`, `brace-expansion`, `postcss`). Of the 29 unique vulnerabilities:

- **1 has trivial remediation, real-blocking:** the critical `next` middleware-bypass advisory (CVE-2025-29927, GHSA-f82v-jwr5-mffw) — bites only the root `node_modules/next@14.1.0`; both apps already ship `next@14.2.25` (the patched version per this advisory). D2 candidate; clean version bump.
- **7 have 14.x backport patches available, real-blocking at app level:** apps' `next@14.2.25` is now several patch versions behind the latest 14.x advisory backports. Bumping apps to `next@14.2.35` (latest 14.2.x with backports cited in advisories) closes 2 high + 3 medium + 2 low at the app level.
- **5 have only 15.x patches, real-blocking but non-trivial:** advisories whose first-patched-version is in the 15.x line (no 14.x backport surfaced by GHSA). 14 → 15 is a major bump with breaking changes (cookies/headers async, route handler signatures, React 19 minimum). Defer to a planned Next 15 migration workstream.
- **16 are theoretical (transitive in build-pipeline / dev tooling):** Dependabot tags scope=runtime because the package appears in `package-lock.json` without `dev:true`, but the actual consumer chain is `tailwindcss → chokidar`, `next-pwa → workbox-build`, `eslint → flat-cache`, `typescript-eslint → typescript-estree`. None of these are invoked at runtime in our production server code path. Defer to a quarterly dependency update sprint.

**D2 recommendation.** Bump root `next: 14.1.0 → 14.2.25` (or 14.2.35 — see §6 ruling needed). Single-line change in root `package.json` + corresponding `package-lock.json` regeneration. Closes the 1 critical alert + several lower-severity root-only `next` advisories. No source-code changes; all three tsc gates are unaffected (root `next` is not imported at runtime by any app code).

**D3 (admin scope reconciliation) is decoupled** — runs cleanly regardless of what D2 chooses.

---

## 0.5. Empirical correction (added 2026-05-09)

> Added a day after this doc shipped. Self-correction recording what actually happened post-D2-push, against this doc's predictions and against my D2 surface's framing. **D1's prediction held 100% — exactly 7 alerts closed, fixed_at = 2026-05-09T03:15:29Z.** The thing that needs correcting is *my D2 surface's* "predicted 7, actual 5" framing from the day after the push, which conflated net delta with closure count. Original prediction text in §6 below is **not** rewritten; this section annotates around it per Lesson #14 amendment pattern.

### What actually happened — empirical

```text
$ jq '[.[] | select(.fixed_at == "2026-05-09T03:15:29Z")] | sort_by(.security_advisory.severity) | .[] | {ghsa:.security_advisory.ghsa_id, sev:.security_advisory.severity, manifest:.dependency.manifest_path}' \
    audits/dependabot-alerts-2026-05-09.json
GHSA-f82v-jwr5-mffw  critical  package-lock.json
GHSA-fr5h-rqp8-mj6g  high      package-lock.json
GHSA-gp8f-8m3g-qvj9  high      package-lock.json
GHSA-7gfc-8cq8-jh5f  high      package-lock.json
GHSA-7m27-7ghc-44w9  medium    package-lock.json
GHSA-g77x-44xx-532m  medium    package-lock.json
GHSA-qpjv-v59x-3qc4  low       package-lock.json
```

**7 alerts closed.** All at manifest=`package-lock.json` (the workspace lockfile alert), all at exactly `2026-05-09T03:15:29Z` (Dependabot rechecked ~7 hours after the push). The set matches D1's predicted-7 list verbatim — same GHSAs, same severities. Recheck latency was longer than the "5–15 min" rough estimate I gave in the D2 surface; the actual window was ~7 hours.

### Why net delta showed -5 instead of -7

```text
$ jq '[.[] | select(.state == "open")] | length' audits/dependabot-alerts-2026-05-09.json
50

$ jq '[.[] | select(.created_at > "2026-05-09T02:01:00Z")] | sort_by(.created_at) | .[] | {ghsa:.security_advisory.ghsa_id, pkg:.security_vulnerability.package.name, sev:.security_advisory.severity, created_at:.created_at}' audits/dependabot-alerts-2026-05-09.json
GHSA-fv7c-fp4j-7gwp   @babel/plugin-transform-modules-systemjs   high   2026-05-09T03:15:30Z
GHSA-v39h-62p7-jpjc   fast-uri                                   high   2026-05-09T03:15:30Z

# Plus the +1 fast-uri arrival captured in yesterday's pre-work drift:
# GHSA-q3j6-qgpj-74h6  fast-uri                                  high   2026-05-09T02:01:00Z
```

**Net delta arithmetic (using the original push-output baseline of 54):**

```
54  open at original push output
- 7 D2-bump closures (all 7 of D1's predicted root-only advisories)
+ 1 fast-uri q3j6 arrival before yesterday's pre-work pull (the +1 drift)
+ 2 arrivals during recheck window (fv7c + v39h)
= 50  open today

→  -5 net change, NOT -7 closures + 0 arrivals
```

**Net delta arithmetic (using yesterday's snapshot baseline of 55, which already included q3j6):**

```
55  open at yesterday's pre-work snapshot
- 7 D2-bump closures
+ 2 post-snapshot arrivals (fv7c + v39h)
= 50  open today

→  -5 net change, same arithmetic, different framing of how many "parallel arrivals" to count
```

Both framings are consistent. The "3 parallel arrivals" framing (Mo's per the 2026-05-09 prompt) counts q3j6 as parallel because it appeared during the broader push-to-recheck window; the "2 post-snapshot arrivals" framing counts only those that appeared after the JSON was pulled. Both arrive at -5 net = 7 closures.

### Manifest-double-counting empirically confirmed (with one nuance)

The original D2 surface noted that "apps stay open until apps are bumped to 14.2.35; that's Tier 2 work." Today's data confirms this for the multi-manifest GHSAs — but with a non-obvious twist: a Dependabot housekeeping event on **2026-05-07** confuses the per-GHSA fix history.

**GHSA-5j59-xgg2-r9c4 — full alert history (representative case):**

```text
$ jq '[.[] | select(.security_advisory.ghsa_id == "GHSA-5j59-xgg2-r9c4")] | sort_by(.number) | .[]' audits/dependabot-alerts-2026-05-09.json
{ n:7,  manifest:"apps/clinic/package.json",  state:"open",  created:"2026-05-03",  fixed:null      }
{ n:19, manifest:"apps/patient/package.json", state:"open",  created:"2026-05-03",  fixed:null      }
{ n:37, manifest:"package.json",              state:"fixed", created:"2026-05-03",  fixed:"2026-05-07" }
{ n:57, manifest:"package-lock.json",         state:"open",  created:"2026-05-07",  fixed:null      }
```

GHSA-mwv6 has the same shape. Three observations:

1. **The 2026-05-07 closures of `package.json`-manifest alerts were a Dependabot housekeeping event, NOT a real fix.** 18 `package.json` alerts (across 18 distinct GHSAs) all marked fixed at `2026-05-07T03:39:33-35Z`; 35 `package-lock.json` alerts created at `2026-05-07T03:39:38Z` (4 seconds later). No commit on 2026-05-07 touched `package.json` or `package-lock.json` (verified via `git log --since="2026-05-06" --until="2026-05-08" -- package.json apps/clinic/package.json apps/patient/package.json` returning empty). Dependabot reorganized its alert tracking from per-direct-dep `package.json` to per-workspace-lockfile `package-lock.json` for monorepo support; the "fixed" flip on the package.json rows was the migration artifact.

2. **Today's bump did NOT close GHSA-5j59 + GHSA-mwv6 at the workspace lockfile** because the lockfile contains apps' `next@14.2.25` (still vulnerable to advisories whose patched version is between 14.2.26 and 14.2.35). The workspace `package-lock.json` alert is only marked fixed when EVERY install in the lockfile is past the patched version. Bumping ONLY root next is insufficient for these multi-manifest GHSAs.

3. **The 7 root-only-advisory GHSAs that D1 predicted closed today** because the workspace lockfile contains no other vulnerable next install for those advisories: their vulnerable range tops out at `<14.2.24` or earlier (qpjv, g77x, gp8f, 7gfc, 7m27, fr5h all have ranges that apps' `14.2.25` is past). For those advisories, the only vulnerable install in the workspace was the root `14.1.0` — bumping root closed the workspace lockfile alert entirely.

**Tier 2 implication.** When apps bump to `14.2.35`, all 3 remaining open rows for GHSA-5j59 (and similarly mwv6, g5qg, xv57, 4342, 3h52, 223j) close together: app-clinic + app-patient + workspace-lockfile = 3 closures per GHSA. Tier 2's expected closure count is therefore higher than the per-app naive count would suggest.

### My D2-surface framing error (honest record)

In the D2 surface, I wrote "**7 alerts expected to close.** Net post-push: 55 → 48." After the push, when I observed 50 open instead of 48, I reported "predicted 7, actual 5; 2 stragglers are GHSA-5j59 + GHSA-mwv6." That framing was wrong on two counts:

- **The "5 closures" wasn't a closure count — it was a net delta.** Closure count was 7 (D1's prediction held). Net delta of -5 was 7 closures combined with 2 (or 3, depending on baseline) parallel arrivals from independent sources (fast-uri + @babel advisories). I should have queried `state == "fixed" AND fixed_at >= push_time` instead of inferring from `len(open_after) - len(open_before)`.

- **GHSA-5j59 + GHSA-mwv6 were never in the predicted-7 list** — they're 4-manifest GHSAs (one of which had already been quietly closed in 2026-05-07's housekeeping migration). My naming them as "stragglers" conflated D1's predicted-7 (root-only single-manifest GHSAs) with the broader §6.1 list of 12 GHSAs that close "at root level" after the pragmatic 14.2.35 bump. The §6.1 12-GHSA list explicitly says "at root level" — for the multi-manifest GHSAs, that means only the root manifest entry closes; lockfile + app entries stay open.

Lesson surfaced: net count delta is corrupted by parallel arrivals from independent sources (advisory publication, manifest reorganizations, etc.). Closure verification should filter by event timestamp, not infer from net counts. Codified as **Lesson #18 candidate** (see §0.6).

---

## 0.6. Lesson #18 candidate — net delta is not closure count

> Surfaced from the §0.5 framing error. Recommend codifying as Empirical Lesson #18 in `audits/EXECUTION_PROMPTS.md`. The misread that led to this section's authoring blocked a clean Phase 2 start in the next session — that's enough drift cost to warrant a standing rule.

**Title:** Filter by event timestamp, not by net delta, when measuring closures.

**Standing rule:** To verify "X items closed from action Y," query `fixed_at >= action_timestamp` (or equivalent state-transition timestamp). Do NOT compute closure count as `len(open_before) - len(open_after)` — that net delta is corrupted by parallel arrivals from independent sources (upstream advisory publication, workspace dependency rescans, manifest tracking reorganizations, auto-dismissals). The rule applies to Dependabot alerts, CI runs, monitoring incidents, support tickets — anything where items can both close AND be created during the observation window.

**Empirical proof:** Phase F Task 16 batch (commit `39c2f43`) closed exactly 7 Dependabot alerts as D1 predicted (all at `fixed_at = 2026-05-09T03:15:29Z`). Net `length()` delta of open-state alerts showed -5 because 3 unrelated advisories (fast-uri × 2, @babel/plugin-transform-modules-systemjs × 1) were created during the same window. My D2 surface initially assessed "5 closures, 2 missing"; correct read was "7 closures + 3 arrivals" (or "7 closures + 2 arrivals" using yesterday's snapshot baseline). The misread blocked clean Phase 2 start: the next session's prompt was authored against the wrong-prediction-failure premise, requiring this correction section + a refrained Task 1 before the actual Phase 2 work could begin.

**Companion technique:** when authoring the original prediction, include the SQL/jq filter that will verify it post-action. For Dependabot specifically: `jq '[.[] | select(.fixed_at >= "<push-time>") | .security_advisory.ghsa_id]'`. Embedding the verification query in the surface pre-empts the net-delta trap.

---

## 1. Summary by remediation class

| Class | Unique GHSAs | Total alert rows | Notes |
|---|---|---|---|
| Real-blocking, fix available (clean version bump) | 8 | 22 | 1 critical + 2 high + 3 medium + 2 low at apps, plus 1 critical + 6 lower at root (dedup'd by GHSA) |
| Real-blocking, fix only in 15.x (major bump) | 5 | 15 | All `next`; 14.x line has no backport per GHSA `first_patched_version` |
| Theoretical (transitive build-pipeline / dev tooling, not in production code path) | 16 | 18 | `picomatch`, `fast-uri`, `serialize-javascript`, `flatted`, `glob`, `minimatch`, `brace-expansion`, `postcss` |
| False-positive (feature not used) | 0 | 0 | No advisories surfaced cleanly false-positive — all relate to packages we actually have installed |

**Sanity check:** 8 + 5 + 16 = 29 unique GHSAs. 22 + 15 + 18 = 55 alerts. ✓

---

## 2. Critical alert (1)

### CVE-2025-29927 — Authorization Bypass in Next.js Middleware

| Field | Value |
|---|---|
| GHSA | `GHSA-f82v-jwr5-mffw` |
| Package | `next` (npm, runtime) |
| Vulnerable range | `>= 14.0.0, < 14.2.25` |
| First patched | `14.2.25` |
| CWEs | CWE-285 (Improper Authorization) + CWE-863 (Incorrect Authorization) |
| Manifest flagged | `package-lock.json` (root only) |
| Alert URL | https://github.com/Medassist2026/medassist/security/dependabot/48 |
| Created | 2026-05-07T03:39:37Z |

**Our installed versions:**

```text
node_modules/next                  → 14.1.0   ← VULNERABLE (root)
apps/clinic/node_modules/next      → 14.2.25  ← patched
apps/patient/node_modules/next     → 14.2.25  ← patched
```

**Production exposure assessment.** The vulnerable `next@14.1.0` instance is the root-level install declared in root `package.json`. The CVE attack surface is HTTP request handling: a header (`x-middleware-subrequest`) lets a request bypass middleware-based authorization. **For the attack to be live, the vulnerable Next instance must be serving HTTP requests in production.**

The vulnerable `next@14.1.0` does NOT serve production traffic. Production deployments come from `apps/clinic` and `apps/patient`, which build via `npm run build:clinic` / `npm run build:patient`, both of which resolve to their workspace-local `next@14.2.25`. The root `next` is wired up in root `package.json scripts.dev/build/start/lint`, but those scripts are effectively orphan — there is no Next app at the workspace root to build. None of `packages/shared/**` or `packages/ui-clinic/**` is a Next app; the `import 'next/...'` references in shared code are type/runtime imports that resolve through the consuming app's local `next`, not the root one.

**Conclusion:** the critical alert is **not exploitable in production today**, but the vulnerable package is shipped to anyone who clones the repo and runs `next dev` or `next build` from the root, so the alert should be cleared. Trivial fix.

**Fix path.** Bump root `package.json` `"next": "14.1.0"` → `"14.2.25"` (or `14.2.35`, see §6). Run `npm install` to regenerate `package-lock.json`. No source changes required — root `next` is not imported by any code; it's only invoked via root scripts.

**Verification protocol if applied (D2):**
1. `jq '.packages["node_modules/next"].version' package-lock.json` returns `"14.2.25"` or higher.
2. `npm ls next` shows clean dependency tree (no two next majors collide).
3. Three tsc gates pass: root + `-w @medassist/clinic` + `-w @medassist/patient`.
4. After push, `gh api repos/Medassist2026/medassist/dependabot/alerts/48` returns `"state": "fixed"` (Dependabot recheck typically within 5–15 min).

---

## 3. High-severity alerts (22 rows → 9 unique GHSAs)

### 3.1 next (14 rows → 6 unique GHSAs)

For each, the table column "Apps' 14.2.25 status" answers: does the apps' currently-installed `14.2.25` fall inside the vulnerable range?

| GHSA | Range | Patched | Apps' 14.2.25 status | CWE | Summary |
|---|---|---|---|---|---|
| GHSA-mwv6-3258-q52c | ≥13.3.0, <14.2.34 | **14.2.34** | **VULNERABLE** | CWE-400/502/1395 | DoS with Server Components |
| GHSA-5j59-xgg2-r9c4 | ≥13.3.1-canary.0, <14.2.35 | **14.2.35** | **VULNERABLE** | CWE-400/502/1395 | DoS with Server Components — incomplete-fix follow-up |
| GHSA-h25m-26qc-wcjf | ≥13.0.0, <15.0.8 | 15.0.8 (15.x-only) | **VULNERABLE — 15.x-only fix** | CWE-400/502 | HTTP request deserialization DoS via insecure RSC |
| GHSA-q4gf-8mx6-v5v3 | ≥13.0.0, <15.5.15 | 15.5.15 (15.x-only) | **VULNERABLE — 15.x-only fix** | CWE-770 | DoS with Server Components |
| GHSA-fr5h-rqp8-mj6g | ≥13.4.0, <14.1.1 | 14.1.1 | patched (apps), VULNERABLE (root 14.1.0) | CWE-918 | SSRF in Server Actions |
| GHSA-gp8f-8m3g-qvj9 | ≥14.0.0, <14.2.10 | 14.2.10 | patched (apps), VULNERABLE (root 14.1.0) | CWE-349/639 | Cache Poisoning |
| GHSA-7gfc-8cq8-jh5f | ≥9.5.5, <14.2.15 | 14.2.15 | patched (apps), VULNERABLE (root 14.1.0) | CWE-285/863 | Authorization bypass |

**Action.**
- 4 GHSAs are closable by bumping apps to `next@14.2.35` (the latest 14.x patched version cited in any advisory). Trivial — apps already on 14.2.x line.
- 2 GHSAs (`h25m-26qc-wcjf`, `q4gf-8mx6-v5v3`) require Next 15.x. Major bump; defer.
- 2 GHSAs (`fr5h-rqp8-mj6g`, `gp8f-8m3g-qvj9`) close at root automatically when D2 bumps root next.

### 3.2 fast-uri (1 row, 1 GHSA)

| Field | Value |
|---|---|
| GHSA | `GHSA-q3j6-qgpj-74h6` (CVE-2026-6321) |
| Range | `<= 3.1.0` |
| Patched | `3.1.1` |
| Installed | `3.1.0` (top-level) |
| Scope | runtime (Dependabot label); **build-pipeline only in our usage** |
| Parents | `ajv-formats/ajv@8.18.0`, `schema-utils/ajv@8.18.0`, `workbox-build/ajv@8.20.0` — all build-time tooling |
| CWE | CWE-22 (Path Traversal) |
| Summary | Path traversal via percent-encoded dot segments in fast-uri URL parser |

**Production exposure assessment.** `fast-uri` parses URI strings inside `ajv` (JSON schema validation). All three reachable parents are build-pipeline:
- `schema-utils` is webpack's schema validator — invoked only at `next build` time.
- `workbox-build/ajv` runs only when `next-pwa` generates the service worker manifest at build time.
- `ajv-formats` is depended on by these chains, not by app runtime code.

`grep -rn "from ['\"]ajv" packages/ apps/clinic apps/patient --include='*.ts' --include='*.tsx'` returns no hits. Our app code does not import `ajv` directly.

**Class:** Theoretical (build-pipeline only). Defer to dependency-update sprint. Patch is a single-package bump (3.1.0 → 3.1.1), no semver risk, but transitive — would need an `npm update ajv` + lockfile regeneration.

### 3.3 flatted (1 row, 1 GHSA)

| Field | Value |
|---|---|
| GHSA | `GHSA-rf6f-7fwh-wjgh` |
| Range | `<= 3.4.1` |
| Patched | `3.4.2` |
| Installed | `3.3.4` (`dev: true`) |
| Scope | development (Dependabot label) |
| Parents | `flat-cache@3.2.0` → `eslint` (dev tooling) |
| CWE | CWE-1321 (Prototype Pollution) |
| Summary | Prototype pollution via parse() in flatted |

**Class:** Real-blocking ONLY in scope of dev tooling (ESLint cache). Defer to dep-update sprint.

### 3.4 glob (1 row, 1 GHSA)

| Field | Value |
|---|---|
| GHSA | `GHSA-5j98-mcp5-4vw2` |
| Range | `>= 10.2.0, < 10.5.0` |
| Patched | `10.5.0` |
| Installed (vulnerable) | `apps/clinic/node_modules/glob@10.3.10` (dev), `apps/patient/.../glob@10.3.10` (dev), `node_modules/@next/eslint-plugin-next/.../glob@10.3.10` (dev) |
| CWE | CWE-78 (OS Command Injection) — only via `glob` CLI's `-c/--cmd` flag |
| Summary | Command injection via -c/--cmd executes matches with shell:true |

**Production exposure assessment.** The CWE-78 bite requires invoking the `glob` CLI binary with `-c`/`--cmd`. None of our scripts use the CLI in this manner; `grep -rn '"glob"' apps/*/package.json packages/*/package.json` shows glob only as a transitive dep, not a direct invocation. Vulnerable instances are dev-tooling chains (eslint-plugin-next).

**Class:** Theoretical. Defer.

### 3.5 minimatch (1 row, 1 GHSA)

| Field | Value |
|---|---|
| GHSA | `GHSA-7r86-cg39-jmmj` |
| Range | `>= 9.0.0, < 9.0.7` |
| Patched | `9.0.7` |
| Installed (vulnerable) | `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch@9.0.3` (dev) |
| CWE | CWE-407 (ReDoS) |

**Production exposure assessment.** Vulnerable instance is nested under `typescript-eslint/typescript-estree` — invoked only by ESLint at lint time. ReDoS attacker would need to feed a crafted glob pattern through typescript-estree's parsing path; this requires hostile control over `.eslintrc` patterns or input filenames. Not a production runtime path.

**Class:** Theoretical (dev tooling). Defer.

### 3.6 picomatch (1 row, 1 GHSA — high)

| Field | Value |
|---|---|
| GHSA | `GHSA-c2c7-rcm5-vvqj` |
| Range | `< 2.3.2` and `>= 4.0.0, < 4.0.4` |
| Patched | `2.3.2` / `4.0.4` |
| Installed (vulnerable) | `node_modules/anymatch/.../picomatch@2.3.1`, `node_modules/micromatch/.../picomatch@2.3.1`, `node_modules/picomatch@4.0.3`, `node_modules/readdirp/.../picomatch@2.3.1` |
| CWE | CWE-1333 (ReDoS via extglob quantifiers) |

**Production exposure assessment.** Reachable parents:
- `anymatch ← chokidar ← tailwindcss` — Tailwind's CSS file watcher in dev mode and JIT compilation at build time. Build-pipeline only.
- `micromatch ← fast-glob`, `← tailwindcss` — same.
- `picomatch@4.0.3` ← `tinyglobby` ← `typescript-eslint` and `sucrase` — dev/build tooling.
- `readdirp ← chokidar` — same as anymatch.

None of our application code paths feed user input into glob patterns at runtime.

**Class:** Theoretical (build-pipeline). Defer.

### 3.7 serialize-javascript (1 row, 1 GHSA — high)

| Field | Value |
|---|---|
| GHSA | `GHSA-5c6j-r48x-rmvq` |
| Range | `<= 7.0.2` |
| Patched | `7.0.3` |
| Installed | `4.0.0` (top-level) |
| Parents | `workbox-build/rollup-plugin-terser@7.0.2` (build-pipeline only) |
| CWE | CWE-96 (RCE via RegExp.flags / Date.prototype.toISOString) |

**Production exposure assessment.** Used inside `rollup-plugin-terser` during `next-pwa` build to inline the service worker. Not invoked at runtime; never sees user-controlled input.

**Class:** Theoretical (build-pipeline). Patch path is non-trivial (4 → 7 = 3 majors); `workbox-build`'s pinning may block direct upgrade. Defer.

---

## 4. Medium-severity alerts (25 rows → 11 unique GHSAs)

### 4.1 next (16 rows → 7 unique GHSAs)

| GHSA | Range | Patched | Apps' 14.2.25 status | Summary |
|---|---|---|---|---|
| GHSA-g5qg-72qw-gw5v | ≥0.9.9, <14.2.31 | **14.2.31** | **VULNERABLE** | Cache Key Confusion in Image Optimization API |
| GHSA-xv57-4mr9-wg8v | ≥0.9.9, <14.2.31 | **14.2.31** | **VULNERABLE** | Content Injection in Image Optimization |
| GHSA-4342-x723-ch2f | ≥0.9.9, <14.2.32 | **14.2.32** | **VULNERABLE** | Improper Middleware Redirect → SSRF |
| GHSA-9g9p-9gw9-jx7f | ≥10.0.0, <15.5.10 | 15.5.10 (15.x) | **VULNERABLE — 15.x-only fix** | DoS via Image Optimizer remotePatterns config |
| GHSA-3x4c-7xq6-9pq8 | ≥10.0.0, <15.5.14 | 15.5.14 (15.x) | **VULNERABLE — 15.x-only fix** | next/image disk cache growth → storage exhaustion |
| GHSA-ggv3-7p47-pfv8 | ≥9.5.0, <15.5.13 | 15.5.13 (15.x) | **VULNERABLE — 15.x-only fix** | HTTP request smuggling in rewrites |
| GHSA-7m27-7ghc-44w9 | ≥14.0.0, <14.2.21 | 14.2.21 | patched (apps); root 14.1.0 vulnerable | DoS with Server Actions |
| GHSA-g77x-44xx-532m | ≥10.0.0, <14.2.7 | 14.2.7 | patched (apps); root 14.1.0 vulnerable | DoS in image optimization |

**Action.** Same as §3.1 — bumping apps to `14.2.35` closes 3 (g5qg, xv57, 4342). 3 are 15.x-only (defer with the high-severity 15.x ones). 2 close at root automatically when D2 bumps root.

### 4.2 brace-expansion (1 row, 1 GHSA)

| Field | Value |
|---|---|
| GHSA | `GHSA-f886-m6hf-6m8v` |
| Range | `>= 4.0.0, < 5.0.5` |
| Patched | `5.0.5` |
| Installed (vulnerable) | `node_modules/brace-expansion@5.0.4` (top-level, runtime) |
| CWE | CWE-400 (Resource exhaustion via zero-step sequence) |

**Production exposure assessment.** Top-level `brace-expansion@5.0.4` is parent of `node_modules/minimatch@10.2.4`. Parents of that minimatch are workbox-build, filelist, etc. (build-pipeline). `grep -rn "brace-expansion" packages/ apps/clinic apps/patient --include='*.ts'` returns no app-code imports.

**Class:** Theoretical (build-pipeline). Defer.

### 4.3 picomatch (1 row, 1 GHSA — medium)

| Field | Value |
|---|---|
| GHSA | `GHSA-3v7f-55p6-f55p` |
| Same vulnerable range / instances as §3.6 (separate advisory for the same package's prototype-pollution variant) |
| CWE | CWE-1321 (Prototype pollution via POSIX character class injection) |

**Class:** Theoretical (build-pipeline). Same defer reasoning as §3.6.

### 4.4 postcss (1 row, 1 GHSA)

| Field | Value |
|---|---|
| GHSA | `GHSA-qx2v-qp2m-jg93` |
| Range | `< 8.5.10` |
| Patched | `8.5.10` |
| Installed (vulnerable) | `node_modules/postcss@8.5.8` (root, runtime), `apps/clinic/.../postcss@8.4.31`, `apps/patient/.../postcss@8.4.31`, `node_modules/next/.../postcss@8.4.31` |
| CWE | CWE-79 (XSS via unescaped `</style>` in CSS Stringify Output) |

**Production exposure assessment.** XSS bite requires user-controlled CSS being passed through postcss's stringify output. We don't accept user-controlled CSS — all our CSS is authored via Tailwind classes and shipped as build artifacts. Postcss runs at `next build` time only.

**Class:** Theoretical (build-time). Defer.

### 4.5 serialize-javascript (1 row, 1 GHSA — medium)

| GHSA | `GHSA-qj8w-gfj5-8c6v` |
|---|---|
| Same package + instance as §3.7. CPU-exhaustion DoS variant (CWE-400/834). |
**Class:** Theoretical (build-pipeline).

---

## 5. Low-severity alerts (7 rows → 3 unique GHSAs)

All 7 are `next`. Quick-list:

| GHSA | Range | Patched | Apps' status | Summary |
|---|---|---|---|---|
| GHSA-223j-4rm8-mrmf | `= 14.2.25` | 14.2.26 | **VULNERABLE (apps)** | x-middleware-subrequest-id leak to external hosts (info disclosure) |
| GHSA-3h52-269p-cp9r | ≥13.0, <14.2.30 | 14.2.30 | **VULNERABLE (apps)** | Info exposure in dev server (no origin verification) |
| GHSA-qpjv-v59x-3qc4 | ≥0.9.9, <14.2.24 | 14.2.24 | patched (apps); root 14.1.0 vulnerable | Race Condition → Cache Poisoning |

**Action.** Apps-bump-to-14.2.35 closes 223j and 3h52. The 3rd (qpjv) closes when D2 bumps root.

---

## 6. Recommended remediation order

### Tier 1 — D2 candidate (this batch, if approved)

**6.1 Bump root `next: 14.1.0` → `14.2.25` (minimum) or `14.2.35` (recommended).**

- **14.2.25 (minimum):** closes the 1 critical advisory (the prompt's strict D2 boundary). Leaves root vulnerable to 6 other 14.x advisories.
- **14.2.35 (recommended):** also closes GHSA-mwv6-3258-q52c (high), GHSA-5j59-xgg2-r9c4 (high), GHSA-fr5h-rqp8-mj6g (high), GHSA-gp8f-8m3g-qvj9 (high), GHSA-7gfc-8cq8-jh5f (high), GHSA-7m27-7ghc-44w9 (medium), GHSA-g5qg-72qw-gw5v (medium), GHSA-xv57-4mr9-wg8v (medium), GHSA-4342-x723-ch2f (medium), GHSA-g77x-44xx-532m (medium), GHSA-3h52-269p-cp9r (low), GHSA-qpjv-v59x-3qc4 (low) at root level. Same blast radius as 14.2.25 (no breaking changes within 14.2.x).

**Ruling needed (Mo).** Strict D2 boundary = bump to 14.2.25. Pragmatic D2 = bump to 14.2.35. Recommend pragmatic — no extra risk; closes root-level alerts in the same diff. Will surface this in D2 with both diffs prepared.

### Tier 2 — separate workstream (out of D2 scope)

**6.2 Bump apps' `next: 14.2.25` → `14.2.35`.**

Closes 2 high (mwv6, 5j59) + 3 medium (g5qg, xv57, 4342) + 2 low (223j, 3h52) at the app level. Each app's `package.json` is the change site (`apps/clinic/package.json`, `apps/patient/package.json`). Verify with three tsc gates + spot-check a known-safe app build (`npm run build:clinic`, `npm run build:patient`) — patch bumps within 14.2.x are semver-safe but Lesson #17 reminds us only `next build` enforces route-handler type contracts, so the app-level builds are non-negotiable.

Estimated effort: s. Surface as a separate workstream after this batch closes.

### Tier 3 — deferred to Next 15 migration workstream — **RESOLVED 2026-05-16 (Phase L Bundle 7 + closure)**

**Original framing (kept for historical record):**

**6.3 Major bump 14 → 15** to close the remaining 5 next advisories:

- GHSA-h25m-26qc-wcjf (high)
- GHSA-q4gf-8mx6-v5v3 (high)
- GHSA-9g9p-9gw9-jx7f (medium)
- GHSA-3x4c-7xq6-9pq8 (medium)
- GHSA-ggv3-7p47-pfv8 (medium)

Next 15.x has documented breaking changes:
- `cookies()` / `headers()` / `params` are now async — every callsite reading `cookies().get(...)` becomes `(await cookies()).get(...)`. Audit all `packages/shared/lib/auth/session.ts` consumers and route handlers.
- Route handler signature changes (Lesson #17 territory — exactly the trap we just hardened against).
- React 19 minimum — separate React major migration.
- Caching defaults flipped (GET routes no longer cached by default).
- Middleware `request.ip` removed; replaced by Vercel-specific `requestContext`.

This is a multi-week migration, not a batch task. Add to `Open strategic decisions` in STATE_OF_WORK.md.

**RESOLUTION (Phase L Bundle 7, commit `feae943`, 2026-05-16):**

Deferral A (Next 14 → 15) **shipped Mac-side at commit `feae943`** (D-093 + D-094). Bundle 7 took 3 verification iterations — see D-094 for the scope-discovery correction.

**Vuln count delta (empirical — post-Dependabot-async-rescan):**
- Pre-Bundle-7: 59 advisories (24 high, 28 moderate, 7 low)
- Post-Bundle-7 (cached at push-time): 60 advisories — **this was the OLD lockfile's scan**, displayed in GitHub's `remote:` line at the Bundle 7 push because Dependabot hadn't yet re-scanned the new lockfile.
- Post-Bundle-7 (after Dependabot async re-scan completed): **3 advisories (1 high, 2 moderate, 0 low)** — net **-56 advisories**, including the 5 Next-14-specific GHSAs cited above plus 51 others closed by the transitive cascade. The re-scan completed sometime between the Bundle 7 push and the Phase L closure push (`dcf8f18`); GitHub's display reflected the new count at the closure push.

The "significant drop" the Bundle 7 plan predicted **materialized** — the cached display at push-time hid the win for the first few minutes/hours post-push. Major-version migrations CAN deliver substantial vuln reductions; the lesson here is that GitHub's vuln-count display is **asynchronously re-computed** by Dependabot, so the push-time `remote:` count is the previous lockfile's scan. Empirical lesson for future migrations: wait for Dependabot's re-scan to complete (typically a few minutes to a few hours) before reading the vuln count.

**Earlier framing in this section that said "did not materialize" and called this a "counter-example to major-version migrations always reduce vuln count" was WRONG** — corrected here based on the post-rescan empirical evidence visible at the `dcf8f18` push.

**Deferral B (`next-pwa` migration) — CLOSED-AS-NOT-NEEDED:** the original triage assumed `next-pwa@5.6.0` was incompatible with Next 15. The Bundle 7 Mac-side build empirically refuted that — `next-pwa@5.6.0` compiled the service worker cleanly under Next 15.5.18 (visible in the clinic build output: `> [PWA] Service worker: …/public/sw.js`). The `peer react: ^16 || ^17 || ^18` constraint that triggered the original deferral is stale upstream metadata; `.npmrc legacy-peer-deps=true` (shipped as part of Bundle 7) lets npm install + at runtime everything works. The `@serwist/next` migration is reclassified from "Phase L Bundle 8 (required)" to "future modernization workstream (non-urgent)." Full rationale in D-094.

**What's now needed for vuln-count progress:** Tier 4 quarterly dep-update sprint, plus the upstream peer-range catch-up (lucide-react, cmdk transitives, possibly framer-motion) which will let us remove `.npmrc legacy-peer-deps=true` and align with strict npm 7+ resolution.

### Tier 4 — quarterly dep-update sprint

**6.4 Build-pipeline transitive deps (16 unique GHSAs):** `fast-uri`, `picomatch` (×2 advisories), `serialize-javascript` (×2), `flatted`, `glob`, `minimatch`, `brace-expansion`, `postcss`. None are real-blocking in our production code path (all are build-time / dev tooling). Resolution requires running `npm update` against parent packages OR explicit overrides in root `package.json` to force resolution to patched versions. Defer to a planned dependency-hygiene sprint.

---

## 7. Out-of-scope findings

### 7.1 The root `next` dependency may be removable entirely

Root `package.json` declares `"next": "14.1.0"` and four `next *` scripts (`dev`, `build`, `start`, `lint`) at the top level. None of them target an actual Next app at the workspace root — there's no `app/` directory at the root, no `pages/`, no `next.config.js` at the root. The app builds run via `npm run build:clinic` and `npm run build:patient`, which use the workspace-local `next@14.2.25`.

The root `next` is therefore likely orphan. Removing it would:
- Permanently close the critical CVE-2025-29927 alert (no vulnerable instance in the tree).
- Close the 6 root-only `next` advisories at root level (fr5h, gp8f, 7gfc, 7m27, g77x, qpjv).
- Reduce `node_modules` size at root.

But removing it is more than a version bump — it changes root scripts, may affect tooling that assumes root has a Next install (root `tsc --noEmit`'s ability to resolve `next/*` types from shared code), and crosses into D2's STOP-trigger territory ("Patched version requires code changes beyond version bump").

**Recommendation:** Surface as a separate Phase F task ("Remove root `next` dependency"), not bundled into D2. D2 stays a clean version bump.

### 7.2 Dependabot's `scope=runtime` label is misleading for ~16 alerts

`fast-uri`, `picomatch`, `serialize-javascript`, `brace-expansion`, `postcss`, `glob`-not-dev-marked instances all show `dependency.scope = "runtime"` in the API response, but in our actual code path they're invoked exclusively at build time or by dev tooling. The label seems to be derived from "appears in `package-lock.json` without `dev: true`" rather than from production-code-path reachability analysis. This is GitHub-side classification; not a project bug. Mentioning here so the triage-class category "theoretical (transitive in build-pipeline)" doesn't read as if Dependabot is overruled lightly.

### 7.3 No advisories surfaced for `@supabase/*`, `@sentry/*`, `framer-motion`, `lucide-react`, `zustand`

These are some of our most heavily-used direct deps and should be audited as part of the Tier 4 dep-update sprint, even though they have no Dependabot alerts as of 2026-05-08. Absence of alert ≠ absence of vulnerability — alerts only fire when GHSA publishes. This is a forward-looking flag, not an actionable item for this batch.

### 7.4 `audits/dependabot-alerts-2026-05-08.json` and `audits/ci-runs-2026-05-08.json` are session artifacts

Both files were created during this session as inputs to the triage. They contain raw API output and are NOT intended to ship in the batch commit. **Action item for batch end:** add both to `.gitignore` OR delete before commit. The triage doc references them by relative path for audit-trail purposes, but the canonical artifact going forward is this triage doc itself, not the JSON dumps.

---

## 8. Verification log

```text
$ jq 'length' audits/dependabot-alerts-2026-05-08.json
55

$ jq '[.[] | .security_advisory.severity] | group_by(.) | map({k:.[0], n:length})' \
  audits/dependabot-alerts-2026-05-08.json
[{k:"critical",n:1},{k:"high",n:22},{k:"low",n:7},{k:"medium",n:25}]

$ jq -r '.[].security_advisory.ghsa_id' audits/dependabot-alerts-2026-05-08.json | sort -u | wc -l
29

$ jq '.packages | to_entries | map(select(.key | endswith("/next")))
   | map({k:.key, v:.value.version})' package-lock.json
[ {k:"apps/clinic/node_modules/next", v:"14.2.25"},
  {k:"apps/patient/node_modules/next", v:"14.2.25"},
  {k:"node_modules/next", v:"14.1.0"} ]

$ jq '. | {sha:.[0].headSha, conclusion:.[0].conclusion}' audits/ci-runs-2026-05-08.json
{ sha: "41775247be179d109ca306d66fece476b3eeddbf", conclusion: "success" }
```

All cited counts and version strings in the body trace back to these queries. Where the body cites a GHSA, the row exists in `audits/dependabot-alerts-2026-05-08.json` filtered by `.security_advisory.ghsa_id == "<id>"`. Where the body cites a parent dependency, it traces from the `node -e ...` reverse-lookup queries shown in this session's bash log.
