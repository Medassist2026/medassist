/**
 * SMS Gateway abstraction (Phase L, 2026-05-16)
 * ─────────────────────────────────────────────
 *
 * High-level interface for SMS-emitting flows. Decouples *what we send* (OTP,
 * privacy-code share consent, share-expiring reminder, etc.) from *who sends
 * it* (vendor: Twilio / Vonage / Wassup / etc.).
 *
 * Selection rule:
 *   - `DEV_BYPASS_OTP=true`  → ConsoleLogSmsGateway (logs to stdout; no real
 *     SMS goes out). Default in preview/staging/local.
 *   - `DEV_BYPASS_OTP=false` → TwilioSmsGateway (production). Delegates to the
 *     existing `sendSMS` primitive in `twilio-client.ts`, which itself stubs
 *     cleanly when Twilio credentials are placeholders.
 *
 * Migration path:
 *   The existing low-level `sendSMS(to, body)` in `twilio-client.ts` continues
 *   to work for legacy callers (send-otp handler, prescription-sms,
 *   reminder-service, phone-changes data module, privacy-codes data module).
 *   New SMS-emitting code paths should use this gateway abstraction instead.
 *   The Phase L SMS gateway procurement (L-2 Mo wall-time, see
 *   audits/phase-l-mo-walltime-tracker.md) will plug a real vendor adapter
 *   here; legacy callers can be migrated incrementally afterward.
 *
 * Vendor adapters are listed below. Add one per vendor:
 *   - TwilioSmsGateway (current — wraps existing sendSMS primitive)
 *   - VonageSmsGateway (future, if Mo procures Vonage)
 *   - Mock adapters for tests / dev (ConsoleLogSmsGateway).
 *
 * Cross-references:
 *   - D-082 (OTP scope: rare event, registration + future password-reset only)
 *   - D-088 (OTP digit count = 6)
 *   - D-089 (server-boundary phone regexes: EG_PHONE_RE / E164_RE)
 *   - audits/phase-l-mo-walltime-tracker.md (vendor procurement status)
 */

import { sendSMS } from './twilio-client'

// ============================================================================
// Public types
// ============================================================================

export type SmsLocale = 'ar' | 'en'

export interface SendOtpParams {
  phone: string          // +E.164 form, validated by EG_PHONE_RE upstream
  code: string           // 6-digit OTP per D-088
  locale: SmsLocale
  purpose?:
    | 'registration'
    | 'login'
    | 'password_reset'
    | 'phone_change_old'
    | 'phone_change_new'
    | 'phone_correction'
}

export interface SendShareConsentParams {
  phone: string          // grantee phone, +E.164
  clinicName: string     // grantor's clinic display name
  doctorName: string     // grantor doctor display name
  privacyCode?: string   // 6-digit privacy code (omit for delegated share consent)
  expiresInMinutes: number
  locale: SmsLocale
}

export interface SendShareExpiringParams {
  phone: string          // grantor phone, +E.164
  grantedToClinicName: string
  expiresInMinutes: number
  locale: SmsLocale
}

export interface SendShareExpiredParams {
  phone: string
  grantedToClinicName: string
  locale: SmsLocale
}

export interface SmsResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * High-level SMS gateway. Vendor adapters implement this; callers depend on
 * the interface, not on a specific vendor.
 */
export interface SmsGateway {
  sendOtp(params: SendOtpParams): Promise<SmsResult>
  sendShareConsent(params: SendShareConsentParams): Promise<SmsResult>
  sendShareExpiring(params: SendShareExpiringParams): Promise<SmsResult>
  sendShareExpired(params: SendShareExpiredParams): Promise<SmsResult>
}

// ============================================================================
// Arabic-first message templates (used by both adapters)
// ============================================================================

function otpBody(code: string, locale: SmsLocale): string {
  if (locale === 'en') {
    return `Your MedAssist verification code is: ${code}\nValid for 5 minutes.`
  }
  return `رمز التحقق الخاص بك في MedAssist هو: ${code}\nصالح لمدة ٥ دقائق.`
}

function shareConsentBody(p: SendShareConsentParams): string {
  if (p.locale === 'en') {
    const code = p.privacyCode ? `\nPrivacy code: ${p.privacyCode}` : ''
    return `Dr. ${p.doctorName} from ${p.clinicName} requests access to your medical records.${code}\nLink valid for ${p.expiresInMinutes} minutes.`
  }
  const code = p.privacyCode ? `\nرمز الخصوصية: ${p.privacyCode}` : ''
  return `د. ${p.doctorName} من ${p.clinicName} يطلب الاطلاع على سجلك الطبي.${code}\nصالح لمدة ${p.expiresInMinutes} دقيقة.`
}

function shareExpiringBody(p: SendShareExpiringParams): string {
  if (p.locale === 'en') {
    return `Your record share with ${p.grantedToClinicName} expires in ${p.expiresInMinutes} minutes. Extend or revoke from the MedAssist app.`
  }
  return `صلاحية مشاركة سجلك مع ${p.grantedToClinicName} تنتهي خلال ${p.expiresInMinutes} دقيقة. يمكنك التمديد أو الإلغاء من تطبيق MedAssist.`
}

function shareExpiredBody(p: SendShareExpiredParams): string {
  if (p.locale === 'en') {
    return `Your record share with ${p.grantedToClinicName} has expired.`
  }
  return `انتهت صلاحية مشاركة سجلك مع ${p.grantedToClinicName}.`
}

// ============================================================================
// Adapter: ConsoleLogSmsGateway
//   Default when DEV_BYPASS_OTP=true. Logs the body it WOULD have sent and
//   returns a synthetic messageId. Safe in tests, preview, staging, local.
// ============================================================================

export class ConsoleLogSmsGateway implements SmsGateway {
  async sendOtp(p: SendOtpParams): Promise<SmsResult> {
    return this.log('OTP', p.phone, otpBody(p.code, p.locale))
  }
  async sendShareConsent(p: SendShareConsentParams): Promise<SmsResult> {
    return this.log('SHARE_CONSENT', p.phone, shareConsentBody(p))
  }
  async sendShareExpiring(p: SendShareExpiringParams): Promise<SmsResult> {
    return this.log('SHARE_EXPIRING', p.phone, shareExpiringBody(p))
  }
  async sendShareExpired(p: SendShareExpiredParams): Promise<SmsResult> {
    return this.log('SHARE_EXPIRED', p.phone, shareExpiredBody(p))
  }

  private async log(kind: string, to: string, body: string): Promise<SmsResult> {
    const messageId = `console_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log(`[SMS:${kind}] to=${to} id=${messageId}\n${body}`)
    return { success: true, messageId }
  }
}

// ============================================================================
// Adapter: TwilioSmsGateway
//   Delegates to the existing sendSMS primitive (twilio-client.ts). That
//   primitive already detects placeholder credentials and stubs cleanly, so
//   this adapter inherits that behavior. When Mo procures real Twilio
//   credentials, this adapter starts emitting real SMS.
//
//   A future VonageSmsGateway / WassupSmsGateway would slot in next to this
//   one as additional classes implementing SmsGateway. The factory below
//   picks which adapter to instantiate.
// ============================================================================

export class TwilioSmsGateway implements SmsGateway {
  async sendOtp(p: SendOtpParams): Promise<SmsResult> {
    const r = await sendSMS(p.phone, otpBody(p.code, p.locale))
    return { success: r.success, messageId: r.sid, error: r.error }
  }
  async sendShareConsent(p: SendShareConsentParams): Promise<SmsResult> {
    const r = await sendSMS(p.phone, shareConsentBody(p))
    return { success: r.success, messageId: r.sid, error: r.error }
  }
  async sendShareExpiring(p: SendShareExpiringParams): Promise<SmsResult> {
    const r = await sendSMS(p.phone, shareExpiringBody(p))
    return { success: r.success, messageId: r.sid, error: r.error }
  }
  async sendShareExpired(p: SendShareExpiredParams): Promise<SmsResult> {
    const r = await sendSMS(p.phone, shareExpiredBody(p))
    return { success: r.success, messageId: r.sid, error: r.error }
  }
}

// ============================================================================
// Factory — picks adapter based on env
// ============================================================================

let cachedGateway: SmsGateway | null = null

/**
 * Returns the active SmsGateway for the current environment.
 *   - DEV_BYPASS_OTP=true  → ConsoleLogSmsGateway
 *   - DEV_BYPASS_OTP=false → TwilioSmsGateway (today's only vendor adapter)
 *
 * Cached per process so the gateway is constructed once. Tests can call
 * `__resetSmsGatewayForTests()` between cases.
 */
export function getSmsGateway(): SmsGateway {
  if (cachedGateway) return cachedGateway
  const bypass = process.env.DEV_BYPASS_OTP === 'true'
  cachedGateway = bypass ? new ConsoleLogSmsGateway() : new TwilioSmsGateway()
  return cachedGateway
}

/** Test-only — clears the per-process gateway cache. */
export function __resetSmsGatewayForTests(): void {
  cachedGateway = null
}
