'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function MyCodePage() {
  const [code, setCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadCode()
  }, [])

  async function loadCode() {
    try {
      const res = await fetch('/api/patient/my-code')
      const data = await res.json()
      if (data.success) {
        setCode(data.code)
      } else {
        setError('Failed to load your code')
      }
    } catch {
      setError('Failed to load your code')
    } finally {
      setLoading(false)
    }
  }

  async function regenerateCode() {
    setRegenerating(true)
    try {
      const res = await fetch('/api/patient/my-code', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setCode(data.code)
      }
    } catch {
      setError('Failed to regenerate code')
    } finally {
      setRegenerating(false)
    }
  }

  async function copyCode() {
    if (code) {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Patient Code</h1>
        <p className="text-gray-600 mt-1">Share this code with your doctor to give them access to your records</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Code Display */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="mb-4">
          <svg className="w-12 h-12 text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>

        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-3">Your shareable code</p>
          <div className="inline-flex items-center gap-3 bg-gray-50 rounded-xl px-8 py-4 border-2 border-dashed border-gray-200">
            <span className="text-4xl font-mono font-bold tracking-[0.3em] text-gray-900">
              {code || '------'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={copyCode}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copied ? 'Copied!' : 'Copy Code'}
          </button>

          <button
            onClick={regenerateCode}
            disabled={regenerating}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {regenerating ? 'Regenerating...' : 'New Code'}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
        <h3 className="font-semibold text-blue-900 mb-3">How it works</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs flex items-center justify-center font-medium mt-0.5">1</span>
            <span>Tell your doctor your phone number</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs flex items-center justify-center font-medium mt-0.5">2</span>
            <span>Share this 6-digit code with them</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs flex items-center justify-center font-medium mt-0.5">3</span>
            <span>They can now access your records and send you messages</span>
          </li>
        </ul>
      </div>

      {/* Privacy note */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Privacy</h3>
        <p className="text-sm text-gray-600">
          Only doctors you share your code with can access your records. You can regenerate your code at any time to revoke future access. Existing access can be managed in your sharing settings.
        </p>
      </div>

      {/* Link to sharing management */}
      <div className="flex gap-3">
        <Link
          href="/patient/sharing-management"
          className="flex-1 text-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          Manage Who Has Access
        </Link>
        <Link
          href="/patient/dashboard"
          className="flex-1 text-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
