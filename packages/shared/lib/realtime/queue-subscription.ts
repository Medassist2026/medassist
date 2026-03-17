import { createBrowserClient } from '@supabase/ssr'

// Types
interface QueueItem {
  id: string
  patient_id: string
  patient_name: string
  doctor_id: string
  doctor_name: string
  status: string
  check_in_time: string
  queue_position: number
}

type QueueUpdateCallback = (queue: QueueItem[]) => void

export function subscribeToQueue(clinicId: string, onUpdate: QueueUpdateCallback) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const channel = supabase
    .channel(`queue-${clinicId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'check_in_queue',
      },
      (payload) => {
        // Trigger refetch on any change
        onUpdate([] as QueueItem[]) // Signal to refetch
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
