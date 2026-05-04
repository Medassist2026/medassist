'use client'

/**
 * MessagingReConsentPrompt — Build prompt 04 (B17).
 *
 * Modal that blocks /patient on first open post-mig 083 IF the patient
 * has any clinic in patient_clinic_records with active legacy messaging
 * consent (effective_messaging_consent.needs_reconsent = TRUE).
 *
 * One screen per clinic with active legacy consent. Yes writes
 * MESSAGING_CONSENT_RECONFIRMED + sets PCR.consent_to_messaging=TRUE.
 * No writes MESSAGING_CONSENT_REVOKED.
 *
 * On completion (queue empty), modal closes and the patient proceeds.
 *
 * Reads from /api/patient/messaging-reconsent (GET) and writes via POST.
 */

import { useEffect, useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

interface PendingClinic {
  clinic_id: string
  clinic_name: string
  legacy_granted_at: string | null
  grace_expires_at: string
}

export function MessagingReConsentPrompt({
  onComplete,
}: {
  onComplete: () => void
}) {
  const [queue, setQueue] = useState<PendingClinic[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadPending()
  }, [])

  async function loadPending() {
    try {
      const res = await fetch('/api/patient/messaging-reconsent', { method: 'GET' })
      if (!res.ok) {
        setQueue([])
        onComplete()
        return
      }
      const data = await res.json()
      const pending = Array.isArray(data?.pending) ? data.pending : []
      setQueue(pending)
      if (pending.length === 0) onComplete()
    } catch (err) {
      console.error('reconsent load failed:', err)
      // Don't block the patient on a load failure; assume no pending.
      setQueue([])
      onComplete()
    }
  }

  async function submitDecision(decision: 'reconfirmed' | 'revoked') {
    if (!queue || index >= queue.length) return
    setSubmitting(true)
    setError(null)
    const current = queue[index]
    try {
      const res = await fetch('/api/patient/messaging-reconsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic_id: current.clinic_id, decision }),
      })
      if (!res.ok) {
        setError(ar.privacyCode_genericError)
        return
      }
      const next = index + 1
      setIndex(next)
      if (next >= queue.length) {
        onComplete()
      }
    } catch (err) {
      console.error('reconsent decision failed:', err)
      setError(ar.privacyCode_genericError)
    } finally {
      setSubmitting(false)
    }
  }

  if (!queue || queue.length === 0 || index >= queue.length) return null

  const current = queue[index]
  const body = ar.reconsent_bodyTemplate.replace('{clinicName}', current.clinic_name)
  const progress = ar.reconsent_progress
    .replace('{current}', String(index + 1))
    .replace('{total}', String(queue.length))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconsentTitle"
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          minWidth: 320,
          maxWidth: 480,
          width: '90%',
          fontFamily: 'sans-serif',
        }}
      >
        <p style={{ color: '#888', fontSize: 13, marginTop: 0 }}>{progress}</p>
        <h2 id="reconsentTitle" style={{ marginTop: 0 }}>
          {ar.reconsent_title}
        </h2>
        <p style={{ color: '#444', lineHeight: 1.6 }}>{body}</p>

        {error && (
          <p style={{ color: '#b00020', marginTop: 8, fontSize: 14 }} role="alert">
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => submitDecision('reconfirmed')}
            disabled={submitting}
            style={primaryBtn}
          >
            {ar.reconsent_keepOn}
          </button>
          <button
            onClick={() => submitDecision('revoked')}
            disabled={submitting}
            style={dangerBtn}
          >
            {ar.reconsent_turnOff}
          </button>
        </div>
      </div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  background: '#0a7d44',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  background: 'white',
  color: '#b00020',
  border: '1px solid #b00020',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
}
