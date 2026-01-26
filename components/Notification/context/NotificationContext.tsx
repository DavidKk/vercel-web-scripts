'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Notification type
 */
export enum NotificationType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

/**
 * Notification data structure
 */
export interface Notification {
  /** Unique ID */
  id: string
  /** Notification type */
  type: NotificationType
  /** Notification message */
  message: string
  /** Optional title */
  title?: string
  /** Auto dismiss duration in milliseconds (0 = no auto dismiss) */
  duration?: number
  /** Timestamp when notification was created */
  createdAt: number
}

/**
 * Notification context value
 */
export interface NotificationContextValue {
  /** All notifications */
  notifications: Notification[]
  /** Add a new notification */
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => string
  /** Remove a notification by ID */
  removeNotification: (id: string) => void
  /** Clear all notifications */
  clearAll: () => void
}

/**
 * Notification context
 */
const NotificationContext = createContext<NotificationContextValue | null>(null)

/**
 * Notification provider props
 */
export interface NotificationProviderProps {
  /** Maximum number of notifications to display */
  maxNotifications?: number
  /** Children */
  children: React.ReactNode
}

/**
 * Generate unique ID for notification
 */
function generateNotificationId(): string {
  return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Notification provider component
 * Manages notification state and provides context to children
 * @param props Component props
 * @returns Provider component
 */
export function NotificationProvider({ maxNotifications = 10, children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  /**
   * Add a new notification
   * @param notification Notification data (without id and createdAt)
   * @returns Notification ID
   */
  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'createdAt'>): string => {
      const id = generateNotificationId()
      const newNotification: Notification = {
        ...notification,
        id,
        createdAt: Date.now(),
      }

      setNotifications((prev) => {
        // Add new notification at the end
        const updated = [...prev, newNotification]
        // Keep only the last maxNotifications items (newest ones)
        return updated.slice(-maxNotifications)
      })

      return id
    },
    [maxNotifications]
  )

  /**
   * Remove a notification by ID
   * @param id Notification ID
   */
  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  /**
   * Clear all notifications
   */
  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      addNotification,
      removeNotification,
      clearAll,
    }),
    [notifications, addNotification, removeNotification, clearAll]
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

/**
 * Hook to use notification context
 * @returns Notification context value
 * @throws Error if used outside NotificationProvider
 */
export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider')
  }
  return context
}
