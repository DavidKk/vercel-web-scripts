'use client'

import { computeMmTooltipPosition, type MmTooltipPlacement } from '@shared/ui/tooltip-position'
import { type CSSProperties, type ReactElement, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipProps {
  /** Short tooltip text */
  content: string
  /** Preferred placement relative to trigger */
  placement?: MmTooltipPlacement
  /** Trigger element */
  children: ReactElement
}

/**
 * Viewport-safe tooltip rendered in a portal.
 * Follows openapi interaction behavior with web-scripts dark style.
 */
export function Tooltip(props: TooltipProps) {
  const { content, children, placement: preferredPlacement = 'bottom' } = props
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    left: 0,
    top: 0,
    visibility: 'hidden',
  })
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    const rect = trigger.getBoundingClientRect()
    const tw = tooltip.offsetWidth
    const th = tooltip.offsetHeight
    const viewport = {
      width: typeof window !== 'undefined' ? window.innerWidth : 1024,
      height: typeof window !== 'undefined' ? window.innerHeight : 768,
    }
    const { left, top } = computeMmTooltipPosition(rect, tw, th, preferredPlacement, viewport)
    setStyle({ left, top, position: 'fixed', visibility: 'visible' })
  }, [open, preferredPlacement])

  const tooltipEl = open ? (
    <div
      ref={tooltipRef}
      role="tooltip"
      className="z-[9999] max-w-[min(calc(100vw-16px),14rem)] rounded-md border border-[#3c3c3c] bg-[#1f1f1f] px-2.5 py-1.5 text-xs text-[#d4d4d4] shadow-lg whitespace-normal"
      style={style}
    >
      {content}
    </div>
  ) : null

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {typeof document !== 'undefined' && document.body && tooltipEl ? createPortal(tooltipEl, document.body) : null}
    </>
  )
}
