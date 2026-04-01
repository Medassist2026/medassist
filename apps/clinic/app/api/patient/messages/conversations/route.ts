export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const adminSupabase = createAdminClient('patient-conversations-with-doctors')

    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversations')
      .select('id, doctor_id, last_message_at, patient_unread_count, created_at')
      .eq('patient_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (conversationError) throw conversationError

    if (!conversationRows || conversationRows.length === 0) {
      return NextResponse.json({ success: true, conversations: [] })
    }

    const doctorIds = Array.from(new Set(conversationRows.map((c: any) => c.doctor_id)))
    const conversationIds = conversationRows.map((c: any) => c.id)

    // Use admin client so RLS doesn't block the doctors table join
    const { data: doctors, error: doctorError } = await adminSupabase
      .from('doctors')
      .select('id, full_name, specialty')
      .in('id', doctorIds)

    if (doctorError) throw doctorError

    const { data: messages, error: messageError } = await supabase
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

    const conversations = conversationRows
      .map((conversation: any) => {
        const doctor = doctorMap.get(conversation.doctor_id) || {
          id: conversation.doctor_id,
          full_name: 'Unknown Doctor',
          specialty: 'general-practitioner'
        }
        const latest = latestMessageByConversation.get(conversation.id)

        return {
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
      .sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime())

    return NextResponse.json({ success: true, conversations })
  } catch (error: any) {
    console.error('Get conversations error:', error)
    return toApiErrorResponse(error, 'Failed to fetch conversations')
  }
}
