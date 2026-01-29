import type { NotificationContextValue } from '@/components/Notification/context/NotificationContext'
import { NotificationType } from '@/components/Notification/context/NotificationContext'

/**
 * Helper to create and test NotificationProvider
 * Directly tests the provider logic without React DOM
 */
function createNotificationProvider(maxNotifications = 10): NotificationContextValue {
  const state: {
    notifications: Array<{
      id: string
      type: NotificationType
      message: string
      title?: string
      duration?: number
      createdAt: number
      progress?: number
      indeterminate?: boolean
    }>
  } = {
    notifications: [],
  }

  /**
   * Generate unique ID for notification
   */
  function generateNotificationId(): string {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Add a new notification
   */
  const addNotification = (notification: { type: NotificationType; message: string; title?: string; duration?: number; progress?: number; indeterminate?: boolean }): string => {
    const id = generateNotificationId()
    const newNotification = {
      ...notification,
      id,
      createdAt: Date.now(),
    }

    // Add new notification at the end
    const updated = [...state.notifications, newNotification]
    // Keep only the last maxNotifications items (newest ones)
    state.notifications = updated.slice(-maxNotifications)

    return id
  }

  /**
   * Update a notification by ID
   */
  const updateNotification = (id: string, updates: { message?: string; title?: string; progress?: number; indeterminate?: boolean }) => {
    const idx = state.notifications.findIndex((n) => n.id === id)
    if (idx >= 0) {
      state.notifications[idx] = { ...state.notifications[idx], ...updates }
    }
  }

  /**
   * Remove a notification by ID
   */
  const removeNotification = (id: string) => {
    state.notifications = state.notifications.filter((n) => n.id !== id)
  }

  /**
   * Clear all notifications
   */
  const clearAll = () => {
    state.notifications = []
  }

  return {
    get notifications() {
      return state.notifications
    },
    addNotification,
    updateNotification,
    removeNotification,
    clearAll,
  }
}

describe('NotificationContext', () => {
  describe('addNotification', () => {
    it('should add a notification with generated ID and timestamp', () => {
      const provider = createNotificationProvider()
      const id = provider.addNotification({
        type: NotificationType.Success,
        message: 'Test message',
      })

      expect(id).toBeDefined()
      expect(provider.notifications).toHaveLength(1)
      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Success,
        message: 'Test message',
      })
      expect(provider.notifications[0].id).toBe(id)
      expect(provider.notifications[0].createdAt).toBeGreaterThan(0)
    })

    it('should add notification with title', () => {
      const provider = createNotificationProvider()
      provider.addNotification({
        type: NotificationType.Warning,
        message: 'Warning message',
        title: 'Warning Title',
      })

      expect(provider.notifications[0].title).toBe('Warning Title')
    })

    it('should add notification with duration', () => {
      const provider = createNotificationProvider()
      provider.addNotification({
        type: NotificationType.Error,
        message: 'Error message',
        duration: 5000,
      })

      expect(provider.notifications[0].duration).toBe(5000)
    })

    it('should limit notifications to maxNotifications', () => {
      const provider = createNotificationProvider(3)

      // Add 5 notifications
      provider.addNotification({ type: NotificationType.Success, message: '1' })
      provider.addNotification({ type: NotificationType.Success, message: '2' })
      provider.addNotification({ type: NotificationType.Success, message: '3' })
      provider.addNotification({ type: NotificationType.Success, message: '4' })
      provider.addNotification({ type: NotificationType.Success, message: '5' })

      // Should only keep the last 3
      expect(provider.notifications).toHaveLength(3)
      expect(provider.notifications.map((n) => n.message)).toEqual(['3', '4', '5'])
    })

    it('should handle different notification types', () => {
      const provider = createNotificationProvider()

      provider.addNotification({ type: NotificationType.Success, message: 'Success' })
      provider.addNotification({ type: NotificationType.Warning, message: 'Warning' })
      provider.addNotification({ type: NotificationType.Error, message: 'Error' })

      expect(provider.notifications).toHaveLength(3)
      expect(provider.notifications[0].type).toBe(NotificationType.Success)
      expect(provider.notifications[1].type).toBe(NotificationType.Warning)
      expect(provider.notifications[2].type).toBe(NotificationType.Error)
    })
  })

  describe('updateNotification', () => {
    it('should update notification progress for Loading type', () => {
      const provider = createNotificationProvider()
      const id = provider.addNotification({
        type: NotificationType.Loading,
        message: 'Loading...',
        duration: 0,
        indeterminate: true,
      })

      provider.updateNotification(id, { progress: 50, indeterminate: false })

      expect(provider.notifications[0].progress).toBe(50)
      expect(provider.notifications[0].indeterminate).toBe(false)
    })

    it('should update notification message and title', () => {
      const provider = createNotificationProvider()
      const id = provider.addNotification({
        type: NotificationType.Success,
        message: 'Original',
        title: 'Original Title',
      })

      provider.updateNotification(id, { message: 'Updated', title: 'Updated Title' })

      expect(provider.notifications[0].message).toBe('Updated')
      expect(provider.notifications[0].title).toBe('Updated Title')
    })

    it('should do nothing if notification ID does not exist', () => {
      const provider = createNotificationProvider()
      provider.addNotification({ type: NotificationType.Success, message: 'Msg' })

      provider.updateNotification('non-existent-id', { progress: 100 })

      expect(provider.notifications[0].progress).toBeUndefined()
    })
  })

  describe('removeNotification', () => {
    it('should remove notification by ID', () => {
      const provider = createNotificationProvider()
      const id1 = provider.addNotification({ type: NotificationType.Success, message: 'Message 1' })
      const id2 = provider.addNotification({ type: NotificationType.Success, message: 'Message 2' })

      expect(provider.notifications).toHaveLength(2)

      provider.removeNotification(id1)

      expect(provider.notifications).toHaveLength(1)
      expect(provider.notifications[0].id).toBe(id2)
    })

    it('should do nothing if notification ID does not exist', () => {
      const provider = createNotificationProvider()
      provider.addNotification({ type: NotificationType.Success, message: 'Message 1' })

      expect(provider.notifications).toHaveLength(1)

      provider.removeNotification('non-existent-id')

      expect(provider.notifications).toHaveLength(1)
    })
  })

  describe('clearAll', () => {
    it('should remove all notifications', () => {
      const provider = createNotificationProvider()
      provider.addNotification({ type: NotificationType.Success, message: 'Message 1' })
      provider.addNotification({ type: NotificationType.Warning, message: 'Message 2' })
      provider.addNotification({ type: NotificationType.Error, message: 'Message 3' })

      expect(provider.notifications).toHaveLength(3)

      provider.clearAll()

      expect(provider.notifications).toHaveLength(0)
    })

    it('should work when there are no notifications', () => {
      const provider = createNotificationProvider()

      provider.clearAll()

      expect(provider.notifications).toHaveLength(0)
    })
  })
})

// Export for use in other test files
export { createNotificationProvider }
