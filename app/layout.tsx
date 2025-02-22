import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Nav } from './Nav'

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

export type Layoutprops = {
  children: React.ReactNode
}

export default function RootLayout(props: Readonly<Layoutprops>) {
  const { children } = props

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Nav />
        {children}
      </body>
    </html>
  )
}
