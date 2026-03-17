import type { Metadata, Viewport } from "next"
import "@shared/styles/globals.css"
import { ServiceWorkerRegistrar } from '@shared/lib/offline/sw-register'

export const viewport: Viewport = {
  themeColor: '#2DBE5C',
}

export const metadata: Metadata = {
  title: "MedAssist - نظام إدارة العيادات",
  description: "نظّم عيادتك. تابع مرضاك. واطمّن.",
  keywords: ["medical", "health", "egypt", "clinic", "doctor", "عيادة", "طبيب"],
  manifest: '/manifest.json',
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
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}
