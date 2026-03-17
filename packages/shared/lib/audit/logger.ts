import { createAdminClient } from '@shared/lib/supabase/admin'

export interface AuditLogParams {
  userId: string
  userRole: string
  action: string // 'create', 'read', 'update', 'delete', 'merge', 'login', 'logout'
  resourceType?: string
  resourceId?: string
  details?: Record<string, any>
  ipAddress?: string
}

/**
 * Log audit events for compliance and debugging
 * Fire-and-forget pattern - does not block main flow
 * Gracefully handles errors
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  // Fire-and-forget with error handling
  void (async () => {
    try {
      const admin = createAdminClient('audit-log')

      await admin
        .from('audit_log')
        .insert({
          user_id: params.userId,
          user_role: params.userRole,
          action: params.action,
          resource_type: params.resourceType || null,
          resource_id: params.resourceId || null,
          details: params.details || null,
          ip_address: params.ipAddress || null,
          created_at: new Date().toISOString()
        })
    } catch (error) {
      // Gracefully handle errors without blocking main flow
      console.error('[AuditLog] Failed to log audit event:', error)
    }
  })()
}
