export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/expire-stale-delegations — B07 Phase E.
 *
 * Daily sweep of `patient_delegations` for grants whose `expires_at` has
 * passed. Emits one `DELEGATION_EXPIRED` audit row per stale grant.
 *
 * AUDIT-ONLY (Phase C Decision 8 / Phase E Decision 9)
 *   Does NOT mutate the row. The Phase D mig 113 helper
 *   `is_authorized_actor_on()` already filters out expired grants at
 *   query time via the `expires_at IS NULL OR expires_at > NOW()`
 *   predicate — there is no need to set `revoked_at` on the row. (The
 *   schema CHECK `patient_delegations_revoke_consistency_chk` would
 *   require a non-NULL revoked_by_user_id anyway, which we don't have
 *   for system-driven expiry.)
 *
 * IDEMPOTENCY (Phase E Decision 9)
 *   The handler queries `audit_events` for an existing
 *   DELEGATION_EXPIRED row with entity_id=delegation_id created today
 *   (Cairo-day boundary approximated via UTC). Skips emission for any
 *   grant that already has a same-day audit row. cron_run_id (UUID per
 *   invocation) goes into metadata so a future cross-run rollup can
 *   group emissions.
 *
 * AUTH
 *   Bearer `CRON_SECRET` header. Mirrors `expire-stale-shares`.
 *
 * RUN ID
 *   Per-invocation UUID; written into each emitted audit row's
 *   metadata.cron_run_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { emitPatientAuditWithAuthority } from '@shared/lib/data/audit'

interface ExpiredGrant {
  id: string
  principal_global_patient_id: string
  delegate_user_id: string
  expires_at: string | null
  capabilities: string[]
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronRunId = randomUUID()
  let scanned = 0
  let emitted = 0
  let alreadyEmitted = 0
  const errors: Array<{ delegation_id: string; message: string }> = []

  try {
    const admin = createAdminClient('cron-expire-stale-delegations')

    const nowIso = new Date().toISOString()

    // Scan for expired-but-not-revoked grants. We replicate the
    // predicate of `expireStaleDelegations()` here (rather than calling
    // the data-layer function) because Phase E Decision 9 requires
    // per-grant idempotency that the bulk function does not provide.
    const { data: scannedRows, error: scanErr } = await admin
      .from('patient_delegations')
      .select(
        'id, principal_global_patient_id, delegate_user_id, expires_at, capabilities'
      )
      .lt('expires_at', nowIso)
      .is('revoked_at', null)

    if (scanErr) {
      throw new Error(
        `expire-stale-delegations scan failed: ${(scanErr as { message?: string }).message ?? 'unknown'}`
      )
    }
    const stale = (scannedRows as ExpiredGrant[] | null) ?? []
    scanned = stale.length

    if (stale.length === 0) {
      return NextResponse.json({
        success: true,
        cron_run_id: cronRunId,
        scanned: 0,
        emitted: 0,
        already_emitted: 0,
      })
    }

    // Compute today's UTC midnight for the same-day dedup boundary.
    // (Cairo is UTC+3; using UTC midnight as the boundary means a 03:00
    // UTC cron invocation looks at audit rows from 00:00 UTC same day,
    // which is well within the same Cairo day. Acceptable approximation
    // for cron idempotency — not for billing.)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayStartIso = todayStart.toISOString()

    // Pull the set of delegation_ids that already have a
    // DELEGATION_EXPIRED audit row created today. One query for all of
    // them rather than N point-queries.
    const delegationIds = stale.map((g) => g.id)
    const { data: existingAudits, error: auditErr } = await admin
      .from('audit_events')
      .select('entity_id')
      .eq('action', 'DELEGATION_EXPIRED')
      .eq('entity_type', 'patient_delegations')
      .gte('created_at', todayStartIso)
      .in('entity_id', delegationIds)
    if (auditErr) {
      throw new Error(
        `expire-stale-delegations audit lookup failed: ${(auditErr as { message?: string }).message ?? 'unknown'}`
      )
    }
    const alreadyEmittedIds = new Set<string>(
      ((existingAudits as { entity_id: string }[] | null) ?? []).map(
        (r) => r.entity_id
      )
    )

    for (const grant of stale) {
      if (alreadyEmittedIds.has(grant.id)) {
        alreadyEmitted += 1
        continue
      }
      try {
        await emitPatientAuditWithAuthority({
          subjectGlobalPatientId: grant.principal_global_patient_id,
          actorUserId: null,
          actorKind: 'system',
          action: 'DELEGATION_EXPIRED',
          entityType: 'patient_delegations',
          entityId: grant.id,
          // No authorityBasis: system actions are not authority-bearing
          // (matches `expireStaleDelegations()` data-layer convention).
          metadata: {
            delegation_id: grant.id,
            delegate_user_id: grant.delegate_user_id,
            expires_at: grant.expires_at,
            capabilities: grant.capabilities,
            cron_run_id: cronRunId,
          },
        })
        emitted += 1
      } catch (err) {
        errors.push({
          delegation_id: grant.id,
          message: (err as Error).message ?? 'unknown',
        })
      }
    }

    return NextResponse.json({
      success: true,
      cron_run_id: cronRunId,
      scanned,
      emitted,
      already_emitted: alreadyEmitted,
      errors: errors.slice(0, 20),
    })
  } catch (err) {
    console.error('expire-stale-delegations cron error:', err)
    return NextResponse.json(
      {
        success: false,
        cron_run_id: cronRunId,
        scanned,
        emitted,
        already_emitted: alreadyEmitted,
        error: (err as Error).message ?? 'unknown',
      },
      { status: 500 }
    )
  }
}
