import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Nav } from './Nav'
import Footer from './Footer'

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  )
}
