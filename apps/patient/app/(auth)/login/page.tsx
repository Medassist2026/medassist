import { redirect } from 'next/navigation'

/**
 * `/login` alias for `/auth` (K-4a, 2026-05-15, Mo's Phase J I-8 ruling).
 *
 * Pre-K-4 the directory `apps/patient/app/(auth)/login/` was empty
 * (Finding I-8). Mo ratified the option: create `/login` as an alias
 * for the patient-only `/auth` page (post-K-3b: bare `/auth`, no
 * `?role=` param) rather than delete the directory. Rationale:
 * defensive against deep-link bookmarks, password manager autofills
 * (which often default to `/login`), and browser history.
 *
 * The redirect preserves the `?tab=` query param so password-manager
 * autofills targeting `/login?tab=register` continue to work post-
 * redirect.
 */
export default function LoginAlias({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const tab = searchParams?.tab === 'register' ? 'register' : 'login'
  redirect(`/auth?tab=${tab}`)
}
