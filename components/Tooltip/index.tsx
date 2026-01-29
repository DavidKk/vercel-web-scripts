'use client'

import type { ReactNode } from 'react'
import { useRef, useState } from 'react'

export interface TooltipProps {
  /** Tooltip text or content */
  content: ReactNode
  /** Trigger element */
  children: React.ReactElement
  /** Placement relative to trigger */
  placement?: 'top' | 'bottom'
  /** Delay before showing (ms) */
  delay?: number
  /** Optional class name for the tooltip panel */
  className?: string
}

/**
 * Tooltip component (dark theme, editor style).
 * Shows content on hover with optional delay.
 * @param props Component props
 * @param props.content Tooltip text or content
 * @param props.children Trigger element
 * @param props.placement Placement relative to trigger (default: bottom)
 * @param props.delay Delay before showing in ms (default: 200)
 * @param props.className Optional class name for the tooltip panel
 * @returns Tooltip wrapper component
 */
export function Tooltip({ content, children, placement = 'bottom', delay = 200, className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay)
  }

  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setVisible(false)
  }

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <span
          className={`
            absolute left-1/2 -translate-x-1/2 z-[60] whitespace-nowrap
            px-2 py-1.5 text-xs text-[#cccccc] bg-[#252526] border border-[#3a3a3a] rounded shadow-lg normal-case
            ${placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}
            ${className}
          `}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  )
}
