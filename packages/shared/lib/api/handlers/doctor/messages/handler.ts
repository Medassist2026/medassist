export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
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
      .select('id, sender_type, content, sent_at, created_at, read_at')
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

    const mapped = (messages || []).map((m: any) => ({
      id: m.id,
      sender_type: m.sender_type,
      content: m.content,
      created_at: m.sent_at || m.created_at,
      is_read: !!m.read_at
    }))

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
