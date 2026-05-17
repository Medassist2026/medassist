import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { getCurrentUser } from '@shared/lib/auth/session'

/**
 * Patient-app onboarding splash (K-3a, 2026-05-15, D-085).
 *
 * The canonical first-touch surface for the patient app. Users land here
 * from the bare `/` redirect (`apps/patient/app/page.tsx`). Authenticated
 * patients are short-circuited to their dashboard; anyone else sees the
 * splash + two CTAs ("Sign in" → `/auth` login tab; "Register" → `/auth`
 * register tab).
 *
 * Pre-K-3 this route was a 404 (I-7) — `apps/patient/app/page.tsx`
 * redirected `/` to `/intro` but no destination existed. Phase J Mo
 * ratification 2026-05-15 ruled option (a): build a real splash page,
 * not just collapse the redirect.
 *
 * Patient-only by D-085 — there is no role selector here; the patient
 * app has a patient-only auth surface (per K-3b in the same bundle).
 * Doctor + frontdesk auth lives in the clinic app on a separate
 * deployment.
 *
 * Mobile-first per overall patient-app architecture (PWA on mobile is
 * the canonical delivery channel; desktop is a side benefit).
 */

export const metadata: Metadata = {
  title: 'MedAssist — صحتك معك في كل مكان',
  description:
    'سجل دخولك أو أنشئ حساب جديد لإدارة سجلك الطبي ومشاركته مع أطبائك.',
}

export const viewport: Viewport = {
  themeColor: '#2DBE5C',
}

export default async function IntroPage() {
  // Authenticated patients short-circuit straight to their dashboard —
  // no reason to make them tap through the splash. Non-patient sessions
  // (rare; shouldn't happen since this app only serves patients post
  // K-3b) also fall through to the splash.
  const user = await getCurrentUser()
  if (user?.role === 'patient') {
    redirect('/patient/dashboard')
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col items-center justify-center px-6 py-12"
    >
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center shadow-sm">
          <svg
            className="w-7 h-7 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="12" y1="10" x2="12" y2="18" />
            <line x1="8" y1="14" x2="16" y2="14" />
          </svg>
        </div>
        <span className="text-2xl font-bold text-gray-900">MedAssist</span>
      </div>

      {/* Headline */}
      <h1 className="mb-3 text-2xl font-bold text-gray-900 text-center max-w-sm">
        صحتك معك في كل مكان
      </h1>

      {/* Tagline */}
      <p className="mb-10 text-sm text-gray-600 text-center max-w-sm leading-relaxed">
        كل سجلاتك الطبية من جميع الأطباء، في مكان واحد. شارك سجلك مع طبيب
        جديد بضغطة زر — بدون أوراق وبدون تكرار.
      </p>

      {/* CTAs */}
      <div className="w-full max-w-sm space-y-3">
        <Link
          href="/auth?tab=login"
          className="block w-full py-3 bg-primary-600 text-white text-center rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors shadow-sm"
        >
          تسجيل الدخول
        </Link>

        <Link
          href="/auth?tab=register"
          className="block w-full py-3 bg-white text-primary-600 text-center rounded-xl font-bold text-sm border border-primary-200 hover:bg-primary-50 transition-colors"
        >
          إنشاء حساب جديد
        </Link>
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-gray-400 text-center max-w-xs">
        بتسجيل الدخول أنت توافق على شروط الاستخدام وسياسة الخصوصية.
      </p>
    </div>
  )
}
