'use client'

import { useEffect, useRef } from 'react'

import { useNotificationContext } from './context/NotificationContext'
import { NotificationItem } from './NotificationItem'

/**
 * Notification stack container component
 * Displays notifications in a stack with animations
 */
export function NotificationStack() {
  const { notifications, removeNotification } = useNotificationContext()
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  /**
   * Handle auto-dismiss for notifications with duration
   */
  useEffect(() => {
    notifications.forEach((notification) => {
      if (notification.duration && notification.duration > 0) {
        // Clear existing timeout if any
        const existingTimeout = timeoutRefs.current.get(notification.id)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        // Set new timeout
        const timeout = setTimeout(() => {
          removeNotification(notification.id)
          timeoutRefs.current.delete(notification.id)
        }, notification.duration)

        timeoutRefs.current.set(notification.id, timeout)
      }
    })

    // Cleanup function
    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout))
      timeoutRefs.current.clear()
    }
  }, [notifications, removeNotification])

  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} onClose={() => removeNotification(notification.id)} />
      ))}
    </div>
  )
}
