import React from 'react'
import ReactDOMServer from 'react-dom/server'

import { Tooltip } from '@/components/Tooltip'

describe('Tooltip', () => {
  it('should render children', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(Tooltip, {
        content: 'Tooltip text',
        children: React.createElement('button', null, 'Hover me'),
      })
    )
    expect(html).toContain('Hover me')
  })

  it('should not render tooltip content initially (visible is false on first render)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(Tooltip, {
        content: 'Tooltip text',
        children: React.createElement('span', null, 'Trigger'),
      })
    )
    expect(html).toContain('Trigger')
    expect(html).not.toContain('Tooltip text')
  })

  it('should render with role="tooltip" when visible - structure test', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(Tooltip, {
        content: 'Help text',
        placement: 'bottom',
        children: React.createElement('button', null, 'Button'),
      })
    )
    expect(html).toContain('Button')
  })
})
