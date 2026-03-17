import type { Metadata } from "next"
import "@shared/styles/globals.css"

export const metadata: Metadata = {
  title: "MedAssist - صحتك في إيدك",
  description: "تابع صحتك، احجز مواعيدك، واطمّن على نفسك.",
  keywords: ["patient", "health", "egypt", "medical", "صحة", "مريض"],
  manifest: '/manifest.json',
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
        {children}
      </body>
    </html>
  )
}
