'use client'

/**
 * PrivacyCodeCard — Build prompt 04 (B16).
 *
 * Patient app card for the /patient/privacy page. Three states:
 *   1. unclaimed   — patient hasn't claimed their global identity yet
 *      (fall through to claim flow, ORPH-V2-01)
 *   2. noCodeYet   — claimed but no active code; button says "Create code"
 *   3. hasCode     — patient already has a code; button says "Change code"
 *
 * On regenerate, the plaintext is shown LARGE + copyable, with explicit
 * warning that this is the only time it's displayed.
 */

import { useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

export interface PrivacyCodeCardProps {
  initialHasCode: boolean
  unclaimed: boolean
}

export function PrivacyCodeCard({ initialHasCode, unclaimed }: PrivacyCodeCardProps) {
  const [hasCode, setHasCode] = useState(initialHasCode)
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (unclaimed) {
    return (
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>{ar.patientPrivacy_title}</h2>
        <p style={{ color: '#666', lineHeight: 1.6 }}>
          {ar.patientPrivacy_explainer}
        </p>
        <p style={{ color: '#b00020', marginTop: 16, fontSize: 14 }}>
          {/* Patient claim flow lands in Prompt 10; deep-link to claim flow exists today */}
          {ar.patientPrivacy_noCodeYet}
        </p>
      </div>
    )
  }

  async function regenerate() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/patient/privacy-code/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        setError(ar.privacyCode_genericError)
        return
      }
      const data = await res.json()
      if (typeof data?.code === 'string' && data.code.length === 6) {
        setPlaintext(data.code)
        setHasCode(true)
        setConfirming(false)
      } else {
        setError(ar.privacyCode_genericError)
      }
    } catch (err) {
      console.error('regenerate failed:', err)
      setError(ar.privacyCode_genericError)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyToClipboard() {
    if (!plaintext) return
    try {
      await navigator.clipboard.writeText(plaintext)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('clipboard copy failed:', err)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>{ar.patientPrivacy_title}</h2>
      <p style={{ color: '#666', lineHeight: 1.6 }}>{ar.patientPrivacy_explainer}</p>

      {plaintext ? (
        <div style={{ marginTop: 24 }}>
          <div style={{ color: '#666', fontSize: 13 }}>{ar.patientPrivacy_codeLabel}</div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 36,
              letterSpacing: 8,
              padding: '16px 12px',
              background: '#f4f6f8',
              borderRadius: 12,
              marginTop: 8,
              textAlign: 'center',
              userSelect: 'all',
            }}
          >
            {plaintext}
          </div>
          <p style={{ color: '#b00020', marginTop: 12, fontSize: 13 }}>
            {ar.patientPrivacy_warningOnce}
          </p>
          <button onClick={copyToClipboard} style={primaryBtn}>
            {copied ? ar.patientPrivacy_copied : ar.patientPrivacy_copyCode}
          </button>
        </div>
      ) : !hasCode ? (
        <div style={{ marginTop: 24 }}>
          <p style={{ color: '#666' }}>{ar.patientPrivacy_noCodeYet}</p>
          <button onClick={regenerate} disabled={submitting} style={primaryBtn}>
            {submitting ? '...' : ar.patientPrivacy_mintFirst}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <p style={{ color: '#666' }}>
            {/* Code already exists; the patient must regenerate to see plaintext */}
            {ar.patientPrivacy_codeLabel}: ••••••
          </p>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            {ar.patientPrivacy_warningOnce}
          </p>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} style={primaryBtn}>
              {ar.patientPrivacy_regenerateButton}
            </button>
          ) : (
            <div
              style={{
                background: '#fff7e6',
                padding: 16,
                borderRadius: 8,
                marginTop: 12,
                border: '1px solid #f0c36d',
              }}
            >
              <strong>{ar.patientPrivacy_regenerateConfirmTitle}</strong>
              <p style={{ color: '#444', marginTop: 8 }}>
                {ar.patientPrivacy_regenerateConfirmBody}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={regenerate}
                  disabled={submitting}
                  style={dangerBtn}
                >
                  {submitting ? '...' : ar.patientPrivacy_regenerateConfirm}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  style={ghostBtn}
                >
                  {ar.patientPrivacy_regenerateCancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: '#b00020', marginTop: 12 }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  fontFamily: 'sans-serif',
}
const primaryBtn: React.CSSProperties = {
  background: '#0a7d44',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '12px 20px',
  fontSize: 15,
  cursor: 'pointer',
  marginTop: 12,
}
const dangerBtn: React.CSSProperties = {
  background: '#b00020',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#666',
  border: '1px solid #ccc',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
}
