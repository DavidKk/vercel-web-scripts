import React from 'react'
import ReactDOMServer from 'react-dom/server'

import { NotificationType } from '@/components/Notification/context/NotificationContext'
import { NotificationItem } from '@/components/Notification/NotificationItem'

describe('NotificationItem', () => {
  const baseNotification = {
    id: 'test-1',
    message: 'Test message',
    createdAt: Date.now(),
  }

  it('should render message content for success type', () => {
    const onClose = jest.fn()
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: { ...baseNotification, type: NotificationType.Success },
        onClose,
      })
    )
    expect(html).toContain('Test message')
  })

  it('should render message and title when title is provided', () => {
    const onClose = jest.fn()
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: { ...baseNotification, type: NotificationType.Warning, title: 'Warning Title' },
        onClose,
      })
    )
    expect(html).toContain('Warning Title')
    expect(html).toContain('Test message')
  })

  it('should render Loading type without close button', () => {
    const onClose = jest.fn()
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: { ...baseNotification, type: NotificationType.Loading, indeterminate: true },
        onClose,
      })
    )
    expect(html).toContain('Test message')
    expect(html).not.toContain('Close notification')
  })

  it('should render progress bar when Loading type has progress', () => {
    const onClose = jest.fn()
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NotificationItem, {
        notification: { ...baseNotification, type: NotificationType.Loading, progress: 50, indeterminate: false },
        onClose,
      })
    )
    expect(html).toContain('Test message')
    expect(html).toContain('50%')
  })
})
