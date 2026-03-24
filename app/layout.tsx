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
  title: 'Web Scripts',
  description: 'Web Scripts is a collection of useful scripts for web.',
  icons: {
    icon: [{ url: '/android-icon-192x192.png?v=2', type: 'image/png', sizes: '192x192' }],
    shortcut: ['/android-icon-192x192.png?v=2'],
    apple: [{ url: '/apple-icon-180x180.png?v=2', type: 'image/png', sizes: '180x180' }],
  },
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout(props: Readonly<RootLayoutProps>) {
  const { children } = props

  return (
    <html lang="en">
      <Analytics />
      <SpeedInsights />
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-black`}>{children}</body>
    </html>
  )
}
