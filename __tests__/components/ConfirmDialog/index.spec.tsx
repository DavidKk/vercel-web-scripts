import React from 'react'
import ReactDOMServer from 'react-dom/server'

import { ConfirmDialog } from '@/components/ConfirmDialog'

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    message: 'Are you sure?',
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Confirm', value: 'confirm', variant: 'primary' as const },
    ],
  }

  it('should return null when open is false', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(ConfirmDialog, { ...defaultProps, open: false }))
    expect(html).toBe('')
  })

  it('should render message and buttons when open is true', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(ConfirmDialog, defaultProps))
    expect(html).toContain('Are you sure?')
    expect(html).toContain('Cancel')
    expect(html).toContain('Confirm')
  })

  it('should render title when title is provided', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(ConfirmDialog, { ...defaultProps, title: 'Confirm action' }))
    expect(html).toContain('Confirm action')
    expect(html).toContain('confirm-dialog-title')
  })

  it('should render all button labels', () => {
    const props = {
      ...defaultProps,
      buttons: [
        { label: 'Overwrite', value: 'overwrite', variant: 'primary' as const },
        { label: 'Resolve', value: 'resolve' },
        { label: 'Cancel', value: 'cancel' },
      ],
    }
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(ConfirmDialog, props))
    expect(html).toContain('Overwrite')
    expect(html).toContain('Resolve')
    expect(html).toContain('Cancel')
  })
})
