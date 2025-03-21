'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState } from 'react'

export interface SortableItemProps {
  id: string
  disabled?: boolean
  children: React.ReactNode
}

export default function SortableItem(props: SortableItemProps) {
  const { id, disabled, children } = props
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [isReady, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])

  return (
    <div className="min-w-full flex items-center shrink-0 gap-2 p-2 border rounded-sm shadow bg-white" ref={setNodeRef} style={style}>
      <span
        className={`hidden md:flex items-center justify-center px-1 cursor-grab text-2xl text-gray-500 hover:text-gray-700 ${disabled ? 'cursor-not-allowed opacity-50 hover:text-gray-500' : ''}`}
        aria-label="Drag to reorder"
        title={disabled ? 'Unable to reorder in filter mode' : 'Drag to reorder'}
        {...(isReady && !disabled ? listeners : {})}
        {...(isReady && !disabled ? attributes : {})}
      >
        ☰
      </span>

      {children}
    </div>
  )
}
