'use client'

import Image from 'next/image'
import { useMemo } from 'react'

import ExtensionAdminRotator, { EXTENSION_ADMIN_SHOTS } from '@/app/components/home/ExtensionAdminRotator'

const BASE_SCALE = 0.205

/** Pixel dimensions of files in public/screenshots/ — update when assets change. */
const SHOTS = {
  editor: { src: '/screenshots/editor.png', width: 3450, height: 1910 },
  extensionAdmin: EXTENSION_ADMIN_SHOTS[0],
  popup: { src: '/screenshots/extension-popup.png', width: 602, height: 878 },
} as const

type ShotKey = keyof typeof SHOTS
type Shot = (typeof SHOTS)[ShotKey]

const LAYER_SCALE: Record<ShotKey, number> = {
  editor: 1.05,
  extensionAdmin: 0.72,
  popup: 1.72,
}

export const HERO_STAGE_SIZE = {
  width: 920,
  height: 540,
} as const

export interface HeroStageTilt {
  x: number
  y: number
}

function layerDisplaySize(shot: Shot, layerKey: ShotKey) {
  const scale = BASE_SCALE * LAYER_SCALE[layerKey]
  return {
    width: Math.round(shot.width * scale),
    height: Math.round(shot.height * scale),
  }
}

interface ScreenshotCardProps {
  shot: Shot
  layerKey: ShotKey
  className?: string
  priority?: boolean
  lightPlate?: boolean
  emphasis?: boolean
}

function ScreenshotCard(props: ScreenshotCardProps) {
  const { shot, layerKey, className = '', priority = false, lightPlate = false, emphasis = false } = props
  const { width, height } = layerDisplaySize(shot, layerKey)

  const frameClass = lightPlate
    ? 'bg-white ring-1 ring-white/20 shadow-[0_40px_100px_-28px_rgba(15,23,42,0.75),0_0_0_1px_rgba(255,255,255,0.1)_inset]'
    : emphasis
      ? 'bg-[#171a21] ring-1 ring-[#3b82f6]/25 shadow-[0_50px_130px_-30px_rgba(59,130,246,0.24),0_28px_80px_-24px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.08)_inset]'
      : 'bg-[#111318] ring-1 ring-white/10 shadow-[0_46px_120px_-32px_rgba(0,0,0,0.92),0_0_0_1px_rgba(255,255,255,0.07)_inset]'

  return (
    <div aria-hidden className={`pointer-events-none shrink-0 select-none ${className}`} style={{ width, height }}>
      <div className={`relative h-full w-full overflow-hidden rounded-2xl ${frameClass}`}>
        <Image src={shot.src} alt="" width={shot.width} height={shot.height} priority={priority} sizes={`${width}px`} className="block h-full w-full" style={{ width, height }} />
        {lightPlate ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#dbeafe]/35" />
        ) : emphasis ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#3b82f6]/[0.04] via-transparent to-transparent" />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#050813]/15 via-transparent to-[#3b82f6]/[0.04]" />
        )}
      </div>
    </div>
  )
}

interface LayerMotion {
  rotateY: number
  rotateX: number
  translateZ: number
  parallax: number
}

const LAYER_MOTION: Record<'editor' | 'extensionAdmin' | 'popup' | 'badge' | 'stage', LayerMotion> = {
  stage: { rotateY: 0, rotateX: 0, translateZ: 0, parallax: 0.35 },
  editor: { rotateY: -10, rotateX: 5, translateZ: -48, parallax: 0.45 },
  extensionAdmin: { rotateY: -5, rotateX: 3, translateZ: 24, parallax: 0.65 },
  popup: { rotateY: -3, rotateX: 1, translateZ: 72, parallax: 0.85 },
  badge: { rotateY: 0, rotateX: 0, translateZ: 96, parallax: 0.95 },
}

const TILT_ROTATE_Y = 3.2
const TILT_ROTATE_X = 2.4
const TILT_SHIFT_X = 5
const TILT_SHIFT_Y = 4

function buildLayerTransform(motion: LayerMotion, tilt: HeroStageTilt) {
  const depth = motion.parallax
  const rotateY = motion.rotateY + tilt.x * TILT_ROTATE_Y * depth
  const rotateX = motion.rotateX + tilt.y * -TILT_ROTATE_X * depth
  const translateX = tilt.x * TILT_SHIFT_X * depth
  const translateY = tilt.y * TILT_SHIFT_Y * depth
  const translateZ = motion.translateZ + tilt.y * -3 * depth

  return `rotateY(${rotateY}deg) rotateX(${rotateX}deg) translate3d(${translateX}px, ${translateY}px, ${translateZ}px)`
}

interface HeroProductStageProps {
  tilt?: HeroStageTilt
}

export default function HeroProductStage(props: HeroProductStageProps) {
  const { tilt = { x: 0, y: 0 } } = props

  const transforms = useMemo(
    () => ({
      stage: buildLayerTransform(LAYER_MOTION.stage, tilt),
      editor: buildLayerTransform(LAYER_MOTION.editor, tilt),
      extensionAdmin: buildLayerTransform(LAYER_MOTION.extensionAdmin, tilt),
      popup: buildLayerTransform(LAYER_MOTION.popup, tilt),
      badge: buildLayerTransform(LAYER_MOTION.badge, tilt),
    }),
    [tilt.x, tilt.y]
  )

  const extensionAdminSize = layerDisplaySize(SHOTS.extensionAdmin, 'extensionAdmin')

  return (
    <div
      className="relative origin-center scale-[0.78] sm:scale-95 lg:scale-[1.06] [perspective:1400px] [transform-style:preserve-3d] will-change-transform"
      style={{
        width: HERO_STAGE_SIZE.width,
        height: HERO_STAGE_SIZE.height,
        transform: transforms.stage,
        transition: 'transform 120ms ease-out',
      }}
    >
      <div className="absolute -inset-x-12 top-10 h-[62%] rounded-[2.75rem] bg-gradient-to-br from-white/[0.04] via-white/[0.01] to-transparent blur-sm" />
      <div className="absolute left-0 top-6 h-[70%] w-[72%] rounded-[2.5rem] bg-[#3b82f6]/[0.06] blur-3xl" />

      <div className="absolute left-4 top-0 z-[1] [transform-style:preserve-3d]" style={{ transform: transforms.editor, transition: 'transform 120ms ease-out' }}>
        <ScreenshotCard shot={SHOTS.editor} layerKey="editor" priority emphasis />
      </div>

      <div
        className="absolute left-[270px] top-[210px] z-[3] hidden sm:block [transform-style:preserve-3d]"
        style={{ transform: transforms.extensionAdmin, transition: 'transform 120ms ease-out' }}
      >
        <ExtensionAdminRotator width={extensionAdminSize.width} height={extensionAdminSize.height} className="opacity-90 lg:opacity-100" />
      </div>

      <div className="absolute left-[650px] top-[62px] z-[6] [transform-style:preserve-3d]" style={{ transform: transforms.popup, transition: 'transform 120ms ease-out' }}>
        <ScreenshotCard shot={SHOTS.popup} layerKey="popup" lightPlate />
      </div>

      <div
        className="absolute left-[580px] top-[372px] z-[10] hidden rounded-xl border border-[#3f4a5c] bg-[#1b1f27] px-4 py-3.5 text-xs shadow-[0_18px_50px_-14px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.07)_inset] lg:block"
        style={{ transform: transforms.badge, transition: 'transform 120ms ease-out' }}
      >
        <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#60a5fa]">Live runtime</div>
        <div className="text-sm font-medium text-[#e6eaf0]">Editor → Extension → Page</div>
      </div>
    </div>
  )
}
