'use client'

/**
 * ExtendShareModal — Build prompt 05 § B14.
 *
 * Three radio options for the patient: 90 days, 1 year, or permanent.
 * Each has an Egyptian-Arabic explainer underneath. Calls
 * POST /api/patient/sharing/[shareId]/extend.
 *
 * "Never shortens" + "already_permanent is no-op" semantics are enforced
 * server-side; the modal still surfaces the friendly toasts when those
 * cases happen via the parent's onExtended(changed, reason).
 */

import { useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

type Duration = '90_DAYS' | '1_YEAR' | 'PERMANENT'

interface ShareLite {
  id: string
  grantee_clinic_name: string
}

export function ExtendShareModal(props: {
  share: ShareLite
  onClose: () => void
  onExtended: (changed: boolean, reason: string | null) => void
}) {
  const { share, onClose, onExtended } = props
  const [selected, setSelected] = useState<Duration>('90_DAYS')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = ar.sharing_extendModalTitle.replace('{clinicName}', share.grantee_clinic_name)

  const options: Array<{ value: Duration; label: string; help: string }> = [
    {
      value: '90_DAYS',
      label: ar.sharing_extendOption_90,
      help: ar.sharing_extendOption_90_help,
    },
    {
      value: '1_YEAR',
      label: ar.sharing_extendOption_year,
      help: ar.sharing_extendOption_year_help,
    },
    {
      value: 'PERMANENT',
      label: ar.sharing_extendOption_permanent,
      help: ar.sharing_extendOption_permanent_help,
    },
  ]

  async function confirm() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/patient/sharing/${share.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: selected }),
      })
      if (!res.ok) {
        setError(ar.sharing_toast_genericError)
        return
      }
      const data = await res.json()
      const changed = Boolean(data?.share?.changed)
      const reason: string | null = data?.share?.reason ?? null
      onExtended(changed, reason)
    } catch (err) {
      console.error('extend failed:', err)
      setError(ar.sharing_toast_genericError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p style={{ lineHeight: 1.6, color: '#333', marginBottom: 12 }}>
          {ar.sharing_extendModalBody}
        </p>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          {options.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'block',
                padding: 12,
                border: `1px solid ${selected === opt.value ? '#1976d2' : '#e0e0e0'}`,
                borderRadius: 6,
                marginBottom: 8,
                cursor: 'pointer',
                backgroundColor: selected === opt.value ? '#e3f2fd' : '#fff',
              }}
            >
              <input
                type="radio"
                name="duration"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                style={{ marginInlineEnd: 8 }}
              />
              <strong>{opt.label}</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>{opt.help}</p>
            </label>
          ))}
        </fieldset>

        {error && (
          <p style={{ color: '#b00020', marginTop: 12, fontSize: 14 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={submitting} style={cancelBtnStyle}>
            {ar.sharing_extendModalCancel}
          </button>
          <button type="button" onClick={confirm} disabled={submitting} style={primaryBtnStyle}>
            {submitting ? '...' : ar.sharing_extendModalConfirm}
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

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #ccc',
  backgroundColor: '#fff',
  color: '#333',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #1976d2',
  backgroundColor: '#1976d2',
  color: '#fff',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
}
