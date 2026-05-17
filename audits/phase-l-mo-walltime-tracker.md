# B07 Phase L — Mo wall-time tracker

> Living document. Tracks Phase L Tier 3 workstreams that cowork does NOT
> execute (vendor procurement, domain registration, legal/regulatory). Cowork
> picks up each item when Mo's wall-time work completes.

**Last updated:** 2026-05-16 (created during Phase L Bundle 3 / L-2-config)

---

## L-2 — SMS Gateway Procurement

**Status:** pending Mo

**Cowork recommendation:** **Twilio Egypt** as primary.
- Healthcare-grade reliability + Arabic SMS support out-of-the-box
- Egyptian short-code / sender-ID registration tooling matches NTRA conventions
- Existing `twilio-client.ts` primitive already wired (just needs real
  credentials to flip from stub to real-send mode)

**Alternative:** Vonage (formerly Nexmo). Comparable healthcare-grade vendor
with international experience. Pick if Twilio Egypt onboarding is blocked.

**Avoid unless cost is the primary driver:** Wassup, smaller regional carriers
— weaker SLAs, less PHI-handling tooling.

**What Mo delivers:**
1. Vendor account + credentials:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER` (or alphanumeric sender ID)
2. Sender ID / short code registered with Egyptian NTRA if vendor requires it
3. Test budget for SMS volume during Phase M dry-runs (~100-500 messages
   should be plenty for the matrix + smoke-test runs)
4. Vercel env-var configuration at Production scope:
   - `TWILIO_ACCOUNT_SID` (production)
   - `TWILIO_AUTH_TOKEN` (production, encrypted)
   - `TWILIO_PHONE_NUMBER` (production)
   - Leave the same vars unset / placeholder at Preview scope — the
     placeholder-detection in `twilio-client.ts` stubs cleanly so preview
     deploys keep working without burning test SMS budget

**Estimated wall-time:** 1-3 weeks depending on vendor onboarding + NTRA
sender-ID approval (Egyptian telecom regulator paperwork is the long pole).

**Cowork next-action when Mo delivers:**
1. Verify `getSmsGateway()` returns `TwilioSmsGateway` in production
2. Smoke-test one real OTP send from staging-preview-of-production to a real
   Egyptian number (Mo's phone)
3. Verify Sentry / log drain captures the Twilio API response
4. Surface a brief "Phase L L-2 vendor live" commit to the docs
5. ~2 hours cowork

**Phase M dependency:** real OTP testing during Phase M dry-runs requires
this vendor live. If Mo wants to soft-launch Phase M against staging-only
fake-OTP, that's possible — but the production release sequence is gated.

**Code abstraction in place:** `packages/shared/lib/sms/gateway.ts` ships the
`SmsGateway` interface + `TwilioSmsGateway` (today's only adapter, delegates
to existing `sendSMS` primitive) + `ConsoleLogSmsGateway` (default when
`DEV_BYPASS_OTP=true`). When Mo's procurement lands, this file is the
single migration site — no scattered `sendSMS` callers to update. Existing
low-level `sendSMS` callers continue to work; new code uses the gateway.

---

## L-4 — Sentry DSN + Source-Map Upload (cowork wiring DONE; Mo provisioning pending)

**Status:** cowork wiring shipped in Bundle 6 (L-4, 2026-05-16). Mo provisions
the Sentry org + DSN.

**Cowork wiring (already shipped):**
- `apps/{clinic,patient}/instrumentation.ts` runs `initSentry()` server-side at boot
- `SentryInit` client component mounted into each app's root layout (browser-side init)
- `Sentry.captureException` calls in both apps' `error.tsx` + `global-error.tsx`
  with route tagging (`error_boundary: 'route' | 'global'`, `app: 'clinic' | 'patient'`)
- `beforeSend` PHI redaction: strips Authorization + Cookie headers
- Replay configured with `maskAllText: true` + `blockAllMedia: true`
- No-op when `NEXT_PUBLIC_SENTRY_DSN` is unset

**What Mo delivers:**
1. **Sentry account + project:**
   - Create an Anthropic / personal Sentry org (or use existing)
   - Create a Next.js project per app (or one shared project with the
     `app:'clinic'|'patient'` tag distinguishing — recommended for the
     small-org-quota case)
   - Capture `NEXT_PUBLIC_SENTRY_DSN` from project Settings → Client Keys
2. **Vercel env-var configuration:**
   - `NEXT_PUBLIC_SENTRY_DSN` at Production scope (per project: clinic, patient)
   - Leave unset at Preview scope unless you want preview-deploy errors
     in Sentry too (Sentry free tier is 5k events/month — Preview events
     can chew through that fast)
3. **(Optional) Source-map upload:**
   - Run `npx @sentry/wizard@latest -i nextjs` locally — wizard prompts
     for an auth token and updates `next.config.js` to wrap with
     `withSentryConfig`. Adds source-map upload to the Vercel build.
   - `SENTRY_AUTH_TOKEN` at Production scope (encrypted) per project
   - Cowork can do step 3 follow-up — ~30 min — once you provide the
     auth token. Without it Sentry still receives errors, just with
     minified stack traces.

**Estimated wall-time:** 30-60 minutes for steps 1+2; another 30 min for
optional source-map setup.

**Cowork next-action when Mo delivers:**
1. Smoke-test: trigger a deliberate error in staging-preview-of-production
   and verify Sentry receives it (server side: any route handler throw;
   client side: throw from a button onClick)
2. Verify the `app:` and `error_boundary:` tags surface correctly in Sentry UI
3. (Optional) Run the Sentry wizard to add `withSentryConfig`; verify
   source maps upload during the next Vercel deploy
4. Surface a brief "Phase L L-4 live" commit

**Code abstraction in place:** all integration points are in
`packages/shared/lib/sentry.tsx` + `packages/shared/lib/sentry-client-init.tsx`
+ per-app `instrumentation.ts`. When Mo's DSN lands, no code change needed
unless source-map upload is also wanted.

---

## L-4 — Synthetic Uptime Monitoring (Mo wall-time)

**Status:** pending Mo

**Cowork recommendation:**
- **Primary:** Vercel native uptime monitoring (if available on Mo's
  Vercel plan — Hobby tier does not include this; Pro tier does).
- **Fallback:** Better Uptime, UptimeRobot, or Pingdom. Better Uptime
  has free tier sufficient for 1-2 endpoints (clinic + patient root).

**What Mo delivers:**
1. Decision: native Vercel vs third-party
2. If third-party: account + monitor for production root URLs
   (`https://clinic.medassist.eg/` and `https://app.medassist.eg/`
    once L-5 domain lands; placeholder Vercel preview URLs in the meantime)

**Estimated wall-time:** 30 min.

**Cowork next-action when Mo delivers:** verify alerts route to Mo's
email/SMS/Slack of choice. No code change needed.

---

## L-5 — Domain Procurement + DNS

**Status:** pending Mo

**Cowork recommendation:**
- **Primary domain:** `medassist.eg` if available + affordable
  - Fallback if unavailable: `medassist-eg.com` or similar `.com` form
- **Subdomain split:**
  - `clinic.medassist.eg` → `medassist-clinic` Vercel project (doctor + frontdesk)
  - `app.medassist.eg` or `patient.medassist.eg` → `medassist-patient` Vercel project
  - `api.medassist.eg` — reserved for future direct-API surface (no current need)
- **Registrar:** any reputable registrar (Namecheap, Cloudflare, Egyptian
  registrar). Vercel auto-handles SSL via Let's Encrypt.

**What Mo delivers:**
1. Domain registration
2. DNS records pointed at Vercel per
   `https://vercel.com/docs/projects/domains/add-a-domain` (A / CNAME
   per Vercel's per-project instructions)
3. Notification when DNS propagation is live (typically 24-48h after change)

**Estimated wall-time:** 1-2 days for procurement + 24-48h for DNS
propagation.

**Cowork next-action when Mo delivers:**
1. Update `NEXT_PUBLIC_APP_URL` in Vercel env vars for both projects to
   the production domain
2. Verify SSL handshake (`curl -I https://clinic.medassist.eg` should
   return 200 + valid cert chain)
3. Smoke-test the production URL — `/auth` for clinic, `/intro` for patient
4. Surface a brief "Phase L L-5 domain live" commit
5. ~30 minutes cowork

**Code abstraction in place:** `NEXT_PUBLIC_APP_URL` already documented
in both `.env.example` files with placeholder + L-5 cross-reference. No
hardcoded production URLs to migrate.

---

## L-6 — Legal + Regulatory

**Status:** pending Mo

**Scope:**
- **Terms of Service** (Egyptian jurisdiction; doctor + patient versions
  may need to be separate documents)
- **Privacy Policy** — Egyptian Personal Data Protection Law (PDPL)
  compliance:
  - Data-subject access endpoint (PDPL right-of-access)
  - Data-deletion endpoint (PDPL right-to-be-forgotten — has carve-outs for
    healthcare records under retention obligations; legal counsel rules)
  - Breach-notification SOP (PDPL requires regulator notification within
    72 hours of a breach being detected)
- **Egyptian Ministry of Health licensing** — Mo investigates whether
  MedAssist as a SaaS platform needs a health-data-controller license
  vs operating purely as a B2B clinic tool
- **Egyptian Drug Authority** — only relevant if MedAssist adds direct
  e-prescribing-to-pharmacy (currently we generate PDF prescriptions; the
  pharmacy handover is paper). Mo confirms if/when scope changes.
- **Cookie consent banner** — currently no tracking beyond strictly-necessary
  (no Google Analytics, no marketing pixels). Not required pre-launch
  unless that changes.
- **Patient-data residency** — confirm Supabase project region matches
  PDPL data-residency requirements. Current staging project
  `medassist-egypt` is in `eu-central-1` (Frankfurt). If PDPL requires
  in-country storage, project migration is a multi-week effort that needs
  its own forensic prompt.

**What Mo delivers:**
1. Drafted policies (via legal counsel)
2. Regulatory confirmations / licensing status
3. Decision on data-residency: stay in `eu-central-1` (with PDPL
   adequacy argument) or migrate to a MENA region

**Estimated wall-time:** weeks (legal counsel pace dominant; regulator
paperwork on top).

**Cowork next-action when Mo delivers:**
1. Wire consent banner UI if Mo's legal counsel requires it
2. Implement data-export endpoint if required by PDPL right-of-access
3. Implement data-deletion endpoint if required by PDPL
   right-to-be-forgotten (carefully — healthcare-record retention
   obligations may carve out some categories)
4. Update STATE_OF_WORK + PROGRAM_STATE with regulatory-compliance
   closure
5. ~1-3 days cowork depending on scope

**Phase M / production-launch dependency:**
- Soft-launch / closed-beta MAY proceed with placeholder policies if Mo
  accepts the risk and the closed-beta cohort signs a separate consent
  form acknowledging the alpha state.
- **Broad public launch is gated on this work** — running real PHI through
  the production deployment without PDPL-compliant policies is a regulatory
  exposure that Mo's legal counsel will need to bless.

---

## Mo dashboard checklist — Phase L env-var split (L-2-config, Bundle 3)

This is **not** a wall-time block — it's a configuration step Mo runs in
the Vercel dashboard once for each project. Captured here for completeness
alongside the related L-2 vendor work.

**For both `medassist-clinic` and `medassist-patient` Vercel projects:**

| Scope | DEV_BYPASS_OTP | NEXT_PUBLIC_OTP_BYPASS_HINT |
|---|---|---|
| Production | unset (or `false`) | unset (or `false`) |
| Preview | `true` | `true` |
| Development | `true` (or rely on `apps/*/.env.local`) | `true` |

**Why:**
- Production = real SMS via `TwilioSmsGateway` once L-2 vendor lands
- Preview = `ConsoleLogSmsGateway` (no real SMS; bypass hint on UI)
- Development = same as Preview, but mostly governed by `.env.local`

**Default supplied by vercel.json `env` block:** both `apps/clinic/vercel.json`
and `apps/patient/vercel.json` set `DEV_BYPASS_OTP=true` +
`NEXT_PUBLIC_OTP_BYPASS_HINT=true` as the Preview-env defaults. Production-scope
overrides supersede the vercel.json defaults — that's the standard Vercel
precedence rule.

**Verification step Mo runs once Production env vars are configured:**
1. Open `medassist-clinic` Vercel project → Settings → Environment Variables
2. Confirm:
   - Production scope: `DEV_BYPASS_OTP` is **NOT** listed (or is set to `false`)
   - Preview scope: `DEV_BYPASS_OTP=true` (or inherited from vercel.json)
3. Repeat for `medassist-patient`

---

## Glossary

- **Path A vs Path B:** Path A = cowork has Vercel CLI access and provisions
  the project autonomously. Path B = Mo runs the dashboard work; cowork
  ships the artifacts. Phase L Bundle 1 (L-1) took Path B because the
  cowork sandbox doesn't include the Vercel CLI.
- **NTRA:** Egyptian National Telecom Regulatory Authority. Assigns mobile
  carrier prefixes (10/11/12/15) and approves sender IDs for SMS.
- **PDPL:** Egyptian Personal Data Protection Law (2020). Governs how PHI
  may be stored, processed, transferred, and deleted.

---

*Update this file whenever:*
- *Mo procures a vendor* (mark "delivered <date>", note credentials handoff completion)
- *Cowork picks up the post-procurement wiring work* (link the cowork commit)
- *A Tier 3 item finalizes* (move to STATE_OF_WORK Completed workstreams; leave a stub here pointing to the audit doc)
