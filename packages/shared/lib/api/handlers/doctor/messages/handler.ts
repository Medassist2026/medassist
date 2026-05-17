export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  ensureMessagingConsent,
  getOrCreateConsentedConversation,
  MessagingConsentError
} from '@shared/lib/data/messaging-consent'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId')

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 })
    }

    await ensureMessagingConsent(user.id, patientId)

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('doctor_id', user.id)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (conversationError) throw conversationError
    if (!conversation) {
      return NextResponse.json({ success: true, messages: [] })
    }

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, sender_id, sender_type, content, sent_at, created_at, read_at')
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: true })

    if (messagesError) throw messagesError

    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .eq('sender_type', 'patient')
      .is('read_at', null)

    await supabase
      .from('conversations')
      .update({ doctor_unread_count: 0 })
      .eq('id', conversation.id)

    // ── Delegate-attribution lookup (L-K2e2 / K-2e-2, 2026-05-16) ──
    // Per D-068 (actor != subject) a delegate may send on behalf of a
    // principal patient. messages.sender_id is the acting user (e.g., the
    // son), while the conversation is owned by the principal's global
    // patient (e.g., the father). When sender_id != principal_user_id and
    // sender_type='patient', surface the actual sender's name so the
    // doctor knows who composed the message. We resolve the principal
    // via patients.global_patient_id -> global_patients.claimed_user_id,
    // then batch-fetch the delegate users.full_name via admin (RLS would
    // otherwise hide users rows the doctor can't read).
    const admin = createAdminClient('doctor-messages-delegate-lookup')
    const { data: patientRow } = await admin
      .from('patients')
      .select('global_patient_id')
      .eq('id', patientId)
      .maybeSingle()
    let principalUserId: string | null = null
    if (patientRow?.global_patient_id) {
      const { data: gpRow } = await admin
        .from('global_patients')
        .select('claimed_user_id')
        .eq('id', patientRow.global_patient_id)
        .maybeSingle()
      principalUserId = gpRow?.claimed_user_id ?? null
    }
    const delegateIds = Array.from(
      new Set(
        (messages || [])
          .filter((m: any) =>
            m.sender_type === 'patient' &&
            !!m.sender_id &&
            (!principalUserId || m.sender_id !== principalUserId)
          )
          .map((m: any) => m.sender_id as string)
      )
    )
    const delegateNames = new Map<string, string>()
    if (delegateIds.length > 0) {
      const { data: delegateUsers } = await admin
        .from('users')
        .select('id, full_name')
        .in('id', delegateIds)
      ;(delegateUsers || []).forEach((u: any) => {
        if (u?.id && u?.full_name) delegateNames.set(u.id, u.full_name)
      })
    }

    const mapped = (messages || []).map((m: any) => {
      const isDelegated =
        m.sender_type === 'patient' &&
        !!m.sender_id &&
        principalUserId !== null &&
        m.sender_id !== principalUserId
      return {
        id: m.id,
        sender_type: m.sender_type,
        content: m.content,
        created_at: m.sent_at || m.created_at,
        is_read: !!m.read_at,
        // Only attached for delegated patient-side sends. Doctor-side messages
        // and direct-principal patient sends omit sender_name to keep the
        // common case lean.
        sender_name: isDelegated ? (delegateNames.get(m.sender_id) ?? null) : undefined,
      }
    })

    return NextResponse.json({ success: true, messages: mapped })
  } catch (error: any) {
    console.error('Get messages error:', error)
    if (error instanceof MessagingConsentError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return toApiErrorResponse(error, 'Failed to fetch messages')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()
    const body = await request.json()

    if (!body.patient_id || !body.content) {
      return NextResponse.json({ error: 'Patient ID and content required' }, { status: 400 })
    }

    const content = String(body.content || '').trim()
    if (!content) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 })
    }

    const conversationId = await getOrCreateConsentedConversation({
      doctorId: user.id,
      patientId: body.patient_id
    })

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_type: 'doctor',
        content,
        sent_at: new Date().toISOString()
      })
      .select('id, sender_type, content, sent_at, created_at, read_at')
      .single()

    if (messageError) throw messageError

    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString()
      })
      .eq('id', conversationId)

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        sender_type: message.sender_type,
        content: message.content,
        created_at: message.sent_at || message.created_at,
        is_read: !!message.read_at
      }
    })
  } catch (error: any) {
    console.error('Send message error:', error)
    if (error instanceof MessagingConsentError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return toApiErrorResponse(error, 'Failed to send message')
  }
}
