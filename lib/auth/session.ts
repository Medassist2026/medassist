import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

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
