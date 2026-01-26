'use client'

import { useCallback } from 'react'

import { NotificationType, useNotificationContext } from '../context/NotificationContext'

/**
 * Hook for showing notifications
 * Provides convenient methods to show different types of notifications
 * @returns Notification methods
 */
export function useNotification() {
  const { addNotification, removeNotification, clearAll } = useNotificationContext()

  /**
   * Show a success notification
   * @param message Notification message
   * @param options Optional notification options
   * @returns Notification ID
   */
  const success = useCallback(
    (message: string, options?: { title?: string; duration?: number }) => {
      return addNotification({
        type: NotificationType.Success,
        message,
        title: options?.title,
        duration: options?.duration ?? 3000,
      })
    },
    [addNotification]
  )

  /**
   * Show a warning notification
   * @param message Notification message
   * @param options Optional notification options
   * @returns Notification ID
   */
  const warning = useCallback(
    (message: string, options?: { title?: string; duration?: number }) => {
      return addNotification({
        type: NotificationType.Warning,
        message,
        title: options?.title,
        duration: options?.duration ?? 4000,
      })
    },
    [addNotification]
  )

  /**
   * Show an error notification
   * @param message Notification message
   * @param options Optional notification options
   * @returns Notification ID
   */
  const error = useCallback(
    (message: string, options?: { title?: string; duration?: number }) => {
      return addNotification({
        type: NotificationType.Error,
        message,
        title: options?.title,
        duration: options?.duration ?? 5000,
      })
    },
    [addNotification]
  )

  /**
   * Show a custom notification
   * @param type Notification type
   * @param message Notification message
   * @param options Optional notification options
   * @returns Notification ID
   */
  const notify = useCallback(
    (type: NotificationType, message: string, options?: { title?: string; duration?: number }) => {
      return addNotification({
        type,
        message,
        title: options?.title,
        duration: options?.duration,
      })
    },
    [addNotification]
  )

  return {
    success,
    warning,
    error,
    notify,
    remove: removeNotification,
    clearAll,
  }
}
