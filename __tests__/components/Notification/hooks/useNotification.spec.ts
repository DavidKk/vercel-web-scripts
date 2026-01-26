import { NotificationType } from '@/components/Notification/context/NotificationContext'

import { createNotificationProvider } from '../context/NotificationContext.spec'

/**
 * Helper to create useNotification hook simulation
 */
function createUseNotification(provider: ReturnType<typeof createNotificationProvider>) {
  const success = (message: string, options?: { title?: string; duration?: number }) => {
    return provider.addNotification({
      type: NotificationType.Success,
      message,
      title: options?.title,
      duration: options?.duration ?? 3000,
    })
  }

  const warning = (message: string, options?: { title?: string; duration?: number }) => {
    return provider.addNotification({
      type: NotificationType.Warning,
      message,
      title: options?.title,
      duration: options?.duration ?? 4000,
    })
  }

  const error = (message: string, options?: { title?: string; duration?: number }) => {
    return provider.addNotification({
      type: NotificationType.Error,
      message,
      title: options?.title,
      duration: options?.duration ?? 5000,
    })
  }

  const notify = (type: NotificationType, message: string, options?: { title?: string; duration?: number }) => {
    return provider.addNotification({
      type,
      message,
      title: options?.title,
      duration: options?.duration,
    })
  }

  return {
    success,
    warning,
    error,
    notify,
    remove: provider.removeNotification,
    clearAll: provider.clearAll,
  }
}

describe('useNotification', () => {
  let provider: ReturnType<typeof createNotificationProvider>
  let notification: ReturnType<typeof createUseNotification>

  beforeEach(() => {
    provider = createNotificationProvider()
    notification = createUseNotification(provider)
  })

  describe('success', () => {
    it('should create a success notification with default duration', () => {
      const id = notification.success('Success message')

      expect(id).toBeDefined()
      expect(provider.notifications).toHaveLength(1)
      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Success,
        message: 'Success message',
        duration: 3000,
      })
    })

    it('should create a success notification with custom title and duration', () => {
      notification.success('Success message', { title: 'Success Title', duration: 5000 })

      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Success,
        message: 'Success message',
        title: 'Success Title',
        duration: 5000,
      })
    })
  })

  describe('warning', () => {
    it('should create a warning notification with default duration', () => {
      const id = notification.warning('Warning message')

      expect(id).toBeDefined()
      expect(provider.notifications).toHaveLength(1)
      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Warning,
        message: 'Warning message',
        duration: 4000,
      })
    })

    it('should create a warning notification with custom options', () => {
      notification.warning('Warning message', { title: 'Warning Title', duration: 6000 })

      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Warning,
        message: 'Warning message',
        title: 'Warning Title',
        duration: 6000,
      })
    })
  })

  describe('error', () => {
    it('should create an error notification with default duration', () => {
      const id = notification.error('Error message')

      expect(id).toBeDefined()
      expect(provider.notifications).toHaveLength(1)
      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Error,
        message: 'Error message',
        duration: 5000,
      })
    })

    it('should create an error notification with custom options', () => {
      notification.error('Error message', { title: 'Error Title', duration: 7000 })

      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Error,
        message: 'Error message',
        title: 'Error Title',
        duration: 7000,
      })
    })
  })

  describe('notify', () => {
    it('should create a custom notification', () => {
      const id = notification.notify(NotificationType.Success, 'Custom message', { title: 'Custom Title', duration: 2000 })

      expect(id).toBeDefined()
      expect(provider.notifications[0]).toMatchObject({
        type: NotificationType.Success,
        message: 'Custom message',
        title: 'Custom Title',
        duration: 2000,
      })
    })

    it('should create notification without duration', () => {
      notification.notify(NotificationType.Warning, 'No duration message')

      expect(provider.notifications[0].duration).toBeUndefined()
    })
  })

  describe('remove', () => {
    it('should remove notification by ID', () => {
      const id = notification.success('Message to remove')
      expect(provider.notifications).toHaveLength(1)

      notification.remove(id)

      expect(provider.notifications).toHaveLength(0)
    })
  })

  describe('clearAll', () => {
    it('should clear all notifications', () => {
      notification.success('Message 1')
      notification.warning('Message 2')
      notification.error('Message 3')

      expect(provider.notifications).toHaveLength(3)

      notification.clearAll()

      expect(provider.notifications).toHaveLength(0)
    })
  })
})
