/**
 * Audit event logging for medical-grade compliance
 */

export type AuditAction =
  | 'VIEW_PATIENT'
  | 'EDIT_PATIENT'
  | 'CREATE_PATIENT'
  | 'VIEW_CLINICAL_NOTE'
  | 'CREATE_CLINICAL_NOTE'
  | 'VIEW_PRESCRIPTION'
  | 'PRINT_PRESCRIPTION'
  | 'CREATE_APPOINTMENT'
  | 'VIEW_LAB_RESULTS'
  | 'CREATE_LAB_ORDER'
  | 'SHARE_PATIENT'
  | 'REVOKE_SHARE'
  | 'TRANSFER_PATIENT'
  | 'VIEW_VITALS'
  | 'CREATE_VITALS'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT_DATA'

export interface AuditEventParams {
  clinicId?: string
  actorUserId: string
  action: AuditAction
  entityType: string
  entityId?: string
  metadata?: Record<string, any>
}

export async function logAuditEvent(params: AuditEventParams) {
  try {
    const { createAdminClient } = await import('@shared/lib/supabase/admin')
    const supabase = createAdminClient('audit-logging')

    await supabase.from('audit_events').insert({
      clinic_id: params.clinicId || null,
      actor_user_id: params.actorUserId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      metadata: params.metadata || {},
    })
  } catch (error) {
    // Audit logging should never break the app
    console.error('Audit log failed:', error)
  }
}

export async function getAuditLog(
  clinicId: string,
  options?: {
    action?: string
    entityType?: string
    limit?: number
    offset?: number
  }
) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('audit-read')

  let query = supabase
    .from('audit_events')
    .select('*, users!audit_events_actor_user_id_fkey(phone, email)')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  if (options?.action) query = query.eq('action', options.action)
  if (options?.entityType) query = query.eq('entity_type', options.entityType)
  if (options?.limit) query = query.limit(options.limit)
  if (options?.offset)
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)

  const { data, error } = await query
  return { data: data || [], error }
}
