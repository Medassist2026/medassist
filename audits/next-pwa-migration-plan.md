# next-pwa → @serwist/next Migration Plan (B07 Phase L Bundle 8 / L-8)

**Status:** CLOSED-AS-NOT-NEEDED 2026-05-16 (Phase L closure, D-094). Reclassified from "required Phase L Bundle 8" to "future modernization workstream (non-urgent)." The triggering assumption — that `next-pwa@5.6.0` is incompatible with Next 15 — was empirically refuted by the Bundle 7 Mac-side build at commit `feae943`. The clinic-app's `npm run build` under Next 15.5.18 successfully compiled the service worker via `next-pwa@5.6.0` (visible in build output: `> [PWA] Service worker: …/apps/clinic/public/sw.js`). The stale `peer react: ^16 || ^17 || ^18` constraint that triggered the original deferral is upstream metadata lag; `.npmrc legacy-peer-deps=true` (shipped as part of Bundle 7) handles peer resolution.

**Why this plan remains in the repo:** historical record + ready-to-use when next-pwa eventually does break (it's unmaintained upstream; a future Next major-version bump will likely force the move). Mo or future cowork can pick up Option B (@serwist/next) when the trigger arrives.

**Original "Status:" framing (kept for context):** PLANNED — cowork ships this plan in Bundle 8 (2026-05-16) but **defers execution to the same Mac-side cowork session as Bundle 7 (L-7 Next 14→15).** Bundle 8 depends on Bundle 7's `npm install next@15` landing first.

**Estimated execution time (if/when triggered):** 0.5-1 day cowork on Mac side (smaller than L-7).

## Current state (verified 2026-05-16)

- `apps/clinic/next.config.js` lines 4-83 wrap with `next-pwa@5.6.0` via try/catch.
  - Configuration: 6 runtime-caching rules covering Google Fonts (CacheFirst, 1yr), static assets (StaleWhileRevalidate, 30d), Next data (NetworkFirst, 1d), API (NetworkOnly), Supabase API (NetworkOnly), navigation (NetworkFirst, 1d).
  - Output: `apps/clinic/public/sw.js` + workbox bundles (gitignored per `.gitignore` lines 13-21).
- `apps/patient/next.config.js` does NOT use next-pwa today. Patient app is web-first; PWA wrapping was deferred (Mo's call). Bundle 8 is therefore clinic-only.
- `next-pwa@5.6.0` was last released 2023; no Next 15 support shipped upstream as of cowork's knowledge cutoff (May 2025).
- `apps/clinic/package.json` declares `"next-pwa": "^5.6.0"` as a runtime dependency.

## Migration options

### Option A — Bump `next-pwa` to a Next-15-compatible version (if one exists)

**Risk:** upstream may never ship Next-15 support. `next-pwa@6` betas exist on `next-pwa-experimental` but aren't production-ready. The maintainer has slowed; community discussion points to `@serwist/next` as the successor.

**Verdict:** unrecommended. If this option exists at the time of execution, it's still a stale fork.

### Option B — Migrate to `@serwist/next` (RECOMMENDED)

**Why:** `@serwist/next` is the actively-maintained Next.js PWA wrapper. Compatible with Next 15. Maintained by the team that took over from the next-pwa community. Drop-in for most use cases.

**Migration shape:**

```diff
- const withPWA = require('next-pwa')({ ...config })
+ // (in next.config.js or instrumentation; serwist uses a different bootstrap)
+ const withSerwist = require('@serwist/next').default({
+   swSrc: 'app/sw.ts',         // a TypeScript source file that defines the SW
+   swDest: 'public/sw.js',
+   disable: process.env.NODE_ENV === 'development',
+ })
```

The 6 next-pwa runtime-caching rules port to Serwist's runtimeCaching API (very similar names; workbox-strategies underneath). `apps/clinic/app/sw.ts` becomes the source-of-truth for the SW logic.

**Dependencies:**
- `npm uninstall next-pwa -w @medassist/clinic`
- `npm install @serwist/next serwist -w @medassist/clinic`

**Configuration migration:** 1-to-1 mapping of the 6 caching rules. Estimated ~30 min once Serwist is installed.

**Files to touch:**
- `apps/clinic/package.json` (dep swap)
- `apps/clinic/next.config.js` (withPWA → withSerwist wrapper)
- `apps/clinic/app/sw.ts` (NEW — Serwist's SW source)
- `apps/clinic/public/offline` — should keep working (offline fallback page)
- `.gitignore` — already covers `**/public/sw.js` + workbox bundles; no change needed for the swDest output

### Option C — Drop PWA entirely

**When this would make sense:** if Mo decides the offline-first behavior is not load-bearing for the MVP and the clinic app can operate as a normal web app. TD-008 (offline-write Phase 1, resolved 2026-04-26 per D-050) uses `idb-cache.ts` for offline-write queuing — that's independent of the service worker and continues to work without next-pwa.

**Risk:** removing the service worker breaks the "Install MedAssist as an app" PWA prompt + offline-page fallback. Probably acceptable for closed-beta; revisit post-launch.

**Verdict:** **possible escape hatch.** Cowork's lean would be Option B (Serwist) but if Mo wants to defer PWA entirely until post-launch, Option C is a one-commit removal of the next-pwa wrap + the runtime-caching rules.

## Recommendation

**Option B (@serwist/next)** unless Mo's TD-008 work or other offline-first requirements need a feature next-pwa@5.6 supports that Serwist hasn't matched. None identified during cowork's grep of `apps/clinic/next.config.js` configuration.

## Why this plan ships separately from execution

Same rationale as Bundle 7 (see `audits/next-15-migration-plan.md`):
1. `npm install` must run cleanly to reconcile the lockfile after swapping `next-pwa` for `@serwist/next`.
2. Verification requires `npm run build -w @medassist/clinic` to confirm the SW is generated correctly + the offline page renders. Cold build > 45 s sandbox budget.
3. Mac-side cowork session executes Bundle 7 + Bundle 8 in sequence (8 depends on 7).

## Step-by-step execution checklist (Mac-side cowork session, AFTER Bundle 7 lands)

```bash
# (Assumes Next 15 already landed via Bundle 7 execution.)

# 1. Verify the Next 15 + next-pwa@5.6 combination is actually broken
#    (sometimes upstream slips a hotfix; verify before swapping vendors).
npm run build -w @medassist/clinic
# If the build succeeds and the SW registers correctly, defer Option B
# and re-pin next-pwa upstream. If it fails (most likely outcome), proceed.

# 2. Swap deps
npm uninstall next-pwa -w @medassist/clinic
npm install @serwist/next serwist -w @medassist/clinic

# 3. Migrate next.config.js
#    Replace the withPWA wrap with withSerwist. Port the 6 runtime-caching
#    rules. The Serwist docs at https://serwist.pages.dev show the exact
#    config shape.

# 4. Create apps/clinic/app/sw.ts
#    Serwist needs an explicit TS source file for the service worker. Copy
#    the runtime-caching rules from next-pwa config into the new file.

# 5. Verify the offline page still works
npm run build -w @medassist/clinic
# Then: serve apps/clinic/.next + visit /offline; verify the SW registers
# and the offline fallback renders.

# 6. Commit + push as ONE bundled L-8 commit
```

## Dependabot Deferral B status update

Audit ref: `audits/dependabot-triage-2026-05-08.md` (Deferral B = `next-pwa` Next-15 incompatibility). This bundle ships the **plan**; execution closes the deferral.

## Cross-references

- `audits/b07-phase-l-cowork-prompt-2026-05-15.md` §Bundle 8 / L-8 (origin spec)
- `audits/dependabot-triage-2026-05-08.md` (Deferral B)
- `audits/next-15-migration-plan.md` (Bundle 7 prerequisite)
- Serwist documentation: https://serwist.pages.dev
- DECISIONS_LOG.md D-092 (defer rationale, shared with Bundle 7)
- DECISIONS_LOG.md D-050 (TD-008 offline-write Phase 1; `idb-cache.ts` is independent of next-pwa)
