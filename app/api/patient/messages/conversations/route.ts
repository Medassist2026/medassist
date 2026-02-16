import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient()

    const { data: conversationRows, error: conversationError } = await admin
      .from('conversations')
      .select('id, doctor_id, last_message_at, patient_unread_count, created_at')
      .eq('patient_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (conversationError) throw conversationError

    const conversationsMap: Record<string, any> = {}

    if (conversationRows && conversationRows.length > 0) {
      const doctorIds = Array.from(new Set(conversationRows.map((c: any) => c.doctor_id)))
      const conversationIds = conversationRows.map((c: any) => c.id)

      const { data: doctors, error: doctorError } = await admin
        .from('doctors')
        .select('id, full_name, specialty')
        .in('id', doctorIds)

      if (doctorError) throw doctorError

      const { data: messages, error: messageError } = await admin
        .from('messages')
        .select('conversation_id, content, sent_at, created_at')
        .in('conversation_id', conversationIds)
        .order('sent_at', { ascending: false })

      if (messageError) throw messageError

      const doctorMap = new Map((doctors || []).map((doctor: any) => [doctor.id, doctor]))
      const latestMessageByConversation = new Map<string, any>()
      ;(messages || []).forEach((message: any) => {
        if (!latestMessageByConversation.has(message.conversation_id)) {
          latestMessageByConversation.set(message.conversation_id, message)
        }
      })

      conversationRows.forEach((conversation: any) => {
        const doctor = doctorMap.get(conversation.doctor_id) || {
          id: conversation.doctor_id,
          full_name: 'Unknown Doctor',
          specialty: 'general-practitioner'
        }
        const latest = latestMessageByConversation.get(conversation.id)
        conversationsMap[conversation.doctor_id] = {
          doctor: {
            id: doctor.id,
            full_name: doctor.full_name || 'Unknown Doctor',
            specialty: doctor.specialty || 'general-practitioner'
          },
          last_message: latest?.content || 'Start a conversation',
          last_message_time:
            latest?.sent_at ||
            latest?.created_at ||
            conversation.last_message_at ||
            conversation.created_at ||
            new Date().toISOString(),
          unread_count: conversation.patient_unread_count || 0
        }
      })
    }

    // Also get doctors from clinical notes (who haven't messaged yet)
    const { data: notes } = await admin
      .from('clinical_notes')
      .select(`
        doctor_id,
        doctor:doctors (
          id,
          full_name,
          specialty
        )
      `)
      .eq('patient_id', user.id)

    // Add doctors from clinical notes (if not already in conversations)
    notes?.forEach((note: any) => {
      const doctor = note.doctor as any
      if (doctor && !conversationsMap[doctor.id]) {
        conversationsMap[doctor.id] = {
          doctor: doctor,
          last_message: 'Start a conversation',
          last_message_time: new Date().toISOString(),
          unread_count: 0
        }
      }
    })

    const conversations = Object.values(conversationsMap)
      .sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime())

    return NextResponse.json({ success: true, conversations })
  } catch (error: any) {
    console.error('Get conversations error:', error)
    return toApiErrorResponse(error, 'Failed to fetch conversations')
  }
}
