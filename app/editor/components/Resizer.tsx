'use client'

import { useEffect, useRef, useState } from 'react'

export interface ResizerProps {
  /** Callback when resize starts */
  onResizeStart?: () => void
  /** Callback when resize ends */
  onResizeEnd?: () => void
  /** Callback when width changes during resize */
  onResize: (width: number) => void
  /** Initial width */
  initialWidth?: number
  /** Minimum width */
  minWidth?: number
  /** Maximum width */
  maxWidth?: number
  /** Direction of resize (horizontal for vertical splitter) */
  direction?: 'horizontal' | 'vertical'
  /** Storage key for persisting width */
  storageKey?: string
  /** Reverse the drag direction (for right-side panels) */
  reverse?: boolean
}

/**
 * Resizable splitter component
 * Allows dragging to adjust panel width
 */
export function Resizer({
  onResizeStart,
  onResizeEnd,
  onResize,
  initialWidth = 200,
  minWidth = 150,
  maxWidth = 800,
  direction = 'horizontal',
  storageKey,
  reverse = false,
}: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [width, setWidth] = useState(initialWidth)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const startWidthRef = useRef(initialWidth)
  const isDraggingRef = useRef(false)
  const onResizeRef = useRef(onResize)
  const minWidthRef = useRef(minWidth)
  const maxWidthRef = useRef(maxWidth)
  const onResizeStartRef = useRef(onResizeStart)
  const onResizeEndRef = useRef(onResizeEnd)
  const hasLoadedFromStorageRef = useRef(false)

  // Update refs when props change
  useEffect(() => {
    onResizeRef.current = onResize
    minWidthRef.current = minWidth
    maxWidthRef.current = maxWidth
    onResizeStartRef.current = onResizeStart
    onResizeEndRef.current = onResizeEnd
  }, [onResize, minWidth, maxWidth, onResizeStart, onResizeEnd])

  // Load width from localStorage on mount (only once) and sync with parent
  useEffect(() => {
    if (!hasLoadedFromStorageRef.current) {
      if (storageKey && typeof window !== 'undefined') {
        const savedWidth = localStorage.getItem(storageKey)
        if (savedWidth) {
          const parsedWidth = parseInt(savedWidth, 10)
          if (!isNaN(parsedWidth) && parsedWidth >= minWidth && parsedWidth <= maxWidth) {
            setWidth(parsedWidth)
            startWidthRef.current = parsedWidth
            onResizeRef.current(parsedWidth)
            hasLoadedFromStorageRef.current = true
            return
          }
        }
      }
      // If no saved width, use initialWidth and notify parent
      setWidth(initialWidth)
      startWidthRef.current = initialWidth
      onResizeRef.current(initialWidth)
      hasLoadedFromStorageRef.current = true
    }
  }, [storageKey, minWidth, maxWidth, initialWidth, onResize])

  // Save width to localStorage when it changes
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(storageKey, width.toString())
    }
  }, [width, storageKey])

  /**
   * Handle mouse move event during dragging
   */
  const reverseRef = useRef(reverse)

  useEffect(() => {
    reverseRef.current = reverse
  }, [reverse])

  const handleMouseMoveRef = useRef<(event: MouseEvent) => void>((event: MouseEvent) => {
    if (!isDraggingRef.current) return

    let delta: number
    if (direction === 'vertical') {
      // For vertical resizer: use clientY
      const deltaY = event.clientY - startYRef.current
      if (reverseRef.current) {
        // For bottom panels: Resizer is above the panel
        // When dragging up (deltaY < 0), the resizer moves up, panel should expand
        // When dragging down (deltaY > 0), the resizer moves down, panel should shrink
        // So we need to reverse: newHeight = startHeight - deltaY
        delta = -deltaY
      } else {
        // For top panels: Resizer is below the panel
        // When dragging down (deltaY > 0), the resizer moves down, panel should expand
        // When dragging up (deltaY < 0), the resizer moves up, panel should shrink
        // So we use normal: newHeight = startHeight + deltaY
        delta = deltaY
      }
    } else {
      // For horizontal resizer: use clientX
      const deltaX = event.clientX - startXRef.current
      if (reverseRef.current) {
        // For right-side panels: Resizer is on the left side of the panel
        // When dragging left (deltaX < 0), the resizer moves left, panel should expand
        // When dragging right (deltaX > 0), the resizer moves right, panel should shrink
        // So we need to reverse: newWidth = startWidth - deltaX
        delta = -deltaX
      } else {
        // For left-side panels: Resizer is on the right side of the panel
        // When dragging right (deltaX > 0), the resizer moves right, panel should expand
        // When dragging left (deltaX < 0), the resizer moves left, panel should shrink
        // So we use normal: newWidth = startWidth + deltaX
        delta = deltaX
      }
    }

    const newWidth = startWidthRef.current + delta
    const clampedWidth = Math.max(minWidthRef.current, Math.min(maxWidthRef.current, newWidth))

    // Update internal state and notify parent
    setWidth(clampedWidth)
    // Always call onResize to ensure parent state is updated
    onResizeRef.current(clampedWidth)
  })

  /**
   * Handle mouse up event to end dragging
   */
  const handleMouseUpRef = useRef<() => void>(() => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    setIsDragging(false)

    if (onResizeEndRef.current) {
      onResizeEndRef.current()
    }

    document.removeEventListener('mousemove', handleMouseMoveRef.current)
    document.removeEventListener('mouseup', handleMouseUpRef.current)
  })

  /**
   * Handle mouse down event to start dragging
   */
  function handleMouseDown(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    isDraggingRef.current = true
    setIsDragging(true)
    startXRef.current = event.clientX
    startYRef.current = event.clientY
    startWidthRef.current = width

    if (onResizeStartRef.current) {
      onResizeStartRef.current()
    }

    document.addEventListener('mousemove', handleMouseMoveRef.current)
    document.addEventListener('mouseup', handleMouseUpRef.current)
  }

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      if (handleMouseMoveRef.current) {
        document.removeEventListener('mousemove', handleMouseMoveRef.current)
      }
      if (handleMouseUpRef.current) {
        document.removeEventListener('mouseup', handleMouseUpRef.current)
      }
    }
  }, [])

  return (
    <div
      className={`relative flex-shrink-0 ${direction === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'} hover:bg-[#007acc] transition-colors ${isDragging ? 'bg-[#007acc]' : 'bg-[#3c3c3c]'}`}
      style={{ width: direction === 'horizontal' ? '4px' : '100%', height: direction === 'horizontal' ? '100%' : '4px' }}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation={direction}
      aria-label="Resize panel"
    >
      <div className="absolute inset-0" />
    </div>
  )
}
