'use client'

/**
 * RevokeShareModal — Build prompt 05 § B13.
 *
 * Confirms revocation with explicit, plain Egyptian-Arabic copy that
 * spells out what will and won't change:
 *   "If you revoke, [clinic] won't see your records anymore. Anything
 *   the doctor wrote before today stays in their clinic's record."
 *
 * Calls POST /api/patient/sharing/[shareId]/revoke. Surfaces optional
 * revoke_reason (free text, capped at 500 chars on the server).
 */

import { useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

interface ShareLite {
  id: string
  grantee_clinic_name: string
}

export function RevokeShareModal(props: {
  share: ShareLite
  onClose: () => void
  /** changed=false when the share was already revoked. */
  onRevoked: (changed: boolean) => void
}) {
  const { share, onClose, onRevoked } = props
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = ar.sharing_revokeModalTitle.replace('{clinicName}', share.grantee_clinic_name)
  const body = ar.sharing_revokeModalBody.replace(
    /\{clinicName\}/g,
    share.grantee_clinic_name
  )

  async function confirm() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/patient/sharing/${share.id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoke_reason: reason.trim() || undefined }),
      })
      if (!res.ok) {
        setError(ar.sharing_toast_genericError)
        return
      }
      const data = await res.json()
      onRevoked(Boolean(data?.share?.changed))
    } catch (err) {
      console.error('revoke failed:', err)
      setError(ar.sharing_toast_genericError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p style={{ lineHeight: 1.6, color: '#333' }}>{body}</p>

        <label style={{ display: 'block', marginTop: 16 }}>
          <span style={{ fontSize: 14, color: '#666' }}>
            {ar.sharing_revokeModalReasonLabel}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={ar.sharing_revokeModalReasonPlaceholder}
            maxLength={500}
            rows={3}
            style={textareaStyle}
          />
        </label>

        {error && (
          <p style={{ color: '#b00020', marginTop: 12, fontSize: 14 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={submitting} style={cancelBtnStyle}>
            {ar.sharing_revokeModalCancel}
          </button>
          <button type="button" onClick={confirm} disabled={submitting} style={dangerBtnStyle}>
            {submitting ? '...' : ar.sharing_revokeModalConfirm}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1100,
}

const modalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 8,
  padding: 24,
  maxWidth: 480,
  width: '100%',
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
}

const textareaStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  border: '1px solid #ccc',
  borderRadius: 4,
  resize: 'vertical',
  boxSizing: 'border-box',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #ccc',
  backgroundColor: '#fff',
  color: '#333',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
}

const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #b00020',
  backgroundColor: '#b00020',
  color: '#fff',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
}
