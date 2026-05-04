import { createClient } from '@shared/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

export type UserRole = 'doctor' | 'patient' | 'frontdesk'

export interface AuthUser {
  id: string
  email: string | null
  phone: string
  role: UserRole
}

export class ApiAuthError extends Error {
  status: 401 | 403

  constructor(message: string, status: 401 | 403) {
    super(message)
    this.name = 'ApiAuthError'
    this.status = status
  }
}

/**
 * Get the current authenticated user
 * Returns null if not authenticated
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }

  // Get user role from public.users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('phone, email, role')
    .eq('id', user.id)
    .single()

  if (userError || !userData) {
    return null
  }

  return {
    id: user.id,
    email: userData.email,
    phone: userData.phone,
    role: userData.role as UserRole
  }
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }
  
  return user
}

/**
 * Require specific role - redirect to appropriate dashboard if wrong role
 */
export async function requireRole(requiredRole: UserRole | UserRole[]): Promise<AuthUser> {
  const user = await requireAuth()
  const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
  
  if (!allowedRoles.includes(user.role)) {
    // Redirect to their correct dashboard
    if (user.role === 'doctor') {
      redirect('/doctor/dashboard')
    } else if (user.role === 'frontdesk') {
      redirect('/frontdesk/dashboard')
    } else {
      redirect('/patient/dashboard')
    }
  }
  
  return user
}

/**
 * Require authentication for API routes (no redirects)
 */
export async function requireApiAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()

  if (!user) {
    throw new ApiAuthError('Unauthorized', 401)
  }

  return user
}

/**
 * Require specific role for API routes (no redirects)
 */
export async function requireApiRole(requiredRole: UserRole | UserRole[]): Promise<AuthUser> {
  const user = await requireApiAuth()
  const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]

  if (!allowedRoles.includes(user.role)) {
    throw new ApiAuthError('Forbidden', 403)
  }

  return user
}

/**
 * Require a Supabase service-role bearer for an API route.
 *
 * Use this for endpoints that are reachable only via internal admin /
 * verification tooling — not by any authenticated end-user role. Intended
 * for `/api/admin/*` paths where even a doctor token must NOT grant
 * access (e.g. global identity lookups that resolve any phone in the
 * network — a privacy regression if exposed to per-clinic operators).
 *
 * Contract:
 *   - Header `Authorization: Bearer <token>` is required.
 *   - `<token>` must equal `process.env.SUPABASE_SERVICE_ROLE_KEY` byte for
 *     byte (timing-safe compare).
 *   - Any other shape (missing header, wrong scheme, wrong token, missing
 *     env var) throws `ApiAuthError(401)`. We deliberately surface 401
 *     (not 403) for "wrong token" — there is exactly one acceptable
 *     credential, and we don't want to leak whether the env var is set
 *     by responding 500 in misconfigured environments.
 *
 * Side note: returning 401 for both "no header" and "wrong token" makes
 * the endpoint indistinguishable from "endpoint doesn't accept user
 * auth" to a doctor token, which is what we want.
 */
export function requireServiceRole(request: Request): void {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Even if the env var is missing we 401 rather than 500 — see contract
  // above. The deployment health-check is a separate concern.
  if (!expected || expected.length === 0) {
    throw new ApiAuthError('Unauthorized', 401)
  }

  const header = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]
  if (!token || token.length === 0) {
    throw new ApiAuthError('Unauthorized', 401)
  }

  // Timing-safe compare requires equal-length buffers; we explicitly
  // length-check first to avoid throwing inside timingSafeEqual.
  const a = Buffer.from(token, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ApiAuthError('Unauthorized', 401)
  }
}

/**
 * Convert auth/redirect failures to API-safe responses.
 */
export function toApiErrorResponse(error: any, fallbackMessage: string) {
  if (error instanceof ApiAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const digest = typeof error?.digest === 'string' ? error.digest : ''
  if (digest.startsWith('NEXT_REDIRECT;')) {
    const parts = digest.split(';')
    const redirectPath = parts[2] || ''
    const isLoginRedirect = redirectPath.startsWith('/login')

    return NextResponse.json(
      { error: isLoginRedirect ? 'Unauthorized' : 'Forbidden' },
      { status: isLoginRedirect ? 401 : 403 }
    )
  }

  return NextResponse.json(
    { error: error?.message || fallbackMessage },
    { status: 500 }
  )
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * Check if user is authenticated (for conditional rendering)
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

// ============================================================================
// CLINIC MEMBERSHIP & ROLES
// ============================================================================

export interface ClinicMembership {
  clinic_id: string
  role: 'OWNER' | 'DOCTOR' | 'ASSISTANT' | 'FRONT_DESK'
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
  clinic?: { id: string; name: string; default_visibility: string }
}

/**
 * Get user's clinic memberships
 * Returns all active clinic memberships for a user
 */
export async function getUserMemberships(userId: string): Promise<ClinicMembership[]> {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('auth-memberships')

  const { data } = await supabase
    .from('clinic_memberships')
    .select('clinic_id, role, status, clinics(id, name, default_visibility)')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')

  return (data || []).map((m: any) => ({
    clinic_id: m.clinic_id,
    role: m.role,
    status: m.status,
    clinic: m.clinics
  }))
}

/**
 * Get user's role in a specific clinic
 */
export async function getClinicRole(userId: string, clinicId: string): Promise<string | null> {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('auth-clinic-role')

  const { data } = await supabase
    .from('clinic_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'ACTIVE')
    .single()

  return data?.role || null
}

/**
 * Get assistant's assigned doctors in a clinic
 */
export async function getAssignedDoctors(userId: string, clinicId: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('auth-assignments')

  const { data } = await supabase
    .from('assistant_doctor_assignments')
    .select('doctor_user_id, scope, users!assistant_doctor_assignments_doctor_user_id_fkey(id, phone, email)')
    .eq('assistant_user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'ACTIVE')

  return data || []
}
