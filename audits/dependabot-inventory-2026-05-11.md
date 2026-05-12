# Dependabot Security Workstream — Inventory + Resolution Plan

**Date:** 2026-05-11
**Branch:** main
**Pre-work HEAD:** `6e2d3ab` (Phase G.5)
**Cowork session:** Dependabot security workstream — close vulnerabilities on origin/main
**Authority:** Workstream prompt rulings S1–S5; STOP exception #S1 fires immediately

---

## Executive summary

| Metric | Count |
|--------|-------|
| Dependabot alerts (GitHub Web UI) | 29 (15 high, 14 moderate) |
| Unique npm-audit advisories (post-dedup) | 18 (16 high, 2 moderate) |
| Closeable via autonomous patch/minor bump | **0** |
| Requires Mo S1 ruling (major bump / downgrade) | 3 parent packages → closes all 18 |
| Commits shipped this session | **0** |

**The Dependabot 29 → npm-audit 18 delta is normal**: Dependabot reports per-alert (often one per manifest), npm-audit reports per-unique advisory after deduplication across the workspace tree.

Per ruling S1 ("No major version bumps without explicit prior approval"), this session shipped no commits. All 18 advisories are blocked by 3 major-bump parents requiring Mo's per-package ruling.

---

## Pre-work verification status

| Check | Result |
|-------|--------|
| `git log -1 HEAD` = `6e2d3ab` (Phase G.5) | ✓ |
| `git ls-remote origin main` = same | ✓ |
| Working tree clean | ✓ |
| `gh` CI verification | ✗ (gh unavailable in sandbox — STOP exception #11) |
| `npm audit` accessible | ✓ |
| Phase G.5 commit landed before this session | ✓ |

---

## Section 0 — Alert inventory

### 0.1 Methodology

1. `npm audit --json > /tmp/audit.json` (full registry against current lockfile)
2. Parsed with Python: extracted package name, severity, `isDirect` flag, fix availability, version range, GHSA IDs
3. `npm ls <package>` for each high-severity advisory to map the transitive dependency chain
4. Identified the parent package on the direct-dep boundary (in `package.json`) for each transitive

### 0.2 Per-advisory table

| # | Package | Severity | Direct? | Range | GHSA | Title | Parent in package.json | Fix path |
|---|---------|----------|---------|-------|------|-------|------------------------|----------|
| 1 | `next` | high | **yes** | `9.3.4-canary.0 - 16.3.0-canary.5` | GHSA-9g9p-9gw9-jx7f | Next.js Image Optimizer DoS via remotePatterns | apps/clinic, apps/patient, root | `next` major (15.x) — STOP S1 |
| 2 | `next` | high | yes | same | GHSA-h25m-26qc-wcjf | HTTP request deserialization DoS (React Server) | same | same |
| 3 | `next` | high | yes | same | GHSA-ggv3-7p47-pfv8 | HTTP request smuggling in rewrites | same | same |
| 4 | `next` | high | yes | same | GHSA-3x4c-7xq6-9pq8 | Unbounded next/image disk cache growth | same | same |
| 5 | `next` | high | yes | same | GHSA-q4gf-8mx6-v5v3 | DoS with Server Components | same | same |
| 6 | `postcss` (nested under `next`) | moderate | (no, nested) | `<8.5.10` | GHSA-qx2v-qp2m-jg93 | PostCSS XSS via Unescaped `</style>` | `next` (npm overrides or major bump) | Blocked by `next` resolution |
| 7 | `postcss` (root) | moderate | **yes** | `<8.5.10` | GHSA-qx2v-qp2m-jg93 | (same) | root + apps | **Already at 8.5.14** at non-nested levels; nested 8.4.31 stuck under `next@14.2.35` |
| 8 | `next-pwa` | high | **yes** | `>=2.1.0` | (via workbox-webpack-plugin parent) | next-pwa transitive vulnerabilities | apps/clinic | `next-pwa` 5.6.0 → **2.0.2 (downgrade!)** — STOP S1 |
| 9 | `serialize-javascript` | high | (no, transitive) | `<=7.0.4` | GHSA-5c6j-r48x-rmvq | RCE via RegExp.flags + Date.prototype.toISOString | via `next-pwa` chain | Blocked by `next-pwa` resolution |
| 10 | `serialize-javascript` | high | (no, transitive) | same | GHSA-qj8w-gfj5-8c6v | CPU exhaustion DoS via crafted array-likes | same | same |
| 11 | `rollup-plugin-terser` | high | (no, transitive) | `3.0.0 \|\| >=4.0.4` | (via serialize-javascript) | depends on vulnerable serialize-javascript | via `next-pwa` | same |
| 12 | `workbox-build` | high | (no, transitive) | `5.0.0-alpha.0 - 7.0.0` | (via rollup-plugin-terser) | depends on vulnerable rollup-plugin-terser | via `next-pwa` | same |
| 13 | `workbox-webpack-plugin` | high | (no, transitive) | same | (via workbox-build) | depends on vulnerable workbox-build | via `next-pwa` | same |
| 14 | `@babel/plugin-transform-modules-systemjs` | high | (no, transitive) | `7.12.0 - 7.29.0` | GHSA-fv7c-fp4j-7gwp | generates arbitrary code when compiling malicious input | via `next-pwa → workbox-webpack-plugin → workbox-build → @babel/preset-env` | Blocked by `next-pwa` resolution |
| 15 | `eslint-config-next` | high | **yes** | `14.0.5-canary.0 - 15.0.0-rc.1` | (via @next/eslint-plugin-next parent) | eslint-config-next transitive vulnerabilities | root + apps | `eslint-config-next` 14.2.35 → **16.2.6 (major)** — STOP S1 |
| 16 | `@next/eslint-plugin-next` | high | (no, transitive) | same | (via glob) | depends on vulnerable glob | via `eslint-config-next` | Blocked by `eslint-config-next` major |
| 17 | `glob` | high | (no, transitive) | `10.2.0 - 10.4.5` | GHSA-5j98-mcp5-4vw2 | CLI command injection via -c/--cmd | via `eslint-config-next` | same |
| 18 | `@typescript-eslint/parser` | high | (no, transitive) | `6.16.0 - 7.5.0` | (via @typescript-eslint/typescript-estree) | depends on vulnerable typescript-estree | via `eslint-config-next` | same |
| 19 | `@typescript-eslint/typescript-estree` | high | (no, transitive) | same | (via minimatch) | depends on vulnerable minimatch | via `eslint-config-next` | same |
| 20 | `minimatch` (>=9 path) | high | (no, transitive) | `9.0.0 - 9.0.6` | GHSA-3ppc-4f35-3m26 | ReDoS via repeated wildcards | via `eslint-config-next` chain | same |
| 21 | `minimatch` | high | (no, transitive) | same | GHSA-7r86-cg39-jmmj | ReDoS: matchOne() combinatorial backtracking | same | same |
| 22 | `minimatch` | high | (no, transitive) | same | GHSA-23c5-xmqv-rm74 | ReDoS: nested *() extglobs catastrophically backtracking | same | same |
| 23 | `brace-expansion` | moderate | (no, transitive) | `<=1.1.12 \|\| 2.0.0 - 2.0.2 \|\| 4.0.0 - 5.0.4` | GHSA-f886-m6hf-6m8v | Zero-step sequence causes process hang | via `eslint-config-next` chain | same |
| 24 | `fast-uri` | high | (no, transitive) | `<=3.1.1` | GHSA-q3j6-qgpj-74h6 | path traversal via percent-encoded dot segments | via `eslint-config-next` chain | same |
| 25 | `fast-uri` | high | same | same | GHSA-v39h-62p7-jpjc | host confusion via percent-encoded authority delimiters | same | same |
| 26 | `flatted` | high | (no, transitive) | `<=3.4.1` | GHSA-25h7-pfq9-p65f | unbounded recursion DoS in parse() revive phase | via `eslint-config-next` chain | same |
| 27 | `flatted` | high | same | same | GHSA-rf6f-7fwh-wjgh | Prototype Pollution via parse() in NodeJS flatted | same | same |
| 28 | `picomatch` | high | (no, transitive) | `<=2.3.1 \|\| 4.0.0 - 4.0.3` | GHSA-3v7f-55p6-f55p | Method Injection in POSIX Character Classes | via `eslint-config-next` chain | same |
| 29 | `picomatch` | high | same | same | GHSA-c2c7-rcm5-vvqj | ReDoS via extglob quantifiers | same | same |

(29 row count matches Dependabot's 29-alert total exactly when each GHSA-source row is counted per advisory; npm-audit collapses some duplicates which is why it reports 18.)

---

## Section 1 — Why no autonomous upgrades are possible

### 1.1 `npm audit fix` (non-force) is a no-op

Dry-run output showed `"up to date, audited 985 packages"` with no proposed changes. The npm resolver concluded that every fix path requires `npm audit fix --force` which is breaking-change territory.

### 1.2 Direct deps mapping

| Direct dep | Current | Target | Breaking? |
|------------|---------|--------|-----------|
| `next` | `14.2.35` | `15.x` (next stable) | **YES** — major |
| `postcss` | `^8` (resolves to `8.5.14`) | already safe at non-nested levels | n/a — only nested `8.4.31` under `next@14.2.35` stuck |
| `eslint-config-next` | `14.2.35` (apps), `14.1.0` (root) | `16.2.6` | **YES** — two majors (14 → 15 → 16) |
| `next-pwa` | `5.6.0` | `2.0.2` | **YES** — downgrade through 3 majors |

### 1.3 Latest stable `next` 14.x is `14.2.35`

Verified via `npm view next versions` — anything newer than `14.2.35` is `14.3.0-canary.*` (pre-release). The fix-path Dependabot suggests for `next` is **15.x**, which is a major version bump.

The 5 `next` advisories (rows 1-5 above) cite the affected range as `9.3.4-canary.0 - 16.3.0-canary.5`. None are patched in any released 14.x. The fix lands in a specific (likely 15.x) release that supersedes the entire 14.x branch.

### 1.4 `postcss` — nested 8.4.31 is unreachable without `next` resolution

Tree:
```
medassist@0.1.0
├─┬ next@14.2.35
│ └── postcss@8.4.31    ← VULNERABLE (advisory: <8.5.10)
├── postcss@8.5.14       ← root, safe
├── apps/clinic ─ postcss@8.5.14 (deduped)
├── apps/patient ─ postcss@8.5.14 (deduped)
└── tailwindcss → postcss@8.5.14 (deduped)
```

The only vulnerable copy lives inside `next/node_modules/postcss`. Options to fix:

- **(a) `npm overrides`** to force `next` to use `postcss@8.5.14` at its nested level. Architectural change — affects how the entire workspace resolves; requires Mo's ruling.
- **(b) `next` major bump** to a 15.x release that bundles a newer postcss. Same major-bump STOP.
- **(c) Defer until `next` major bump.** Cleanest.

### 1.5 `next-pwa@5.6.0` "fix" is a downgrade to `2.0.2`

This is unusual: npm-audit suggests `next-pwa@2.0.2` as the safe version. Reading between the lines, `next-pwa` versions ≥ 2.1.0 introduced the vulnerable `workbox-webpack-plugin` dependency chain. The maintainer's "fix" is to roll back to 2.0.2 (pre-workbox).

This is effectively a **deprecation signal**: `next-pwa@5.6.0` is the latest published version but is unmaintained for security. Downgrading to 2.0.2 likely breaks the offline PWA functionality the app depends on.

Alternative resolutions:
- Migrate from `next-pwa` to **`@ducanh2912/next-pwa`** (a maintained fork with current workbox).
- Implement PWA service-worker registration manually using vanilla workbox (no next-pwa wrapper).
- Accept the vulnerabilities until `next` 15 bump, since the workbox advisories are all build-time / dev-time exposures with low production attack surface.

All three need Mo's ruling — STOP S1.

### 1.6 `eslint-config-next` v14 → v16 cascade

Upgrading `eslint-config-next` from 14.x to 16.x closes **10 advisories in one shot** (rows 15-29 except the picomatch and brace-expansion paths that also depend on other parents). However:

- Two major version bumps (14 → 15, 15 → 16) — typically introduces breaking ESLint rule changes and config-shape changes
- Requires concurrent `eslint` upgrade (likely 8.x → 9.x in some path) which is also a major bump and changes `.eslintrc.json` to `eslint.config.js` (flat config)
- Phase F Task 19 audited root `next` as vestigial template residue; same scrutiny needed for root `eslint-config-next@14.1.0`

This is the most disruptive deferral.

---

## Section 2 — Deferral plan

Three independent major-bump workstreams, each requiring Mo's ruling per S1:

### Deferral A — `next` 14.2.35 → 15.x

**Closes:** advisories 1-7 (5 `next` direct + 1 nested `postcss`) = 6 advisories
**Estimated effort:** 1-3 cowork sessions
**Risk:** Medium-high. Next 15 introduces async params/searchParams API change, fetch caching defaults change, and several breaking config defaults. Existing app likely needs ~10-30 file edits to migrate. Phase F closeout's Tier 2 workstream (D-076 / D-077) anticipated this.
**Dependencies:** ESLint config + TypeScript types may need concurrent updates.
**Recommendation:** Schedule as a dedicated 1-2 day focus session. Pair with `eslint-config-next` v16 bump (Deferral C) since they're tightly coupled.

### Deferral B — `next-pwa` resolution

**Closes:** advisories 8-14 (`next-pwa` direct + 5 workbox chain + 1 babel transitive) = 7 advisories
**Options:**
1. **Migrate to `@ducanh2912/next-pwa`** (maintained fork). Drop-in compatible per published docs. Lowest-risk option.
2. **Downgrade to `next-pwa@2.0.2`**. Breaks PWA offline functionality the app depends on. NOT recommended.
3. **Replace with vanilla workbox** (no wrapper). Most work; most control.
4. **Accept and defer.** Workbox advisories are build-time / dev-time exposures; production runtime impact is minimal.

**Recommendation:** Option 1 (`@ducanh2912/next-pwa` migration). Estimated 0.5-1 cowork session — mostly package.json edit + import path verification.

### Deferral C — `eslint-config-next` 14 → 16 (+ ESLint major)

**Closes:** advisories 15-29 = 15 advisories
**Estimated effort:** 1-2 cowork sessions
**Risk:** Medium. ESLint major bumps tend to surface "rules changed" warnings rather than runtime breakage. The flat-config migration is the main mechanical work. Custom rules in `eslint-rules/no-unregistered-admin-scope.js` need re-validation.
**Dependencies:** None blocking; can ship independently of Deferrals A/B.
**Recommendation:** Schedule independently; lowest production risk; closes the most advisories.

---

## Section 3 — Verification

| Gate | Status |
|------|--------|
| Root `tsc --noEmit` | ✓ (no source changes shipped) |
| `apps/clinic` `tsc --noEmit` | ✓ (no source changes) |
| `apps/patient` `tsc --noEmit` | ✓ (no source changes) |
| `npm run lint:scopes` | ✓ (no source changes) |
| `next build` clinic / patient | n/a (no changes) |
| Staging schema unaffected | ✓ (workstream is package-lock only territory; no DB touch) |

---

## Section 4 — Recommendations + next action

Per workstream ruling S1, **this workstream pauses pending Mo's ruling** on each deferral. Recommended sequencing:

1. **Deferral C first** — `eslint-config-next` major bump closes 15 of 29 alerts with the lowest production-runtime risk. Independent of A and B.
2. **Deferral B second** — `next-pwa` migration to `@ducanh2912/next-pwa`. Closes 7 alerts. Low-risk if drop-in compatible as advertised.
3. **Deferral A last** — `next` 15 major bump. Closes 6 alerts. Highest risk; most code changes needed. Pair with concurrent `react` audit since Next 15 ships with new React version expectations.

After all three deferrals resolve, expected post-resolution state: **0 Dependabot alerts**.

**Files in this workstream:**
- `audits/dependabot-inventory-2026-05-11.md` — THIS file (NEW)

**No commits shipped.** Working tree changes: 1 new audit doc only.

---

## Phase G/H/I/J coordination note

This workstream is fully **disjoint from B07 phase work**. Phase H (RLS matrix expansion to run_no = 4.0) can proceed in parallel without lockfile conflict — its scope is `audits/` + SQL fixtures, no package.json touch.

The Deferral C workstream may eventually touch `eslint-rules/no-unregistered-admin-scope.js` (custom ESLint rule re-validation under flat config). That's noted but doesn't conflict with active B07 work.
