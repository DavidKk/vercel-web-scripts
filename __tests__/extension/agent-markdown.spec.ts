/**
 * @jest-environment jsdom
 */
import { renderAgentMarkdownToHtml } from '@ext/ui/sidepanel/agent-markdown'

describe('renderAgentMarkdownToHtml', () => {
  it('renders bold and lists', () => {
    const html = renderAgentMarkdownToHtml('1. **Home** (索引 1)\n2. Open **Playground**')
    expect(html).toContain('<strong>Home</strong>')
    expect(html).toContain('<strong>Playground</strong>')
    expect(html).toMatch(/<(ol|ul)>/)
  })

  it('strips script tags', () => {
    const html = renderAgentMarkdownToHtml('Hello <script>alert(1)</script> **world**')
    expect(html).not.toContain('<script')
    expect(html).toContain('<strong>world</strong>')
  })

  it('returns empty for blank input', () => {
    expect(renderAgentMarkdownToHtml('   ')).toBe('')
  })
})
