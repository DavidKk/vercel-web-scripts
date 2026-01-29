'use client'

import { useCallback, useRef } from 'react'

import { NotificationType, useNotificationContext } from '../context/NotificationContext'

/** Throttle interval for progress updates (ms) */
const PROGRESS_THROTTLE_MS = 100

/**
 * Return type for loading(): control progress and close
 */
export interface LoadingNotificationHandle {
  /** Notification ID */
  id: string
  /** Update progress 0–100; throttled to avoid excessive updates */
  updateProgress: (percent: number) => void
  /** Close the loading notification */
  close: () => void
}

/**
 * Hook for showing notifications
 * Provides convenient methods to show different types of notifications
 * @returns Notification methods
 */
/** Per-notification throttle state for progress updates */
const throttleState = (): { lastUpdate: number; pendingPercent: number | null; timeout: ReturnType<typeof setTimeout> | null } => ({
  lastUpdate: 0,
  pendingPercent: null,
  timeout: null,
})

export function useNotification() {
  const { addNotification, updateNotification, removeNotification, clearAll } = useNotificationContext()
  const throttleMapRef = useRef<Map<string, ReturnType<typeof throttleState>>>(new Map())

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

  /**
   * Show a loading notification with optional linear progress bar.
   * Does not auto-dismiss; call handle.close() when done.
   * Progress updates are throttled (see PROGRESS_THROTTLE_MS).
   * @param message Loading message
   * @param options Optional title; default is indeterminate progress
   * @returns Handle with updateProgress(0–100) and close()
   */
  const loading = useCallback(
    (message: string, options?: { title?: string; indeterminate?: boolean }): LoadingNotificationHandle => {
      const id = addNotification({
        type: NotificationType.Loading,
        message,
        title: options?.title,
        duration: 0,
        indeterminate: options?.indeterminate !== false,
      })

      const updateProgress = (percent: number) => {
        let state = throttleMapRef.current.get(id)
        if (!state) {
          state = throttleState()
          throttleMapRef.current.set(id, state)
        }
        const now = Date.now()
        const clamp = Math.min(100, Math.max(0, percent))

        const flush = (p: number) => {
          updateNotification(id, { progress: p, indeterminate: false })
          state!.pendingPercent = null
          state!.lastUpdate = Date.now()
        }

        if (clamp >= 100) {
          if (state.timeout) {
            clearTimeout(state.timeout)
            state.timeout = null
          }
          flush(clamp)
          throttleMapRef.current.delete(id)
          return
        }

        if (now - state.lastUpdate >= PROGRESS_THROTTLE_MS) {
          flush(clamp)
          return
        }

        state.pendingPercent = clamp
        if (state.timeout == null) {
          state.timeout = setTimeout(
            () => {
              state!.timeout = null
              if (state!.pendingPercent != null) {
                const p = state!.pendingPercent
                updateNotification(id, { progress: p, indeterminate: false })
                state!.pendingPercent = null
                state!.lastUpdate = Date.now()
              }
            },
            PROGRESS_THROTTLE_MS - (now - state.lastUpdate)
          )
        }
      }

      return {
        id,
        updateProgress,
        close: () => removeNotification(id),
      }
    },
    [addNotification, updateNotification, removeNotification]
  )

  return {
    success,
    warning,
    error,
    notify,
    loading,
    remove: removeNotification,
    clearAll,
  }
}
