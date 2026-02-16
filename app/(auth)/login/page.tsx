'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// BUG-002 FIX: Include 'frontdesk' in role type
type UserRole = 'doctor' | 'patient' | 'frontdesk' | null

export default function LoginPage() {
  const router = useRouter()
  const [role, setRole] = useState<UserRole>(null)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // BUG-002 FIX: Helper function for role-based styling
  const getRoleConfig = (r: UserRole) => {
    switch(r) {
      case 'doctor':
        return { 
          bg: 'bg-primary-100', 
          text: 'text-primary-600',
          buttonBg: 'bg-primary-600 hover:bg-primary-700',
          linkText: 'text-primary-600 hover:text-primary-700',
          title: 'Doctor Login'
        }
      case 'frontdesk':
        return { 
          bg: 'bg-purple-100', 
          text: 'text-purple-600',
          buttonBg: 'bg-purple-600 hover:bg-purple-700',
          linkText: 'text-purple-600 hover:text-purple-700',
          title: 'Front Desk Login'
        }
      case 'patient':
      default:
        return { 
          bg: 'bg-secondary-100', 
          text: 'text-secondary-600',
          buttonBg: 'bg-secondary-600 hover:bg-secondary-700',
          linkText: 'text-secondary-600 hover:text-secondary-700',
          title: 'Patient Login'
        }
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, role })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      // BUG-001 FIX: Ensure session cookies are fully set before redirect
      // Step 1: Refresh to update server-side session state
      router.refresh()
      
      // Step 2: Small delay to ensure cookies are propagated
      await new Promise(resolve => setTimeout(resolve, 150))

      // Step 3: Redirect based on role
      const redirectPath = data.role === 'doctor' 
        ? '/doctor/dashboard'
        : data.role === 'frontdesk'
          ? '/frontdesk/dashboard'
          : '/patient/dashboard'
      
      router.push(redirectPath)
      
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Step 1: Role Selection
  if (!role) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to MedAssist
          </h1>
          <p className="text-gray-600">
            Select your role to continue
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setRole('doctor')}
            className="w-full p-6 border-2 border-primary-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-900">Doctor</h3>
                <p className="text-sm text-gray-600">Access clinical tools and patient records</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole('patient')}
            className="w-full p-6 border-2 border-secondary-200 rounded-xl hover:border-secondary-500 hover:bg-secondary-50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-secondary-100 rounded-full flex items-center justify-center group-hover:bg-secondary-200 transition-colors">
                <svg className="w-6 h-6 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-900">Patient</h3>
                <p className="text-sm text-gray-600">View your medical records and medications</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole('frontdesk')}
            className="w-full p-6 border-2 border-purple-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-900">Front Desk</h3>
                <p className="text-sm text-gray-600">Manage appointments and check-ins</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // Step 2: Login Form
  const roleConfig = getRoleConfig(role)
  
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <button
        onClick={() => setRole(null)}
        className="mb-6 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Change role
      </button>

      <div className="text-center mb-8">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${roleConfig.bg}`}>
          <svg className={`w-8 h-8 ${roleConfig.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {role === 'frontdesk' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            )}
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {roleConfig.title}
        </h1>
        <p className="text-gray-600">
          Enter your credentials to continue
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number or Email
          </label>
          <input
            id="identifier"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+20 123 456 7890 or email@example.com"
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter the phone number or email you used during registration
          </p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${roleConfig.buttonBg} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="text-center pt-4">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link 
              href="/register" 
              className={`font-semibold ${roleConfig.linkText}`}
            >
              Register
            </Link>
          </p>
        </div>
      </form>
    </div>
  )
}
