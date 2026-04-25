# Capacitor Bundle Investigation Report

_Investigation date: 2026-04-25. Investigation only — no code modified._

## 1. Confirmed error inventory

`npx tsc --noEmit` from repo root, fresh run with `--incremental false`:

| # | File | Line:Col | Code | Message |
|---|------|---------:|------|---------|
| 1 | `packages/shared/lib/offline/lan-discovery.ts` | 18:27 | TS2307 | Cannot find module `'@capacitor/core'` or its corresponding type declarations. |
| 2 | `packages/shared/lib/offline/local-db.ts` | 15:27 | TS2307 | Cannot find module `'@capacitor/core'` or its corresponding type declarations. |
| 3 | `packages/shared/lib/offline/local-db.ts` | 20:8  | TS2307 | Cannot find module `'@capacitor-community/sqlite'` or its corresponding type declarations. |

**Total: 3 errors, not 6.** ARCHITECTURE.md §14's "6 total" is stale.
The "6" came from commit `6897bcf` (`"TypeScript: 0 errors (6 @capacitor mobile-only expected)"`). The most recent commit, `6cbfeb9`, already records the corrected count: `"3 errors (capacitor only)"`. Three errors were silently eliminated between those commits and the doc was never updated.

Grouped by file:
- `lan-discovery.ts`: 1 error (line 18).
- `local-db.ts`: 2 errors (lines 15 and 20).

## 2. Every Capacitor reference

`grep -rn "@capacitor" packages/ apps/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs"`:

| File | Line | Style | Package |
|------|-----:|-------|---------|
| `packages/shared/lib/offline/local-db.ts` | 4 | (d) string in JSDoc — `* Mirrors critical Supabase tables locally using @capacitor-community/sqlite.` | — |
| `packages/shared/lib/offline/local-db.ts` | 15 | **(a) static** — `import { Capacitor } from '@capacitor/core'` | `@capacitor/core` |
| `packages/shared/lib/offline/local-db.ts` | 20 | **(a) static** — `import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'` | `@capacitor-community/sqlite` |
| `packages/shared/lib/offline/lan-discovery.ts` | 18 | **(a) static** — `import { Capacitor } from '@capacitor/core'` | `@capacitor/core` |

**No** dynamic imports (`await import('@capacitor/...')`), **no** type-only imports (`import type ...`), **no** other source-tree references. Only two files are involved: `local-db.ts` and `lan-discovery.ts`.

## 3. Dependency declaration status

```
$ grep -rn "@capacitor" package.json packages/*/package.json apps/*/package.json package-lock.json
(no matches)

$ ls node_modules/@capacitor
@capacitor NOT INSTALLED

$ ls node_modules/@capacitor-community
@capacitor-community NOT INSTALLED
```

- Not declared in root `package.json`, `packages/shared/package.json`, `packages/ui-clinic/package.json`, `apps/clinic/package.json`, or `apps/patient/package.json`.
- Not in `package-lock.json`.
- Not installed in `node_modules`.

**Verdict: imports for packages that have never existed in this monorepo.** The code references `@capacitor/core` and `@capacitor-community/sqlite` but no workspace declares them and `npm install` has never resolved them. This is the root-cause category — the imports are pure phantoms.

## 4. Build isolation status

Reviewed every config the brief asked about. **None of them isolate the Capacitor code.**

### `apps/clinic/next.config.js`
Relevant excerpts (verbatim):

```js
transpilePackages: ['@medassist/shared', '@medassist/ui-clinic'],
webpack: (config) => {
  // Resolve @shared/* and @ui-clinic/* aliases to actual package paths
  config.resolve.alias = {
    ...config.resolve.alias,
    '@shared': path.resolve(__dirname, '../../packages/shared'),
    '@ui-clinic': path.resolve(__dirname, '../../packages/ui-clinic'),
  }
  return config
},
```

- **No** `config.resolve.alias['@capacitor/...'] = false` or stub.
- **No** `typescript: { ignoreBuildErrors: true }`.
- **No** `eslint: { ignoreDuringBuilds: true }`.
- `@medassist/shared` IS in `transpilePackages` — so `packages/shared/**` is fed through the web build's bundler. That's the danger surface.

### `apps/clinic/tsconfig.json`
```json
"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
"exclude": ["node_modules"]
```
- Relative paths — `**/*.ts` here means `apps/clinic/**/*.ts`. **It does NOT include `packages/shared/**`.** That's why `next build`'s integrated type-check passes: it never sees the offline files.
- No `paths` redirect for `@capacitor/*`. No exclude pattern for `offline/*`.

### `packages/shared/tsconfig.json`
```json
"include": ["**/*.ts", "**/*.tsx"],
"exclude": ["node_modules"]
```
- Includes `lib/offline/*`. No `@capacitor/*` paths mapping. No exclude for `offline/*`.

### Root `tsconfig.json`
```json
"include": ["**/*.ts", "**/*.tsx"],
"exclude": ["node_modules", "apps/*/node_modules", ".next", "out"]
```
- Includes everything in the monorepo, which is why `npx tsc --noEmit` from root sees the errors. No `@capacitor/*` paths mapping. No exclude for offline files.

### `turbo.json`
```json
{ "tasks": { "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] }, ... } }
```
- No relevance to Capacitor.

### One-line verdict: **NEITHER** isolated NOR explicitly tolerated.
The errors are tolerated only because `next build` has its own narrower type-check scope (`apps/clinic/tsconfig.json` doesn't include `packages/shared/**`) and because the offline files are unreachable in the bundler entry graph (see §5). There is no opt-in stub, alias, or `ignoreBuildErrors` flag. Survival depends entirely on tree-shaking + tsconfig scoping.

## 5. Runtime reachability per file

Reachability traced via `grep -rn "offline/<name>"` and chained upward:

```
Static-import reachability tree (web app side):

apps/clinic/app/(frontdesk)/layout.tsx
  └─> @ui-clinic/components/frontdesk/OfflineIndicator
        └─> dynamic await import('@shared/lib/offline/idb-cache')   ← REACHABLE, but no @capacitor

(no other apps/clinic file imports any @shared/lib/offline/*)

packages/shared/components/ui/ConnectionStatus.tsx        ← orphan: nothing imports it
  ├─> @shared/hooks/useClinicPeers
  │     ├─> @shared/lib/offline/lan-discovery   (@capacitor/core)
  │     └─> @shared/lib/offline/lan-sync
  │           └─> lan-discovery, sync-queue, local-db (@capacitor/core, @capacitor-community/sqlite)
  └─> @shared/hooks/useOfflineStatus
        ├─> @shared/lib/offline/data-service     → local-db, sync-queue
        ├─> @shared/lib/offline/sync-engine      → sync-queue, data-service, lan-sync, lan-discovery, local-db
        └─> @shared/lib/offline/sync-queue       → local-db
```

| File | Reachability | Reasoning |
|------|--------------|-----------|
| `lib/offline/lan-discovery.ts` | **UNREACHABLE** | Imported only by `useClinicPeers`, `lan-sync`, `sync-engine`, `morning-sync` — all transitive children of `ConnectionStatus.tsx`, which itself has zero importers in `apps/` or `packages/`. The chain is dead. Has a `Capacitor.isNativePlatform()` runtime guard at line 304, but the static import at line 18 would still need to resolve at bundle time if the file were ever pulled in. |
| `lib/offline/local-db.ts` | **UNREACHABLE** | No file imports `offline/local-db` directly except other offline siblings (`sync-queue`, `data-service`, `sync-engine`, `lan-sync`, `morning-sync`). All of those trace back to `ConnectionStatus.tsx`. Has runtime guards at lines 437–452 (`isNativePlatform()` checks) but the static imports at lines 15 and 20 are unguarded. |
| `lib/offline/lan-sync.ts` | UNREACHABLE | Same chain. No `@capacitor` imports of its own, but pulls in `lan-discovery` and `local-db`. |
| `lib/offline/sync-engine.ts` | UNREACHABLE | Imported by `useOfflineStatus` only → dead. |
| `lib/offline/sync-queue.ts` | UNREACHABLE | Imported by `useOfflineStatus` and other offline/* siblings only → dead. |
| `lib/offline/data-service.ts` | UNREACHABLE | Imported by `useOfflineStatus` and `sync-engine` only → dead. (Note: TD-007 in ARCHITECTURE.md §17 already flags `data-service.ts` as broken — it was never callable in production.) |
| `lib/offline/morning-sync.ts` | UNREACHABLE | Zero importers anywhere. |
| `lib/offline/sw-register.ts` | UNREACHABLE | Zero importers anywhere. |
| `lib/offline/idb-cache.ts` | **REACHABLE** (dynamic) | `OfflineIndicator` web component does `await import('@shared/lib/offline/idb-cache')`. Has **no `@capacitor` imports**, only `IDBDatabase` / `indexedDB`. Safe. |

**Bottom line:** every file containing a Capacitor import sits in an entry-graph dead zone. The web bundle never asks the bundler to resolve `@capacitor/*`, which is why the build hasn't been crashing despite the unsatisfied module references. `idb-cache` is the lone offline file that actually runs in production.

## 6. Git history signal

```
$ git log --oneline --all -- "packages/shared/lib/offline/"
762c19a fix(td-005): close clinic_id orphan-row class -- schema, data layer, handlers
48f2760 chore: clean monorepo structure for production

$ git log -1 --format="%h %ad %s" --date=short -- packages/shared/lib/offline/lan-discovery.ts
48f2760 2026-03-16 chore: clean monorepo structure for production

$ git log -1 --format="%h %ad %s" --date=short -- packages/shared/lib/offline/local-db.ts
48f2760 2026-03-16 chore: clean monorepo structure for production

$ git log --diff-filter=A --format="%h %ad %s" --date=short -- <file>
(both files first appeared in 48f2760, 2026-03-16)
```

- Both Capacitor-importing files were added in the **same commit** (`48f2760`, 2026-03-16, `chore: clean monorepo structure for production`) and **have not been modified since**. They have been frozen in their current shape for ~6 weeks.
- The only later commit touching `offline/` is `762c19a` (TD-005), which modified `data-service.ts` for `clinic_id` correctness — not the Capacitor files.
- Two recent commits explicitly mention Capacitor in their messages, but only as a status note for tsc output, not as design intent:
  - `6897bcf` — `"TypeScript: 0 errors (6 @capacitor mobile-only expected)"` — origin of the "6" claim in ARCHITECTURE.md.
  - `6cbfeb9` — `"npx tsc --noEmit  -> 3 errors (capacitor only)"` — current count, but ARCHITECTURE.md was not updated.
- `git log --grep="capacitor" -i` and `git log --grep="flutter" -i` find no commit that documents intent or planning. No commit explains why Capacitor was chosen, dropped, or kept.

## 7. Strategic context (Capacitor vs Flutter)

Reviewed:
- DECISIONS_LOG.md D-005 — `"Business logic … needs to be shared between the web app and a future Flutter mobile app."` Mobile target is **Flutter**.
- ARCHITECTURE.md §1 — `"… with an offline-capable PWA shell and a planned Flutter mobile migration."` Same.
- ARCHITECTURE.md §10.2 — `"LAN Sync: lan-discovery.ts + lan-sync.ts for local network clinic sync (Capacitor mobile)"`. Says Capacitor in the same doc that names Flutter as the mobile target.
- ARCHITECTURE.md §14 — `"Current errors: 6 total — all @capacitor/* module references (mobile-only, not applicable to web build)"`. Treated as a known-tolerated condition.

These statements are inconsistent. The most defensible reading:

> Capacitor was the originally-imagined mobile shell at the time `48f2760` landed (March 2026). D-005 then committed the project to Flutter, but `lan-discovery.ts` and `local-db.ts` were never deleted or rewritten. ARCHITECTURE.md §10.2 still names Capacitor for mobile because no one updated it, not because Capacitor and Flutter are intended to coexist.

This is **option (a) — Capacitor was the original mobile plan, replaced by Flutter, and `offline/lan-*` + `offline/local-db` are now dead code** — but the docs have not caught up. The classification as (a) needs Mo's confirmation, since the docs are ambiguous and no commit message states intent explicitly. See §11.

## 8. Root cause synthesis

**Category A applies.**
The errors exist because `lan-discovery.ts` and `local-db.ts` statically import packages (`@capacitor/core`, `@capacitor-community/sqlite`) that have never been declared as dependencies or installed in `node_modules`. They persist because nothing in the build pipeline forces them to resolve: `apps/clinic/tsconfig.json` only includes `apps/clinic/**`, so `next build`'s integrated type-check never sees them; the bundler's entry graph never reaches the offline files (their only static caller is the orphan `ConnectionStatus.tsx`), so webpack never tries to resolve `@capacitor/*`. Only the root-level `npx tsc --noEmit`, which has a wider include glob, surfaces the errors — and that command isn't gating any deploy. The runtime guards inside the files (`Capacitor.isNativePlatform()` at `local-db.ts:439`, `lan-discovery.ts:304`) protect calls but not the imports themselves; survival is purely from unreachability + tsconfig scoping, not from any explicit isolation strategy.

## 9. Risk assessment

- **What breaks today?** Nothing. Both `npm run type-check -w @medassist/clinic` and `npm run build:clinic` pass (per commit `6cbfeb9` Verification block, reconfirmed structurally above). `next build` produces 41/41 pages.
- **What breaks at runtime if a code path changes?** If anyone imports `ConnectionStatus`, `useClinicPeers`, `useOfflineStatus`, `lan-discovery`, `lan-sync`, `local-db`, `sync-engine`, `sync-queue`, `data-service`, `morning-sync`, or `sw-register` from a reachable web entry (a layout, a page, a server action, an API route), webpack will try to resolve `@capacitor/core` or `@capacitor-community/sqlite`, fail, and the **web build will hard-error**. The bomb is one `import { ConnectionStatus } from '@shared/components/ui/ConnectionStatus'` away.
- **What breaks when someone tries to actually build for mobile?** There is no mobile build pipeline today. If a Flutter app is built per D-005, it won't share TypeScript code at all, so these files are irrelevant to it. If someone tried to revive a Capacitor mobile build, `@capacitor/core` and `@capacitor-community/sqlite` would need to be installed plus `@capacitor/cli`, `capacitor.config.ts`, `ios/`, `android/`, etc. — none of which exist. The current files are not a working mobile starting point either.
- **CI / Sentry / IDE.** No CI gate on `tsc --noEmit` from root (no GitHub Actions workflow for type-check was found in `.github/`; `npm run type-check` is wired but only runs on demand). Sentry is unaffected — these are compile-time errors only. **IDE noise is real:** every editor that runs the root TS server flags 3 errors permanently in the Problems pane, which makes "is this PR clean?" harder to answer at a glance and trains contributors to ignore TS errors in those files.

## 10. Options for resolution

| # | Option | Effort | Reversibility | Risk to web build | Alignment with Flutter plan (D-005) |
|---|--------|--------|---------------|-------------------|-------------------------------------|
| 1 | **Delete the Capacitor code entirely** — `local-db.ts`, `lan-discovery.ts`, `lan-sync.ts`, `sync-engine.ts`, `morning-sync.ts`, `sw-register.ts`, plus the orphan `ConnectionStatus.tsx`, `useClinicPeers.ts`, `useOfflineStatus.ts`. Keep `idb-cache.ts` (it's reachable and Capacitor-free). | Medium — needs careful audit of TD-007 references in `data-service.ts` and `sync-queue.ts` to confirm nothing salvageable. | Low — code is in git, recoverable any time. | None — these files are unreached. | **Best fit.** Flutter app will not share TS code; deleting dead Capacitor TS removes the contradiction between D-005 and §10.2. |
| 2 | **Install `@capacitor/core` + `@capacitor-community/sqlite` as devDependencies + ambient types.** | Low — two `npm install`s. | High — trivially reversible. | Low. | **Worst fit.** Permanently adds the wrong native shell to the web app's lockfile and stamps "we use Capacitor" into the dependency manifest, contradicting D-005. |
| 3 | **Add webpack alias to stub `@capacitor/*` to `false` (or a noop module) in `apps/clinic/next.config.js`,** plus an `ambient.d.ts` to silence tsc. | Low. | High. | Low — guards web build against the §9 "one import away" failure mode. | Neutral — keeps the dead code alive but quiet. Doesn't decide Capacitor-vs-Flutter; punts the question. |
| 4 | **Move `lib/offline/lan-*`, `local-db.ts`, `sync-engine.ts`, etc. into a separate package** (e.g. `packages/mobile-offline`) excluded from `apps/clinic`'s tsconfig and not listed in `transpilePackages`. | Medium-high — refactor + new workspace + index updates. | Medium. | Low at the cost of a meaningful refactor. | Neutral if Capacitor is being kept on a roadmap; wasted effort if the plan is Flutter. |
| 5 | **Replace static imports with dynamic imports guarded by `Capacitor.isNativePlatform()`,** e.g. `const cap = await import('@capacitor/core')`. Combined with making `@capacitor/*` optional dependencies. | Medium — rewrite both files; still need the deps to be resolvable at runtime on mobile. | Medium. | Low for web. | Neutral — only useful if there's a real intent to ship a Capacitor mobile build. |

Recommendation **not** to act on yet — pick one only after Mo answers §11.

## 11. Questions for Mo

1. **Is the mobile target Flutter (D-005) or a Capacitor PWA shell?** ARCHITECTURE.md §10.2 still describes `lan-discovery.ts`/`lan-sync.ts` as "Capacitor mobile". If D-005 is authoritative, §10.2 is wrong and the offline LAN-sync files should go.
2. **Do you intend to ship LAN sync at all?** TD-007 already records that `data-service.ts` and `sync-queue.ts` "never worked at runtime" (wrong endpoint, wrong body shape). If LAN sync is dead in practice, the entire `offline/lan-*` + `offline/local-db` chain is doubly dead.
3. **Is the offline-write story (queue → replay) a real product feature or a spec carryover?** `OfflineIndicator` + `idb-cache` is the only path that's actually wired up. If the queue/replay is supposed to ship, `data-service.ts` needs the TD-007 fix and a real importer; if not, that whole shim is deletable too.
4. **Should `npx tsc --noEmit` (root) become a CI gate?** It's currently advisory. Promoting it to a gate is the only thing that would prevent the §9 "one import away" risk from regressing. Choosing Option 1 or 3 plus a CI gate would close the issue permanently.
