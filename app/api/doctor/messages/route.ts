import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

async function getOrCreateConversation(admin: ReturnType<typeof createAdminClient>, doctorId: string, patientId: string) {
  const { data: existing, error: lookupError } = await admin
    .from('conversations')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (lookupError) throw lookupError
  if (existing) return existing.id

  const { data: created, error: createError } = await admin
    .from('conversations')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      status: 'active',
      last_message_at: new Date().toISOString()
    })
    .select('id')
    .single()

  if (createError) throw createError
  return created.id
}

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId')

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 })
    }

    const { data: conversation, error: conversationError } = await admin
      .from('conversations')
      .select('id')
      .eq('doctor_id', user.id)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (conversationError) throw conversationError
    if (!conversation) {
      return NextResponse.json({ success: true, messages: [] })
    }

    const { data: messages, error: messagesError } = await admin
      .from('messages')
      .select('id, sender_type, content, sent_at, created_at, read_at')
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: true })

    if (messagesError) throw messagesError

    // Mark unread patient messages as read and reset unread counter.
    await admin
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .eq('sender_type', 'patient')
      .is('read_at', null)

    await admin
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
    return toApiErrorResponse(error, 'Failed to fetch messages')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient()
    const body = await request.json()

    if (!body.patient_id || !body.content) {
      return NextResponse.json({ error: 'Patient ID and content required' }, { status: 400 })
    }

    const content = String(body.content || '').trim()
    if (!content) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 })
    }

    // Ensure patient exists before conversation/message creation.
    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id')
      .eq('id', body.patient_id)
      .single()

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    const conversationId = await getOrCreateConversation(admin, user.id, body.patient_id)

    const { data: message, error: messageError } = await admin
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

    const { data: conversationCounters } = await admin
      .from('conversations')
      .select('patient_unread_count')
      .eq('id', conversationId)
      .single()

    await admin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        patient_unread_count: (conversationCounters?.patient_unread_count || 0) + 1
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
    return toApiErrorResponse(error, 'Failed to send message')
  }
}
