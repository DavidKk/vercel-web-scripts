/**
 * @jest-environment jsdom
 */
import {
  createPageControllerAdapter,
  PAGE_FILL_MAX_CHARS,
  PAGE_SNAPSHOT_MAX_CHARS,
  type PageControllerLike,
  truncateForPageTool,
} from '@ext/shell/webmcp/page-tools/page-controller-adapter'

describe('truncateForPageTool', () => {
  it('should not truncate short text', () => {
    expect(truncateForPageTool('hello', 10)).toEqual({ text: 'hello', truncated: false })
  })

  it('should truncate long text', () => {
    const long = 'a'.repeat(PAGE_SNAPSHOT_MAX_CHARS + 10)
    const result = truncateForPageTool(long, PAGE_SNAPSHOT_MAX_CHARS)
    expect(result.truncated).toBe(true)
    expect(result.text).toHaveLength(PAGE_SNAPSHOT_MAX_CHARS)
  })
})

describe('createPageControllerAdapter', () => {
  function createDoc() {
    const doc = document.implementation.createHTMLDocument('Demo')
    doc.body.innerHTML = '<h1>Title One</h1><h2>Subtitle</h2><input id="email" />'
    Object.defineProperty(doc, 'defaultView', {
      configurable: true,
      value: { location: { href: 'https://example.com/form' } },
    })
    return doc
  }

  function createController(overrides: Partial<PageControllerLike> = {}): PageControllerLike {
    return {
      updateTree: async () => '[0]<input />\n[1]<button >Submit />',
      getBrowserState: async () => ({ url: 'https://example.com/form', title: 'Demo', content: '' }),
      clickElement: async () => ({ success: true, message: 'clicked' }),
      inputText: async () => ({ success: true, message: 'typed' }),
      scroll: async () => ({ success: true, message: 'scrolled' }),
      cleanUpHighlights: async () => undefined,
      ...overrides,
    }
  }

  it('should clear highlight overlays after snapshot', async () => {
    const cleanUpHighlights = jest.fn(async () => undefined)
    const adapter = createPageControllerAdapter(createController({ cleanUpHighlights }), createDoc())
    await adapter.snapshot()
    expect(cleanUpHighlights).toHaveBeenCalled()
  })

  it('should clear highlight overlays after outline', async () => {
    const cleanUpHighlights = jest.fn(async () => undefined)
    const adapter = createPageControllerAdapter(createController({ cleanUpHighlights }), createDoc())
    await adapter.outline()
    expect(cleanUpHighlights).toHaveBeenCalled()
  })

  it('should snapshot with index count and truncation flag', async () => {
    const adapter = createPageControllerAdapter(createController(), createDoc())
    const result = await adapter.snapshot()
    expect(result.ok).toBe(true)
    expect(result.url).toBe('https://example.com/form')
    expect(result.indexCount).toBe(2)
    expect(result.truncated).toBe(false)
  })

  it('should build outline from headings', async () => {
    const adapter = createPageControllerAdapter(createController(), createDoc())
    const result = await adapter.outline()
    expect(result.outline).toContain('# Title One')
    expect(result.outline).toContain('## Subtitle')
    expect(result.headings).toEqual([
      { level: 1, text: 'Title One' },
      { level: 2, text: 'Subtitle' },
    ])
    expect(result.h1Count).toBe(1)
  })

  it('should separate nested heading text runs with spaces', async () => {
    const doc = document.implementation.createHTMLDocument('Demo')
    doc.body.innerHTML = '<h1><span>Script once.</span><span>Run on yours.</span></h1>'
    Object.defineProperty(doc, 'defaultView', {
      configurable: true,
      value: { location: { href: 'https://example.com/' } },
    })
    const adapter = createPageControllerAdapter(createController(), doc)
    const result = await adapter.outline()
    expect(result.headings[0]?.text).toBe('Script once. Run on yours.')
  })

  it('should return page meta without storage fields', () => {
    const adapter = createPageControllerAdapter(createController(), createDoc())
    const meta = adapter.pageMeta()
    expect(meta.ok).toBe(true)
    expect(meta.url).toBe('https://example.com/form')
    expect(meta.title).toBe('Demo')
    expect(typeof meta.visibilityState).toBe('string')
    expect(JSON.stringify(meta)).not.toMatch(/cookie|localStorage|sessionStorage/i)
  })

  it('should reject fill when text exceeds max', async () => {
    const adapter = createPageControllerAdapter(createController(), createDoc())
    const result = await adapter.fill(0, 'x'.repeat(PAGE_FILL_MAX_CHARS + 1))
    expect(result).toMatchObject({ ok: false, error: 'fill_too_long' })
  })

  it('should clear highlight overlays after click', async () => {
    const cleanUpHighlights = jest.fn(async () => undefined)
    const doc = createDoc()
    const container = doc.createElement('div')
    container.id = 'playwright-highlight-container'
    doc.body.append(container)
    const adapter = createPageControllerAdapter(createController({ cleanUpHighlights }), doc)
    await adapter.click(0)
    expect(cleanUpHighlights).toHaveBeenCalled()
    expect(doc.getElementById('playwright-highlight-container')).toBeNull()
  })
})
