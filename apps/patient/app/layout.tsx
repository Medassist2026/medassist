import type { Metadata, Viewport } from "next"
import "@shared/styles/globals.css"
import { SentryInit } from '@shared/lib/sentry-client-init'

export const metadata: Metadata = {
  title: "MedAssist - صحتك في إيدك",
  description: "تابع صحتك، احجز مواعيدك، واطمّن على نفسك.",
  keywords: ["patient", "health", "egypt", "medical", "صحة", "مريض"],
  manifest: '/manifest.json',
}

// K-3 (2026-05-15): Next 14 requires themeColor in a separate `viewport`
// export, not inside `metadata`. Pre-fix builds emitted deprecation
// warnings on every static page that inherited this layout (/, /_not-found,
// /otp, /reset-password, /auth). Single-location fix at the root layout
// silences all 5 warnings.
export const viewport: Viewport = {
  themeColor: '#2DBE5C',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="ar"
      suppressHydrationWarning
      dir="rtl"
      className="scroll-smooth"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SentryInit />
        {children}
      </body>
    </html>
  )
}
