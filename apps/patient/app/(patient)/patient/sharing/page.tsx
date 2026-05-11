'use client'

/**
 * /patient/sharing — Build prompt 05 § B12.
 *
 * Replaces the legacy per-doctor sharing-preferences UI (which read from
 * the deprecated patient_visibility) with the new patient_data_shares
 * lifecycle view. The legacy code is preserved in git history.
 *
 * Renders three sections:
 *   1. Active shares — clinics with current access (revoke, extend buttons)
 *   2. History — expired/revoked shares (collapsed by default)
 *   3. Empty state — patient hasn't granted any clinic access yet
 *
 * Data source: GET /api/patient/sharing → { shares: [...] }. The legacy
 * `grants` field in that response is ignored by this page (it serves the
 * deprecated sharing-preferences UI).
 *
 * RTL respects the html dir set by apps/patient/app/layout.tsx.
 */

import { useEffect, useState, useCallback } from 'react'
import { ar } from '@shared/lib/i18n/ar'
import { RevokeShareModal } from '@patient/components/sharing/RevokeShareModal'
import { ExtendShareModal } from '@patient/components/sharing/ExtendShareModal'
import { useApiPath } from '@patient/lib/hooks/use-api-path'

interface SharingShare {
  id: string
  global_patient_id: string
  grantor_clinic_id: string
  grantor_clinic_name: string
  grantee_clinic_id: string
  grantee_clinic_name: string
  granted_at: string
  expires_at: string | null
  revoked_at: string | null
  granted_via: 'PRIVACY_CODE' | 'SMS_CODE' | 'PATIENT_APP' | 'AUTO_RENEW'
  grant_reason: string | null
  is_active: boolean
  is_permanent: boolean
}

export default function PatientSharingPage() {
  const [shares, setShares] = useState<SharingShare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [revokeTarget, setRevokeTarget] = useState<SharingShare | null>(null)
  const [extendTarget, setExtendTarget] = useState<SharingShare | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const apiPath = useApiPath()
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        apiPath('/api/patient/sharing?include_expired=true')
      )
      if (!res.ok) {
        setError(ar.sharing_toast_genericError)
        return
      }
      const data = await res.json()
      setShares(Array.isArray(data?.shares) ? data.shares : [])
    } catch (err) {
      console.error('load shares failed:', err)
      setError(ar.sharing_toast_genericError)
    } finally {
      setLoading(false)
    }
  }, [apiPath])

  useEffect(() => {
    void load()
  }, [load])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const onRevoked = useCallback(
    (changed: boolean) => {
      setRevokeTarget(null)
      showToast(changed ? ar.sharing_toast_revoked : ar.sharing_toast_alreadyRevoked)
      void load()
    },
    [load, showToast]
  )

  const onExtended = useCallback(
    (changed: boolean, reason: string | null) => {
      setExtendTarget(null)
      if (!changed && reason === 'already_permanent') {
        showToast(ar.sharing_toast_alreadyPermanent)
      } else {
        showToast(ar.sharing_toast_extended)
      }
      void load()
    },
    [load, showToast]
  )

  const active = shares.filter((s) => s.is_active)
  const history = shares.filter((s) => !s.is_active)

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>{ar.sharing_title}</h1>
        <p style={{ color: '#666', margin: 0, lineHeight: 1.6 }}>
          {ar.sharing_subtitle}
        </p>
      </header>

      {loading && <p>...</p>}
      {error && (
        <p style={{ color: '#b00020', backgroundColor: '#fde7ea', padding: 12, borderRadius: 6 }}>
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeaderStyle}>{ar.sharing_activeHeader}</h2>
            {active.length === 0 ? (
              <p style={emptyStyle}>{ar.sharing_emptyActive}</p>
            ) : (
              <ul style={listStyle}>
                {active.map((share) => (
                  <ShareCard
                    key={share.id}
                    share={share}
                    onRevoke={() => setRevokeTarget(share)}
                    onExtend={() => setExtendTarget(share)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              style={historyToggleStyle}
            >
              <span>{ar.sharing_historyHeader}</span>
              <span style={{ marginInlineStart: 8 }}>{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              history.length === 0 ? (
                <p style={emptyStyle}>{ar.sharing_emptyHistory}</p>
              ) : (
                <ul style={listStyle}>
                  {history.map((share) => (
                    <ShareCard
                      key={share.id}
                      share={share}
                      onRevoke={null}
                      onExtend={null}
                    />
                  ))}
                </ul>
              )
            )}
          </section>
        </>
      )}

      {revokeTarget && (
        <RevokeShareModal
          share={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onRevoked={onRevoked}
        />
      )}
      {extendTarget && (
        <ExtendShareModal
          share={extendTarget}
          onClose={() => setExtendTarget(null)}
          onExtended={onExtended}
        />
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </main>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Card subcomponent
// ──────────────────────────────────────────────────────────────────────

function ShareCard(props: {
  share: SharingShare
  onRevoke: (() => void) | null
  onExtend: (() => void) | null
}) {
  const { share, onRevoke, onExtend } = props
  const grantedAt = formatDate(share.granted_at)
  const expiresLine = share.is_permanent
    ? ar.sharing_expiresPermanent
    : share.revoked_at
      ? `${ar.sharing_revokedOn} ${formatDate(share.revoked_at)}`
      : share.expires_at && new Date(share.expires_at) <= new Date()
        ? `${ar.sharing_expiredOn} ${formatDate(share.expires_at)}`
        : `${ar.sharing_expiresAt} ${formatDate(share.expires_at!)}`

  const viaLabel =
    share.granted_via === 'PRIVACY_CODE' ? ar.sharing_via_PRIVACY_CODE
    : share.granted_via === 'SMS_CODE' ? ar.sharing_via_SMS_CODE
    : share.granted_via === 'PATIENT_APP' ? ar.sharing_via_PATIENT_APP
    : ar.sharing_via_AUTO_RENEW

  return (
    <li style={cardStyle}>
      <header style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 16 }}>{share.grantee_clinic_name}</strong>
        <span style={statusBadgeStyle(share)}>{statusLabel(share)}</span>
      </header>
      <div style={metaLineStyle}>
        <span style={{ color: '#666' }}>{ar.sharing_grantedAt}: </span>
        <span>{grantedAt}</span>
      </div>
      <div style={metaLineStyle}>
        <span>{expiresLine}</span>
      </div>
      <div style={metaLineStyle}>
        <span style={{ color: '#666' }}>{ar.sharing_grantedViaLabel}: </span>
        <span>{viaLabel}</span>
      </div>
      {(onRevoke || onExtend) && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onExtend && (
            <button type="button" onClick={onExtend} style={primaryBtnStyle}>
              {ar.sharing_actionExtend}
            </button>
          )}
          {onRevoke && (
            <button type="button" onClick={onRevoke} style={dangerBtnStyle}>
              {ar.sharing_actionRevoke}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function statusLabel(share: SharingShare): string {
  if (share.revoked_at) return ar.sharing_status_revoked
  if (share.is_permanent) return ar.sharing_status_permanent
  if (share.is_active) return ar.sharing_status_active
  return ar.sharing_status_expired
}

function statusBadgeStyle(share: SharingShare): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 12,
    marginInlineStart: 8,
    verticalAlign: 'middle',
  }
  if (share.revoked_at) return { ...base, backgroundColor: '#fde7ea', color: '#b00020' }
  if (share.is_permanent) return { ...base, backgroundColor: '#e0f2f1', color: '#00695c' }
  if (share.is_active) return { ...base, backgroundColor: '#e8f5e9', color: '#2e7d32' }
  return { ...base, backgroundColor: '#eceff1', color: '#546e7a' }
}

function formatDate(iso: string): string {
  const dt = new Date(iso)
  const cairo = new Date(dt.getTime() + 3 * 60 * 60 * 1000)
  const dd = String(cairo.getUTCDate()).padStart(2, '0')
  const mm = String(cairo.getUTCMonth() + 1).padStart(2, '0')
  const yy = String(cairo.getUTCFullYear())
  return `${dd}/${mm}/${yy}`
}

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  padding: 16,
  maxWidth: 720,
  margin: '0 auto',
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 18,
  marginTop: 0,
  marginBottom: 12,
  borderBottom: '1px solid #e0e0e0',
  paddingBottom: 8,
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  backgroundColor: '#fff',
}

const metaLineStyle: React.CSSProperties = {
  fontSize: 14,
  marginBottom: 4,
}

const emptyStyle: React.CSSProperties = {
  color: '#666',
  textAlign: 'center',
  padding: 24,
  border: '1px dashed #e0e0e0',
  borderRadius: 8,
  lineHeight: 1.6,
}

const historyToggleStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '8px 0',
  textAlign: 'inherit',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
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

const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #b00020',
  backgroundColor: '#fff',
  color: '#b00020',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
}

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  insetInlineStart: '50%',
  transform: 'translateX(-50%)',
  backgroundColor: '#323232',
  color: '#fff',
  padding: '8px 16px',
  borderRadius: 4,
  fontSize: 14,
  zIndex: 1000,
}
