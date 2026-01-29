'use client'

import { useEffect, useState } from 'react'
import { FiAlertCircle, FiCheckCircle, FiX, FiXCircle } from 'react-icons/fi'

import { Spinner } from '@/components/Spinner'

import { type Notification, NotificationType } from './context/NotificationContext'

/**
 * Notification item component props
 */
interface NotificationItemProps {
  /** Notification data */
  notification: Notification
  /** Callback when notification is closed */
  onClose: () => void
}

/**
 * Get icon for notification type
 */
function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case NotificationType.Success:
      return <FiCheckCircle className="w-5 h-5 text-[#4ec9b0]" />
    case NotificationType.Warning:
      return <FiAlertCircle className="w-5 h-5 text-[#dcdcaa]" />
    case NotificationType.Error:
      return <FiXCircle className="w-5 h-5 text-[#f48771]" />
    case NotificationType.Loading:
      return <Spinner color="text-[#007acc]" />
    default:
      return null
  }
}

/**
 * Get border color for notification type
 */
function getNotificationBorderColor(type: NotificationType): string {
  switch (type) {
    case NotificationType.Success:
      return 'border-l-[#4ec9b0]'
    case NotificationType.Warning:
      return 'border-l-[#dcdcaa]'
    case NotificationType.Error:
      return 'border-l-[#f48771]'
    case NotificationType.Loading:
      return 'border-l-[#007acc]'
    default:
      return 'border-l-[#858585]'
  }
}

/**
 * Notification item component
 * Individual notification with fade in/out animations
 */
export function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Fade in on mount
  useEffect(() => {
    // Use requestAnimationFrame to ensure smooth animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true)
      })
    })
  }, [])

  /**
   * Handle close with fade out animation
   */
  const handleClose = () => {
    setIsRemoving(true)
    // Wait for animation to complete before calling onClose
    setTimeout(() => {
      onClose()
    }, 300) // Match animation duration
  }

  const isLoading = notification.type === NotificationType.Loading
  const showProgressBar = isLoading && (notification.indeterminate !== false || notification.progress != null)
  const isIndeterminate = isLoading && (notification.indeterminate === true || notification.progress == null)

  return (
    <div
      className={`
        pointer-events-auto
        min-w-[320px] max-w-[480px]
        bg-[#252526] border border-[#3e3e42] rounded
        shadow-lg
        overflow-hidden
        transition-all duration-300 ease-out
        ${isVisible && !isRemoving ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}
      `}
    >
      <div className={`flex items-start gap-3 p-4 border-l-4 ${getNotificationBorderColor(notification.type)}`}>
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">{getNotificationIcon(notification.type)}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {notification.title && <div className="text-sm font-semibold text-[#cccccc] mb-1">{notification.title}</div>}
          <div className="text-sm text-[#cccccc] leading-relaxed break-words">{notification.message}</div>
          {/* Linear progress bar for Loading */}
          {showProgressBar && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#3e3e42] overflow-hidden">
              {isIndeterminate ? (
                <div className="h-full w-1/4 rounded-full bg-[#007acc]" style={{ animation: 'progress-indeterminate 1.2s ease-in-out infinite' }} />
              ) : (
                <div
                  className="h-full rounded-full bg-[#007acc] transition-[width] duration-150 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, notification.progress ?? 0))}%` }}
                />
              )}
            </div>
          )}
        </div>

        {/* Close button (hidden for loading to avoid accidental close; can add if needed) */}
        {!isLoading && (
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#3e3e42] rounded transition-colors"
            aria-label="Close notification"
          >
            <FiX className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
