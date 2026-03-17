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
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const doctorId = searchParams.get('doctorId')

    if (!doctorId) {
      return NextResponse.json({ error: 'Doctor ID required' }, { status: 400 })
    }

    await ensureMessagingConsent(doctorId, user.id)

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', user.id)
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
      .eq('sender_type', 'doctor')
      .is('read_at', null)

    await supabase
      .from('conversations')
      .update({ patient_unread_count: 0 })
      .eq('id', conversation.id)

    const mapped = (messages || []).map((message: any) => ({
      id: message.id,
      sender_type: message.sender_type,
      content: message.content,
      created_at: message.sent_at || message.created_at,
      is_read: !!message.read_at
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
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const body = await request.json()

    if (!body.doctor_id || !body.content) {
      return NextResponse.json({ error: 'Doctor ID and content required' }, { status: 400 })
    }

    const content = String(body.content || '').trim()
    if (!content) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 })
    }

    const conversationId = await getOrCreateConsentedConversation({
      doctorId: body.doctor_id,
      patientId: user.id
    })

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_type: 'patient',
        content,
        sent_at: new Date().toISOString()
      })
      .select('id, sender_type, content, sent_at, created_at, read_at')
      .single()

    if (error) throw error

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
