import { createClient } from '@/lib/supabase/server'

export default async function TestConnectionPage() {
  let connectionStatus = {
    connected: false,
    error: null as string | null,
    tableCount: 0,
    tables: [] as string[]
  }

  try {
    const supabase = await createClient()
    
    // Test 1: Check if we can query the database
    const { data: tablesData, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
    
    if (tablesError) {
      connectionStatus.error = tablesError.message
    } else {
      connectionStatus.connected = true
      connectionStatus.tables = tablesData?.map((t: any) => t.table_name) || []
      connectionStatus.tableCount = tablesData?.length || 0
    }
  } catch (err: any) {
    connectionStatus.error = err.message
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <a href="/" className="text-primary-600 hover:text-primary-700">
            ← Back to Home
          </a>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-6 text-gray-900">
            Supabase Connection Test
          </h1>

          {connectionStatus.connected ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-4 bg-success-50 border border-success-200 rounded-lg">
                <div className="w-3 h-3 bg-success-500 rounded-full"></div>
                <span className="text-success-800 font-semibold">
                  ✅ Successfully connected to Supabase!
                </span>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  Database Information
                </h2>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700">
                    <span className="font-semibold">Tables Found:</span> {connectionStatus.tableCount}
                  </p>
                </div>

                {connectionStatus.tables.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">
                      Available Tables:
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {connectionStatus.tables.sort().map((table) => (
                        <div
                          key={table}
                          className="bg-primary-50 border border-primary-200 rounded px-3 py-2 text-sm text-primary-800"
                        >
                          {table}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>✅ Gate 1 Complete!</strong> Your foundation is ready.
                  </p>
                  <p className="text-sm text-blue-700 mt-2">
                    Ready to proceed to <strong>Gate 2: Auth & Account Creation</strong>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-red-800 font-semibold">
                  ❌ Connection Failed
                </span>
              </div>

              {connectionStatus.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-red-800 mb-2">Error Details:</p>
                  <code className="text-xs text-red-700 block bg-red-100 p-3 rounded">
                    {connectionStatus.error}
                  </code>
                </div>
              )}

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-semibold text-yellow-800 mb-2">
                  Troubleshooting Steps:
                </p>
                <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
                  <li>Check if .env.local exists with correct credentials</li>
                  <li>Verify NEXT_PUBLIC_SUPABASE_URL is correct</li>
                  <li>Verify NEXT_PUBLIC_SUPABASE_ANON_KEY is correct</li>
                  <li>Restart the dev server after adding .env.local</li>
                  <li>Check if migrations were run in Supabase SQL Editor</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
