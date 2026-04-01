export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()
    // Admin client bypasses RLS on the patients table so full_name is returned
    const adminSupabase = createAdminClient('conversations-with-patient-names')

    const { data: conversations, error: conversationError } = await supabase
      .from('conversations')
      .select('id, patient_id, last_message_at, doctor_unread_count, created_at')
      .eq('doctor_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (conversationError) throw conversationError

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ success: true, conversations: [], total_unread: 0 })
    }

    const patientIds = Array.from(new Set(conversations.map((c: any) => c.patient_id)))
    const conversationIds = conversations.map((c: any) => c.id)

    // Use admin client so RLS on patients table doesn't block the join
    const { data: patients, error: patientError } = await adminSupabase
      .from('patients')
      .select('id, full_name, phone')
      .in('id', patientIds)

    if (patientError) throw patientError

    const { data: messages, error: messageError } = await supabase
      .from('messages')
      .select('conversation_id, content, sent_at, created_at')
      .in('conversation_id', conversationIds)
      .order('sent_at', { ascending: false })

    if (messageError) throw messageError

    const patientMap = new Map((patients || []).map((p: any) => [p.id, p]))
    const latestMessageByConversation = new Map<string, any>()
    ;(messages || []).forEach((m: any) => {
      if (!latestMessageByConversation.has(m.conversation_id)) {
        latestMessageByConversation.set(m.conversation_id, m)
      }
    })

    const payload = conversations.map((conv: any) => {
      const patient = patientMap.get(conv.patient_id) || {
        id: conv.patient_id,
        full_name: 'Unknown Patient',
        phone: ''
      }
      const latest = latestMessageByConversation.get(conv.id)

      return {
        patient: {
          id: patient.id,
          full_name: patient.full_name || 'Unknown Patient',
          phone: patient.phone || ''
        },
        last_message: latest?.content || 'No messages yet',
        last_message_time: latest?.sent_at || latest?.created_at || conv.last_message_at || conv.created_at,
        unread_count: conv.doctor_unread_count || 0
      }
    })

    const total_unread = conversations.reduce((sum: number, c: any) => sum + (c.doctor_unread_count || 0), 0)
    return NextResponse.json({ success: true, conversations: payload, total_unread })
  } catch (error: any) {
    console.error('Get conversations error:', error)
    return toApiErrorResponse(error, 'Failed to fetch conversations')
  }
}
