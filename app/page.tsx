import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const CONNECTION_CHECK_TIMEOUT_MS = 2500

type ConnectionCheckResult = {
  connected: boolean
  error: string | null
}

async function checkSupabaseConnection(): Promise<ConnectionCheckResult> {
  const supabase = await createClient()

  const queryResult = supabase
    .from('users')
    .select('count', { count: 'exact', head: true })

  const timeoutResult = new Promise<{ error: { message: string } }>((resolve) => {
    setTimeout(() => {
      resolve({
        error: {
          message: `Connection check timed out after ${CONNECTION_CHECK_TIMEOUT_MS}ms`,
        },
      })
    }, CONNECTION_CHECK_TIMEOUT_MS)
  })

  const result = (await Promise.race([queryResult, timeoutResult])) as {
    error: { message: string } | null
  }

  if (result.error) {
    return {
      connected: false,
      error: result.error.message,
    }
  }

  return {
    connected: true,
    error: null,
  }
}

export default async function HomePage() {
  // Check if user is logged in
  const user = await getCurrentUser()
  
  if (user) {
    // Redirect to appropriate dashboard based on role
    if (user.role === 'doctor') {
      redirect('/doctor/dashboard')
    } else {
      redirect('/patient/dashboard')
    }
  }

  // Check Supabase connection
  let supabaseConnected = false
  let supabaseError: string | null = null
  const isProductionBuild = process.env.NEXT_PHASE === 'phase-production-build'

  if (!isProductionBuild) {
    try {
      const checkResult = await checkSupabaseConnection()
      supabaseConnected = checkResult.connected
      supabaseError = checkResult.error
    } catch (err: any) {
      supabaseError = err.message || 'Unknown connection error'
    }
  } else {
    supabaseError = 'Connection check skipped during production build'
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-8">
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-5xl font-bold text-primary-700">
          MedAssist
        </h1>
        <p className="text-xl text-gray-600">
          Egypt's Digital Health Platform
        </p>
        <p className="text-gray-500">
          Phase 1 - Foundation Complete ✅
        </p>
        
        <div className="mt-8 p-6 bg-white rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">
            System Status
          </h2>
          <div className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-success-500 rounded-full"></span>
              <span className="text-gray-700">Next.js 14 configured</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-success-500 rounded-full"></span>
              <span className="text-gray-700">Tailwind CSS with design system</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-success-500 rounded-full"></span>
              <span className="text-gray-700">TypeScript strict mode</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${supabaseConnected ? 'bg-success-500' : 'bg-warning-500'}`}></span>
              <span className="text-gray-700">
                Supabase {supabaseConnected ? 'connected' : 'setup pending'}
              </span>
            </div>
            {!supabaseConnected && supabaseError && (
              <p className="ml-5 text-xs text-warning-700">
                {supabaseError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-success-500 rounded-full"></span>
              <span className="text-gray-700">Auth flow (Gate 2)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-gray-300 rounded-full"></span>
              <span className="text-gray-500">Clinical session (Gate 3)</span>
            </div>
          </div>
        </div>

        {supabaseConnected && (
          <div className="mt-8 p-6 bg-success-50 rounded-lg border border-success-200">
            <p className="text-lg font-semibold text-success-800 mb-4">
              ✅ Gate 2 Complete: Authentication Ready!
            </p>
            <div className="flex gap-4 justify-center">
              <Link 
                href="/login"
                className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
              >
                Login
              </Link>
              <Link 
                href="/register"
                className="px-6 py-3 bg-white hover:bg-gray-50 text-primary-600 font-semibold rounded-lg border-2 border-primary-600 transition-colors"
              >
                Register
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
