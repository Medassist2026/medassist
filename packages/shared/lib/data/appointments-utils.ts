/**
 * Appointments Utility Functions
 * 
 * Pure utility functions with NO server dependencies.
 * Safe to import in 'use client' components.
 * 
 * RULE: Never import from files that use @shared/lib/supabase/server in client components.
 * Always keep pure utilities separate.
 */

/**
 * Check if appointment is current/upcoming (within 10 minutes)
 */
export function isCurrentOrUpcoming(appointmentTime: string): boolean {
  const now = new Date()
  const aptTime = new Date(appointmentTime)
  const diffMinutes = (aptTime.getTime() - now.getTime()) / (1000 * 60)
  
  // Current/upcoming: from 10 minutes ago to 10 minutes from now
  return diffMinutes >= -10 && diffMinutes <= 10
}

/**
 * Format appointment time for display
 */
export function formatAppointmentTime(appointmentTime: string): string {
  const date = new Date(appointmentTime)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}
