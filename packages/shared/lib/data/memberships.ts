/**
 * Clinic membership management
 */

export interface Membership {
  id: string
  clinic_id: string
  user_id: string
  role: 'OWNER' | 'DOCTOR' | 'ASSISTANT' | 'FRONT_DESK'
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
  created_at: string
  user?: { phone: string; email: string; name?: string }
}

export async function getClinicMembers(clinicId: string): Promise<Membership[]> {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('memberships')

  const { data } = await supabase
    .from('clinic_memberships')
    .select('*, users(phone, email)')
    .eq('clinic_id', clinicId)
    .order('role', { ascending: true })
    .order('created_at', { ascending: true })

  return (data || []).map((m: any) => ({
    ...m,
    user: m.users
  }))
}

export async function inviteMember(params: {
  clinicId: string
  userId: string
  role: 'DOCTOR' | 'ASSISTANT' | 'FRONT_DESK'
  invitedBy: string
}) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('memberships')

  const { data, error } = await supabase
    .from('clinic_memberships')
    .insert({
      clinic_id: params.clinicId,
      user_id: params.userId,
      role: params.role,
      status: 'INVITED',
      created_by: params.invitedBy,
    })
    .select()
    .single()

  return { data, error }
}

export async function updateMemberRole(membershipId: string, role: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('memberships')

  const { data, error } = await supabase
    .from('clinic_memberships')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', membershipId)
    .select()
    .single()

  return { data, error }
}

export async function suspendMember(membershipId: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('memberships')

  const { data, error } = await supabase
    .from('clinic_memberships')
    .update({ status: 'SUSPENDED', updated_at: new Date().toISOString() })
    .eq('id', membershipId)
    .select()
    .single()

  return { data, error }
}

export async function activateMember(membershipId: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('memberships')

  const { data, error } = await supabase
    .from('clinic_memberships')
    .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
    .eq('id', membershipId)
    .select()
    .single()

  return { data, error }
}
