# Next 14 → Next 15 Migration Plan (B07 Phase L Bundle 7 / L-7)

**Status:** PLANNED — cowork ships this plan in Bundle 7 (2026-05-16) but **defers execution to a Mac-side cowork session.** Rationale below.

**Estimated execution time:** 1-2 days cowork on Mac side.

## Why this plan ships separately from execution

The migration requires:
1. `npm install next@15 react@latest react-dom@latest eslint-config-next@15` (and paired deps).
2. The new types must be resolvable by `tsc --noEmit` so cowork can iterate on each type-check failure with the Next-15 migration guide context. Without `npm install`, `tsc` keeps using the existing `node_modules/next` at 14.2.35 and reports false positives/negatives against the wrong types.
3. `npm run build -w @medassist/clinic` + `npm run build -w @medassist/patient` must succeed before commit. Both builds exceed the cowork sandbox's 45-second `bash` call budget on a cold cache.
4. The Vercel build environment (Mac-equivalent post-`npm install`) is the production-equivalent verification surface.

The sandbox CANNOT safely run `npm install` (the swc-lockfile-patch `ENOWORKSPACES` warning we hit on every prior Mac-side build hints at lockfile-churn risk). And without `npm install`, cowork cannot verify type-check + build against Next 15 types. So this bundle ships the plan + scope inventory + decision log; the next Mac-side cowork session executes.

## Migration scope (verified from current main, 2026-05-16)

### Dynamic API route handlers — `params` is now `Promise<...>` (18 routes)

The signature `(request: Request, { params }: { params: { id: string } })` becomes `(request: Request, { params }: { params: Promise<{ id: string }> })` and handlers must `await params` before reading.

Affected files:
- `apps/clinic/app/api/patients/[id]/relationship/route.ts`
- `apps/clinic/app/api/patients/[id]/route.ts`
- `apps/clinic/app/api/doctor/patients/[id]/route.ts`
- `apps/clinic/app/api/admin/patient/[gpId]/care-network/route.ts`
- `apps/clinic/app/api/frontdesk/patients/[id]/phone-correction/route.ts`
- `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts`
- `apps/clinic/app/api/public/invoice/[paymentId]/route.ts`
- `apps/clinic/app/api/clinic/phone-change-requests/[id]/reject/route.ts`
- `apps/clinic/app/api/clinic/phone-change-requests/[id]/approve/route.ts`
- `apps/patient/app/api/patients/[id]/relationship/route.ts`
- `apps/patient/app/api/patients/[id]/route.ts`
- `apps/patient/app/api/patient/sharing/[shareId]/extend/route.ts`
- `apps/patient/app/api/patient/sharing/[shareId]/revoke/route.ts`
- `apps/patient/app/api/patient/medications/[id]/route.ts`
- `apps/patient/app/api/patient/dependents/[id]/route.ts`
- `apps/patient/app/api/patient/delegations/[id]/accept/route.ts`
- `apps/patient/app/api/patient/delegations/[id]/capabilities/route.ts`
- `apps/patient/app/api/patient/delegations/[id]/revoke/route.ts`

Also: any **shared handler** in `packages/shared/lib/api/handlers/**/[id]/*.ts` that takes `params` from the caller — those route-shim wrappers re-export the shared handler; if the shared handler's signature changes, the route-shim type contract changes too. Inventory pass before execution.

### Dynamic page.tsx files — `params` is now `Promise<...>` (5 pages)

Same migration: signature `({ params }: { params: { id: string } })` becomes `Promise<{ id: string }>` and the component (server-async or client-async) awaits.

Affected files:
- `apps/clinic/app/(doctor)/doctor/patients/[id]/page.tsx`
- `apps/clinic/app/invoice/[paymentId]/page.tsx`
- `apps/clinic/app/(frontdesk)/frontdesk/appointments/[id]/edit/page.tsx`
- `apps/clinic/app/(frontdesk)/frontdesk/invoice/[paymentId]/page.tsx`
- `apps/patient/app/(patient)/patient/settings/family/[id]/page.tsx`

### `cookies()` / `headers()` / `draftMode()` callsites — now async (5 callsites)

Affected files:
- `apps/clinic/app/api/clinic/leave/route.ts`
- `packages/shared/lib/supabase/server.ts` — `createClient()` uses `cookies()` internally; the `await` becomes required.
- `packages/shared/lib/api/handlers/clinic/set-active-doctor/handler.ts`
- `packages/shared/lib/api/handlers/clinic/switch/handler.ts`
- `packages/shared/lib/data/clinic-context.ts`

`packages/shared/lib/supabase/server.ts` is the load-bearing site — its `createClient()` is awaited by every server-component / server-action / route-handler in the codebase. The migration here is mechanical (`const cookieStore = await cookies()`) but must be paired with type adjustments inside the `getAll`/`setAll` cookies helpers.

### `themeColor` migration — ALREADY DONE per K-3 (no action)

`grep -rln "themeColor:" apps packages --include='*.tsx' --include='*.ts'` returned 3 hits — all already inside `viewport` exports (Next 14.2+ idiom, forward-compatible with Next 15):
- `apps/patient/app/layout.tsx` (K-3, 2026-05-15)
- `apps/patient/app/(auth)/intro/page.tsx` (K-3)
- `apps/clinic/app/layout.tsx`

### `useFormState` callsites — NONE (no action)

`grep -rln 'useFormState' apps packages --include='*.tsx' --include='*.ts'` returned 0 hits. Codebase never adopted the React 18 hook, so the React 19 rename to `useActionState` is a no-op.

### `experimental.instrumentationHook: true` — REMOVE (2 files)

Bundle 6 added this flag to both apps' `next.config.js` to enable the Next 14.2 `instrumentation.ts` hook. Next 15 makes the hook default-on; remove the flag.

### Caching defaults — `fetch` no longer auto-caches by default (audit needed)

Next 15 changes the default cache behavior of `fetch()` from "force-cache" to "no-store". Any `fetch()` call in server components / route handlers that relied on the implicit cache will start hitting the network on every request. Inventory pass: `grep -rn "fetch(" apps packages --include='*.ts' --include='*.tsx'` (excluding node_modules / .next) — flag any callsite that depends on implicit caching for performance, and add `{ cache: 'force-cache' }` explicitly.

### Removed Next APIs — survey needed

Next 15 removes a small number of APIs (e.g., certain `<Image>` props, the `next/legacy/image` import). Survey pass during migration; surface any to Mo via the STOP-condition if they break user-visible UX.

### `vercel.json` engines — may need bump to Node 20+

Next 15 requires Node 20+ on Vercel (vs 18 on Next 14). Verify the runtime per the [Next 15 release notes](https://nextjs.org/blog/next-15) at migration time; update `engines` or Vercel project Node version if needed.

## Step-by-step execution checklist (Mac-side cowork session)

```bash
# Pre-flight snapshot for revert safety
git log -1 --format=%H > /tmp/pre-next-15-head.txt
npm ls next  # confirm 14.2.35 baseline

# 1. Bump deps at root + per-app
npm install next@15 --save
npm install react@latest react-dom@latest --save
npm install eslint-config-next@15 --save-dev
# Repeat for both workspaces if package-lock doesn't propagate:
npm install next@15 -w @medassist/clinic
npm install next@15 -w @medassist/patient
npm install eslint-config-next@15 -w @medassist/clinic
npm install eslint-config-next@15 -w @medassist/patient

# 2. Run type-check; iterate per failure
npm run type-check
npm run type-check -w @medassist/clinic
npm run type-check -w @medassist/patient

# 3. Mechanical migrations (apply per inventory above):
#    - 18 API route handlers: params → Promise<{...}>
#    - 5 page.tsx: params → Promise<{...}>
#    - 5 cookies()/headers() callsites: add await
#    - apps/{clinic,patient}/next.config.js: remove instrumentationHook flag

# 4. lint:scopes (catch any new admin-scope work)
npm run lint:scopes

# 5. Build both apps locally
npm run build -w @medassist/clinic
npm run build -w @medassist/patient

# 6. Optional: dev smoke
npm run dev -w @medassist/patient &
npm run dev -w @medassist/clinic &

# 7. Commit + push as ONE bundled L-7 commit
```

If any step surfaces a breaking change that requires UX rework (per the Phase L prompt's STOP condition #4), pause and surface to Mo.

## Dependabot Deferral A status update

Audit ref: `audits/dependabot-triage-2026-05-08.md` (Deferral A = Next 14 → 15). This bundle ships the **plan**; execution closes the deferral.

## Cross-references

- `audits/b07-phase-l-cowork-prompt-2026-05-15.md` §Bundle 7 / L-7 (origin spec)
- `audits/dependabot-triage-2026-05-08.md` (Deferral A)
- Next 15 release notes: https://nextjs.org/blog/next-15
- Next 15 upgrade guide: https://nextjs.org/docs/app/building-your-application/upgrading/version-15
- DECISIONS_LOG.md D-092 (deferral rationale, this bundle)
