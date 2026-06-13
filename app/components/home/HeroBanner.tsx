'use client'

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import HeroBannerBackground from '@/app/components/home/HeroBannerBackground'
import HeroBannerContent from '@/app/components/home/HeroBannerContent'
import HeroProductStage, { HERO_STAGE_SIZE, type HeroStageTilt } from '@/app/components/home/HeroProductStage'

const TILT_LERP = 0.1
const TILT_EPSILON = 0.0015

function useHeroStageTilt(sectionRef: RefObject<HTMLElement | null>) {
  const [tilt, setTilt] = useState<HeroStageTilt>({ x: 0, y: 0 })
  const targetRef = useRef<HeroStageTilt>({ x: 0, y: 0 })
  const currentRef = useRef<HeroStageTilt>({ x: 0, y: 0 })
  const frameRef = useRef<number | null>(null)
  const enabledRef = useRef(true)

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    frameRef.current = null

    if (!enabledRef.current) {
      return
    }

    const next = {
      x: currentRef.current.x + (targetRef.current.x - currentRef.current.x) * TILT_LERP,
      y: currentRef.current.y + (targetRef.current.y - currentRef.current.y) * TILT_LERP,
    }
    currentRef.current = next
    setTilt({ x: next.x, y: next.y })

    const dx = targetRef.current.x - next.x
    const dy = targetRef.current.y - next.y
    if (Math.abs(dx) > TILT_EPSILON || Math.abs(dy) > TILT_EPSILON) {
      frameRef.current = window.requestAnimationFrame(tick)
    }
  }, [])

  const scheduleTick = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(tick)
    }
  }, [tick])

  useEffect(() => {
    enabledRef.current = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return stopLoop
  }, [stopLoop])

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!enabledRef.current) {
        return
      }
      const section = sectionRef.current
      if (!section) {
        return
      }
      const rect = section.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1
      targetRef.current = {
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
      }
      scheduleTick()
    },
    [scheduleTick, sectionRef]
  )

  const handleMouseLeave = useCallback(() => {
    targetRef.current = { x: 0, y: 0 }
    scheduleTick()
  }, [scheduleTick])

  return { tilt, handleMouseMove, handleMouseLeave }
}

export default function HeroBanner() {
  const sectionRef = useRef<HTMLElement>(null)
  const { tilt, handleMouseMove, handleMouseLeave } = useHeroStageTilt(sectionRef)

  return (
    <section
      ref={sectionRef}
      className="relative isolate w-full overflow-hidden bg-[#111318] lg:flex lg:min-h-[min(820px,92vh)] lg:items-center"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <HeroBannerBackground layout="overlay" />

      <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] hidden lg:flex lg:items-center">
        <div className="mx-auto flex w-full max-w-7xl justify-end px-6">
          <div className="relative w-[920px]" style={{ height: HERO_STAGE_SIZE.height }}>
            <HeroProductStage tilt={tilt} />
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:py-16">
        <HeroBannerContent />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-36 bg-gradient-to-b from-transparent via-[#111318]/50 to-[#111318]" aria-hidden />
    </section>
  )
}
