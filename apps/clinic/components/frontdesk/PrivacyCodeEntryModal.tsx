'use client'

/**
 * PrivacyCodeEntryModal — Build prompt 04 (B14).
 *
 * Front-desk modal that appears when the phone-search returns the uniform
 * "requires_code" response (via /api/patients/check-phone-uniform). Two paths:
 *   1. Manual entry — 6-character base32 input → /api/patients/verify-privacy-code
 *   2. SMS code   — POST /api/patients/initiate-sms-share, modal shifts to
 *                   4-digit input → /api/patients/verify-sms-code
 *
 * Error handling: every failure shows the SAME uniform error string —
 * NEVER reveals whether the phone existed, the code was wrong, or the
 * clinic is rate-limited. Internally the DB writes the precise reason
 * to privacy_code_attempts; clients see one of two outcomes.
 *
 * On success, the modal calls onUnlock(globalPatientId) and the parent
 * (check-in page) proceeds with the unlocked global identity.
 */

import { useEffect, useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export interface PrivacyCodeEntryModalProps {
  open: boolean
  /** The phone the front desk searched on. */
  phone: string
  /** The current clinic's ID (the clinic asking for access). */
  clinicId: string
  /** The doctor named in the SMS consent template (when SMS path is used). */
  doctorId: string
  onClose: () => void
  /** Called once a code (privacy or SMS) verifies successfully. */
  onUnlock: (globalPatientId: string) => void
}

type Mode = 'manual' | 'sms'

export function PrivacyCodeEntryModal(props: PrivacyCodeEntryModalProps) {
  const { open, phone, clinicId, doctorId, onClose, onUnlock } = props

  const [mode, setMode] = useState<Mode>('manual')
  const [code, setCode] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [smsSent, setSmsSent] = useState(false)
  const [smsExpiryAt, setSmsExpiryAt] = useState<number | null>(null)

  // Reset on open/close.
  useEffect(() => {
    if (!open) {
      setMode('manual')
      setCode('')
      setSmsCode('')
      setSubmitting(false)
      setError(null)
      setSmsSent(false)
      setSmsExpiryAt(null)
    }
  }, [open])

  if (!open) return null

  function sanitizeCode(input: string): string {
    return input
      .toUpperCase()
      .split('')
      .filter((c) => ALPHABET.includes(c))
      .slice(0, 6)
      .join('')
  }

  function sanitizeSmsCode(input: string): string {
    return input.replace(/[^0-9]/g, '').slice(0, 4)
  }

  async function submitManual() {
    if (code.length !== 6) {
      setError(ar.privacyCode_uniformError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/patients/verify-privacy-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, clinic_id: clinicId }),
      })
      const data = await res.json()
      if (data?.success && data?.global_patient_id) {
        onUnlock(data.global_patient_id)
        return
      }
      setError(ar.privacyCode_uniformError)
    } catch (err) {
      console.error('verify-privacy-code request failed:', err)
      setError(ar.privacyCode_genericError)
    } finally {
      setSubmitting(false)
    }
  }

  async function requestSmsCode() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/patients/initiate-sms-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, clinic_id: clinicId, doctor_id: doctorId }),
      })
      // Uniform response — always { requiresCode: true }. We optimistically
      // assume the SMS was sent (or, if no patient at this phone, the front
      // desk discovers that via the verify path, not via send-status).
      await res.json().catch(() => ({}))
      setMode('sms')
      setSmsSent(true)
      setSmsExpiryAt(Date.now() + 5 * 60 * 1000)
    } catch (err) {
      console.error('initiate-sms-share request failed:', err)
      setError(ar.privacyCode_genericError)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitSms() {
    if (smsCode.length !== 4) {
      setError(ar.privacyCode_uniformError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/patients/verify-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: smsCode, clinic_id: clinicId }),
      })
      const data = await res.json()
      if (data?.success && data?.global_patient_id) {
        onUnlock(data.global_patient_id)
        return
      }
      setError(ar.privacyCode_uniformError)
    } catch (err) {
      console.error('verify-sms-code request failed:', err)
      setError(ar.privacyCode_genericError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacyCodeModalTitle"
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
        <h2 id="privacyCodeModalTitle" style={{ marginTop: 0 }}>
          {mode === 'manual' ? ar.privacyCode_modalTitle : ar.privacyCode_smsModalTitle}
        </h2>
        <p style={{ color: '#444', lineHeight: 1.6 }}>
          {mode === 'manual' ? ar.privacyCode_modalBody : ar.privacyCode_smsModalBody}
        </p>

        {mode === 'manual' ? (
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              {ar.privacyCode_inputLabel}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(sanitizeCode(e.target.value))}
              placeholder={ar.privacyCode_inputPlaceholder}
              maxLength={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 18,
                letterSpacing: 4,
                fontFamily: 'monospace',
                borderRadius: 8,
                border: '1px solid #ccc',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
          </div>
        ) : (
          <div>
            <input
              type="tel"
              inputMode="numeric"
              value={smsCode}
              onChange={(e) => setSmsCode(sanitizeSmsCode(e.target.value))}
              placeholder={ar.privacyCode_smsInputPlaceholder}
              maxLength={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 22,
                letterSpacing: 8,
                fontFamily: 'monospace',
                borderRadius: 8,
                border: '1px solid #ccc',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            <p style={{ color: '#777', fontSize: 13, marginTop: 8 }}>
              {ar.privacyCode_smsExpiresIn}
            </p>
          </div>
        )}

        {error && (
          <p style={{ color: '#b00020', marginTop: 12, fontSize: 14 }} role="alert">
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          {mode === 'manual' ? (
            <>
              <button
                onClick={submitManual}
                disabled={submitting || code.length !== 6}
                style={primaryBtn}
              >
                {ar.privacyCode_submit}
              </button>
              <button onClick={requestSmsCode} disabled={submitting} style={secondaryBtn}>
                {ar.privacyCode_smsButton}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={submitSms}
                disabled={submitting || smsCode.length !== 4}
                style={primaryBtn}
              >
                {ar.privacyCode_submit}
              </button>
              <button onClick={requestSmsCode} disabled={submitting} style={secondaryBtn}>
                {ar.privacyCode_smsResend}
              </button>
            </>
          )}
          <button onClick={onClose} disabled={submitting} style={ghostBtn}>
            {ar.cancel}
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
const secondaryBtn: React.CSSProperties = {
  background: 'white',
  color: '#0a7d44',
  border: '1px solid #0a7d44',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#666',
  border: 'none',
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
}
