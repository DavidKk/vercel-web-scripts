/**
 * @jest-environment jsdom
 */
import {
  disconnectPageAgentHighlightGuardForTests,
  ensurePageAgentHighlightsHidden,
  removePageAgentHighlightDom,
  VWS_PAGE_AGENT_HIDE_HIGHLIGHTS_STYLE_ID,
} from '@ext/shell/webmcp/page-tools/page-agent-highlights'

describe('page-agent-highlights', () => {
  beforeEach(() => {
    disconnectPageAgentHighlightGuardForTests(document)
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    disconnectPageAgentHighlightGuardForTests(document)
  })

  it('injects a hide style once', () => {
    ensurePageAgentHighlightsHidden(document)
    ensurePageAgentHighlightsHidden(document)
    expect(document.querySelectorAll(`#${VWS_PAGE_AGENT_HIDE_HIGHLIGHTS_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(VWS_PAGE_AGENT_HIDE_HIGHLIGHTS_STYLE_ID)?.textContent).toContain('#playwright-highlight-container')
  })

  it('removes leftover highlight DOM', () => {
    const container = document.createElement('div')
    container.id = 'playwright-highlight-container'
    document.body.append(container)
    const label = document.createElement('div')
    label.className = 'playwright-highlight-label'
    document.body.append(label)

    removePageAgentHighlightDom(document)

    expect(document.getElementById('playwright-highlight-container')).toBeNull()
    expect(document.querySelector('.playwright-highlight-label')).toBeNull()
  })

  it('observer removes highlight nodes as they are added', async () => {
    ensurePageAgentHighlightsHidden(document)

    const container = document.createElement('div')
    container.id = 'playwright-highlight-container'
    document.body.append(container)

    await Promise.resolve()
    expect(document.getElementById('playwright-highlight-container')).toBeNull()
  })
})
