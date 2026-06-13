'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

/** Extension admin pages — same aspect ratio, cycle in the hero product stage. */
export const EXTENSION_ADMIN_SHOTS = [
  { src: '/screenshots/extension-scripts.png', width: 3450, height: 1906, label: 'Scripts' },
  { src: '/screenshots/extension-rules.png', width: 3448, height: 1908, label: 'Rules' },
  { src: '/screenshots/extension-logs.png', width: 3446, height: 1910, label: 'Logs' },
  { src: '/screenshots/extension-servers.png', width: 3446, height: 1908, label: 'Servers' },
] as const

const ROTATE_MS = 4800
const FADE_MS = 1400

interface ExtensionAdminRotatorProps {
  width: number
  height: number
  className?: string
}

export default function ExtensionAdminRotator(props: ExtensionAdminRotatorProps) {
  const { width, height, className = '' } = props
  const [activeIndex, setActiveIndex] = useState(0)
  const [scrimActive, setScrimActive] = useState(false)
  const skipScrimRef = useRef(true)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % EXTENSION_ADMIN_SHOTS.length)
    }, ROTATE_MS)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (skipScrimRef.current) {
      skipScrimRef.current = false
      return
    }
    setScrimActive(true)
    const timer = window.setTimeout(() => setScrimActive(false), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [activeIndex])

  return (
    <div aria-hidden className={`pointer-events-none shrink-0 select-none ${className}`} style={{ width, height }}>
      <div className="relative h-full w-full overflow-hidden rounded-2xl bg-white ring-1 ring-white/20 shadow-[0_40px_100px_-28px_rgba(15,23,42,0.75),0_0_0_1px_rgba(255,255,255,0.1)_inset]">
        {EXTENSION_ADMIN_SHOTS.map((shot, index) => (
          <div
            key={shot.src}
            className="absolute inset-0 transition-opacity ease-in-out"
            style={{
              opacity: index === activeIndex ? 1 : 0,
              transitionDuration: `${FADE_MS}ms`,
              zIndex: index === activeIndex ? 2 : 1,
            }}
          >
            <Image
              src={shot.src}
              alt=""
              width={shot.width}
              height={shot.height}
              priority={index === 0}
              sizes={`${width}px`}
              className="block h-full w-full"
              style={{ width, height }}
            />
          </div>
        ))}

        <div
          className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-br from-[#dbeafe]/40 via-white/50 to-[#ede9fe]/35 transition-opacity ease-in-out"
          style={{
            opacity: scrimActive ? 0.85 : 0,
            transitionDuration: `${FADE_MS}ms`,
          }}
        />

        <div className="pointer-events-none absolute inset-0 z-[4] bg-gradient-to-br from-transparent via-transparent to-[#dbeafe]/35" />

        <div className="absolute bottom-3 left-3 z-[5]">
          {EXTENSION_ADMIN_SHOTS.map((shot, index) => (
            <div
              key={shot.label}
              className="absolute bottom-0 left-0 w-max rounded-md border border-[#2a303a]/50 bg-[#111318]/75 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#93c5fd] backdrop-blur-sm transition-opacity ease-in-out"
              style={{
                opacity: index === activeIndex ? 1 : 0,
                transitionDuration: `${FADE_MS}ms`,
              }}
            >
              {shot.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
