import './globals.css'

import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'MagickMonkey',
  description: 'MagickMonkey is a script management and deployment workspace.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg?v=5', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png?v=5', type: 'image/png', sizes: '96x96' },
      { url: '/android-icon-192x192.png?v=5', type: 'image/png', sizes: '192x192' },
    ],
    shortcut: ['/favicon-96x96.png?v=5'],
    apple: [{ url: '/apple-icon-180x180.png?v=5', type: 'image/png', sizes: '180x180' }],
  },
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout(props: Readonly<RootLayoutProps>) {
  const { children } = props

  return (
    <html lang="en" suppressHydrationWarning>
      <Analytics />
      <SpeedInsights />
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-black`}>
        {children}
      </body>
    </html>
  )
}
