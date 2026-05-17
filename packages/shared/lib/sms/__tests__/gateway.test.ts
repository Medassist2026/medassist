/**
 * Smoke tests for the SmsGateway abstraction (Phase L Bundle 3 / L-2-config).
 * Hand-rolled assertion harness — same pattern as phone-normalize.test.ts.
 *
 * Run with:
 *   npx tsx packages/shared/lib/sms/__tests__/gateway.test.ts
 *
 * Coverage: factory selection by DEV_BYPASS_OTP, ConsoleLogSmsGateway round-trip,
 * locale templating, type-shape conformance. Does NOT exercise TwilioSmsGateway's
 * network path (that's gated on real Twilio credentials).
 */

import {
  ConsoleLogSmsGateway,
  TwilioSmsGateway,
  getSmsGateway,
  __resetSmsGatewayForTests,
  type SmsGateway,
} from '../gateway'

let passed = 0
let failed = 0

function test(name: string, fn: () => boolean | Promise<boolean>): void {
  let ok: boolean | Promise<boolean> = false
  let threw: unknown = null
  try {
    ok = fn()
  } catch (err) {
    threw = err
  }
  if (threw !== null) {
    console.log(`  ✗ ${name} (threw: ${(threw as Error)?.message ?? threw})`)
    failed += 1
    return
  }
  Promise.resolve(ok).then((result) => {
    if (result) {
      console.log(`  ✓ ${name}`)
      passed += 1
    } else {
      console.log(`  ✗ ${name}`)
      failed += 1
    }
  })
}

async function asyncTest(name: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    const ok = await fn()
    if (ok) {
      console.log(`  ✓ ${name}`)
      passed += 1
    } else {
      console.log(`  ✗ ${name}`)
      failed += 1
    }
  } catch (err) {
    console.log(`  ✗ ${name} (threw: ${(err as Error)?.message ?? err})`)
    failed += 1
  }
}

async function main(): Promise<void> {
  console.log('\n=== SmsGateway factory selection ===\n')

  process.env.DEV_BYPASS_OTP = 'true'
  __resetSmsGatewayForTests()
  await asyncTest('DEV_BYPASS_OTP=true returns ConsoleLogSmsGateway', async () => {
    const g = getSmsGateway()
    return g instanceof ConsoleLogSmsGateway
  })

  process.env.DEV_BYPASS_OTP = 'false'
  __resetSmsGatewayForTests()
  await asyncTest('DEV_BYPASS_OTP=false returns TwilioSmsGateway', async () => {
    const g = getSmsGateway()
    return g instanceof TwilioSmsGateway
  })

  delete process.env.DEV_BYPASS_OTP
  __resetSmsGatewayForTests()
  await asyncTest('DEV_BYPASS_OTP unset returns TwilioSmsGateway (production-equivalent)', async () => {
    const g = getSmsGateway()
    return g instanceof TwilioSmsGateway
  })

  await asyncTest('getSmsGateway() is cached per process', async () => {
    process.env.DEV_BYPASS_OTP = 'true'
    __resetSmsGatewayForTests()
    const a = getSmsGateway()
    const b = getSmsGateway()
    return a === b
  })

  console.log('\n=== ConsoleLogSmsGateway round-trip ===\n')

  const console_log_original = console.log
  let captured = ''
  console.log = (...args: unknown[]) => {
    captured += args.join(' ') + '\n'
  }

  try {
    const g: SmsGateway = new ConsoleLogSmsGateway()

    captured = ''
    const otp = await g.sendOtp({
      phone: '+201500099999',
      code: '123456',
      locale: 'ar',
      purpose: 'registration',
    })
    console.log = console_log_original
    await asyncTest('sendOtp returns success', async () => otp.success === true)
    await asyncTest('sendOtp produces a messageId', async () =>
      typeof otp.messageId === 'string' && otp.messageId.startsWith('console_'))
    await asyncTest('sendOtp Arabic body contains the OTP code', async () =>
      captured.includes('123456') && captured.includes('MedAssist'))

    console.log = (...args: unknown[]) => {
      captured += args.join(' ') + '\n'
    }
    captured = ''
    const sc = await g.sendShareConsent({
      phone: '+201500099999',
      clinicName: 'عيادة الدكتور أحمد',
      doctorName: 'أحمد علي',
      privacyCode: '654321',
      expiresInMinutes: 30,
      locale: 'ar',
    })
    console.log = console_log_original
    await asyncTest('sendShareConsent returns success', async () => sc.success === true)
    await asyncTest('sendShareConsent body includes the privacy code', async () =>
      captured.includes('654321'))
    await asyncTest('sendShareConsent body includes the doctor name', async () =>
      captured.includes('أحمد علي'))

    console.log = (...args: unknown[]) => {
      captured += args.join(' ') + '\n'
    }
    captured = ''
    const exp = await g.sendShareExpiring({
      phone: '+201500099999',
      grantedToClinicName: 'Clinic A',
      expiresInMinutes: 15,
      locale: 'en',
    })
    console.log = console_log_original
    await asyncTest('sendShareExpiring English body uses provided clinic name', async () =>
      captured.includes('Clinic A') && captured.includes('15 minutes'))
    await asyncTest('sendShareExpiring returns success', async () => exp.success === true)
  } finally {
    console.log = console_log_original
  }

  console.log('\n=== TwilioSmsGateway with placeholder credentials (stubs) ===\n')

  // twilio-client.ts detects placeholder credentials and stubs cleanly. With
  // env vars unset, sendSMS returns success+stub_<ts>. That behavior carries
  // through to TwilioSmsGateway.
  delete process.env.TWILIO_ACCOUNT_SID
  delete process.env.TWILIO_AUTH_TOKEN
  delete process.env.TWILIO_PHONE_NUMBER

  const tg = new TwilioSmsGateway()
  const r = await tg.sendOtp({
    phone: '+201500099999',
    code: '123456',
    locale: 'ar',
  })
  await asyncTest('TwilioSmsGateway stubs cleanly when credentials are absent', async () =>
    r.success === true && typeof r.messageId === 'string' && r.messageId.startsWith('stub_'))

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
