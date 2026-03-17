'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface SharingGrant {
  id: string
  clinic_id: string
  clinic_name: string
  grantee_user_id: string | null
  doctor_name: string | null
  mode: string
  consent: string
  created_at: string
}

function VisibilityModeLabel({ mode }: { mode: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    DOCTOR_SCOPED_OWNER: { label: 'Private', bg: 'bg-gray-100', text: 'text-gray-700' },
    CLINIC_WIDE: { label: 'Clinic-Wide', bg: 'bg-green-100', text: 'text-green-700' },
    SHARED_BY_CONSENT: { label: 'Shared', bg: 'bg-blue-100', text: 'text-blue-700' },
  }
  const c = config[mode] || config.DOCTOR_SCOPED_OWNER
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

export default function SharingManagementPage() {
  const [grants, setGrants] = useState<SharingGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    loadGrants()
  }, [])

  async function loadGrants() {
    try {
      const res = await fetch('/api/patient/sharing')
      const data = await res.json()
      if (data.success) {
        setGrants(data.grants || [])
      }
    } catch {
      setError('Failed to load sharing info')
    } finally {
      setLoading(false)
    }
  }

  async function revokeAccess(visibilityId: string) {
    if (!confirm('Are you sure you want to revoke this access? The doctor will no longer be able to see your records.')) {
      return
    }

    setRevoking(visibilityId)
    try {
      const res = await fetch('/api/patient/sharing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibilityId }),
      })
      const data = await res.json()
      if (data.success) {
        setGrants(grants.filter(g => g.id !== visibilityId))
      }
    } catch {
      setError('Failed to revoke access')
    } finally {
      setRevoking(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Who Has Access</h1>
          <p className="text-gray-600 mt-1">Manage who can see your medical records</p>
        </div>
        <Link
          href="/patient/my-code"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          My Code
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Grants list */}
      {grants.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No one has access yet</h3>
          <p className="text-gray-600 text-sm mb-4">
            Share your patient code with a doctor to give them access to your records.
          </p>
          <Link
            href="/patient/my-code"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
          >
            View My Code
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {grants.map(grant => (
            <div key={grant.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium text-gray-900">
                      {grant.doctor_name ? `Dr. ${grant.doctor_name}` : grant.clinic_name}
                    </h3>
                    <VisibilityModeLabel mode={grant.mode} />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{grant.clinic_name}</span>
                    <span>Since {new Date(grant.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => revokeAccess(grant.id)}
                  disabled={revoking === grant.id}
                  className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {revoking === grant.id ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Privacy info */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">About Access Control</h3>
        <p className="text-sm text-gray-600">
          Revoking access means the doctor can no longer view your medical records. They will still have records from visits they conducted. You can regenerate your patient code to prevent future sharing.
        </p>
      </div>
    </div>
  )
}
