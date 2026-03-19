'use client'

export default function OfflinePage() {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 max-w-md mx-auto"
    >
      <div className="text-center max-w-md">
        {/* Offline icon */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 01-1.414-7.072m-2.829 9.9a9 9 0 01-2.167-9.238m7.824 6.167L12 12m0 0l-2.829-2.829M12 12l2.829-2.829M12 12l-2.829 2.829"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3 font-cairo">
          أنت غير متصل بالإنترنت
        </h1>
        <p className="text-gray-600 mb-2 font-cairo">
          تحقق من اتصالك بالإنترنت وحاول مرة أخرى
        </p>
        <p className="text-sm text-gray-400 mb-8">
          You are currently offline. Check your connection and try again.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors font-cairo"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          إعادة المحاولة
        </button>

        <div className="mt-8 p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-500 font-cairo">
            بعض الصفحات المحفوظة قد تكون متاحة بدون إنترنت
          </p>
        </div>
      </div>
    </div>
  )
}
