import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "MedAssist - Egypt's Digital Health Platform",
  description: "Doctor-led digital health record and clinical operations platform for Egypt",
  keywords: ["medical", "health", "egypt", "clinic", "doctor", "patient"],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
