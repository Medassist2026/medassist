import Link from 'next/link'

interface LogoProps {
  href?: string
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

export function Logo({ href = '/', size = 'md', showText = true }: LogoProps) {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  }

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  }

  const svgSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  }

  const content = (
    <span className="flex items-center gap-2.5">
      {/* Green square icon matching Figma */}
      <span className={`${iconSizes[size]} bg-primary-600 rounded-xl flex items-center justify-center flex-shrink-0`}>
        <svg className={`${svgSizes[size]} text-white`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          {/* Calendar/medical cross icon */}
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="12" y1="10" x2="12" y2="18" />
          <line x1="8" y1="14" x2="16" y2="14" />
        </svg>
      </span>
      {showText && (
        <span className={`${textSizes[size]} font-bold text-gray-900 tracking-tight`}>
          MedAssist
        </span>
      )}
    </span>
  )

  if (href) {
    return (
      <Link href={href} className="flex items-center hover:opacity-90 transition-opacity">
        {content}
      </Link>
    )
  }

  return content
}
