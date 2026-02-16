import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

async function getOrCreateConversation(
  admin: ReturnType<typeof createAdminClient>,
  doctorId: string,
  patientId: string
) {
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
    const user = await requireApiRole('patient')
    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const doctorId = searchParams.get('doctorId')

    if (!doctorId) {
      return NextResponse.json({ error: 'Doctor ID required' }, { status: 400 })
    }

    const { data: conversation, error: conversationError } = await admin
      .from('conversations')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', user.id)
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

    // Mark doctor messages as read
    await admin
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .eq('sender_type', 'doctor')
      .is('read_at', null)

    await admin
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
    return toApiErrorResponse(error, 'Failed to fetch messages')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient()
    const body = await request.json()

    if (!body.doctor_id || !body.content) {
      return NextResponse.json({ error: 'Doctor ID and content required' }, { status: 400 })
    }

    const content = String(body.content || '').trim()
    if (!content) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 })
    }

    // Ensure doctor exists before conversation/message creation.
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id')
      .eq('id', body.doctor_id)
      .single()

    if (doctorError || !doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    const conversationId = await getOrCreateConversation(admin, body.doctor_id, user.id)

    const { data: message, error } = await admin
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

    const { data: conversationCounters } = await admin
      .from('conversations')
      .select('doctor_unread_count')
      .eq('id', conversationId)
      .single()

    await admin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        doctor_unread_count: (conversationCounters?.doctor_unread_count || 0) + 1
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
