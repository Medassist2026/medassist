import Link from 'next/link'

interface ComingSoonProps {
  title: string
  description: string
  backHref?: string
  backLabel?: string
}

export default function ComingSoon({
  title,
  description,
  backHref = '/patient/dashboard',
  backLabel = 'Back to Dashboard',
}: ComingSoonProps) {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">{title}</h1>
      <p className="text-gray-500 mb-8 max-w-sm mx-auto">{description}</p>
      <Link
        href={backHref}
        className="inline-flex items-center px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-sm"
      >
        {backLabel}
      </Link>
    </div>
  )
}
