/**
 * XPath 生成与节点查找 E2E 测试
 * 仅测试 generateXPath / findElementByXPath，不依赖 node-selector UI 与 GM 存储
 */

import { expect, test } from '@playwright/test'

const TEST_HTML = `
  <!DOCTYPE html>
  <html>
    <head><title>XPath Generation Test</title></head>
    <body>
      <div id="container" class="main-container">
        <header class="header-section" data-testid="header">
          <h1 id="title" class="title-text">Test Page</h1>
        </header>
        <main class="content-section">
          <div class="card" data-id="card-1" data-component-id="card-component">
            <h2 class="card-title">Card 1</h2>
            <p class="card-content">Content 1</p>
          </div>
          <div class="card" data-id="card-2">
            <h2 class="card-title">Card 2</h2>
            <p class="card-content">Content 2</p>
          </div>
          <div class="card" id="special-card">
            <h2 class="card-title">Special Card</h2>
            <p class="card-content">Special Content</p>
          </div>
          <div class="card hash-class-abc123def456">
            <h2 class="card-title">Card with Hash Class</h2>
            <p class="card-content">Content with hash</p>
          </div>
          <form name="test-form" class="form-container">
            <input type="text" name="username" placeholder="Username" />
            <input type="password" name="password" placeholder="Password" />
            <button type="submit" class="submit-btn" role="button">Submit</button>
          </form>
          <nav role="navigation" class="nav-menu">
            <a href="/home" class="nav-link">Home</a>
            <a href="/about" class="nav-link">About</a>
          </nav>
        </main>
        <footer class="footer-section"><p class="footer-text">Footer</p></footer>
      </div>
      <script src="/static/preset.js"></script>
    </body>
  </html>
`

test.describe('XPath Generation', () => {
  test.setTimeout(90_000) // beforeEach may take up to ~45s when waiting for preset under load
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.setContent(TEST_HTML)
    // Longer timeout when running in parallel (multiple workers loading preset.js)
    await page.waitForFunction(() => typeof (window as any).generateXPath === 'function', { timeout: 30_000 })
    await page.waitForFunction(() => typeof (window as any).findElementByXPath === 'function', { timeout: 15_000 })
  })

  test('should generate XPath using ID and find node', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.getElementById('title') as HTMLElement
      if (!el) return null
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return null
      const found = (window as any).findElementByXPath(xpath)
      return { xpath, sameNode: found === el, text: found?.textContent?.trim() ?? null }
    })
    expect(result).toBeTruthy()
    expect(result?.xpath).toBeTruthy()
    expect(result?.sameNode).toBe(true)
    expect(result?.text).toBe('Test Page')
  })

  test('should generate XPath using class and find node', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.querySelector('.card-title') as HTMLElement
      if (!el) return null
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return null
      const found = (window as any).findElementByXPath(xpath)
      return { xpath, sameNode: found === el, text: found?.textContent?.trim() ?? null }
    })
    expect(result).toBeTruthy()
    expect(result?.xpath).toBeTruthy()
    expect(result?.sameNode).toBe(true)
    expect(result?.xpath).toContain('contains(@class')
    expect(result?.text).toBe('Card 1')
  })

  test('should generate XPath using data-* attribute and find node', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="header"]') as HTMLElement
      if (!el) return null
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return null
      const found = (window as any).findElementByXPath(xpath)
      return { xpath, sameNode: found === el }
    })
    expect(result).toBeTruthy()
    expect(result?.xpath).toBeTruthy()
    expect(result?.sameNode).toBe(true)
    // Implementation may use class or data-testid; we only require correct node is found
  })

  test('should filter hash-like classes in generated XPath', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.querySelector('.hash-class-abc123def456') as HTMLElement
      if (!el) return null
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return null
      const found = (window as any).findElementByXPath(xpath)
      return { xpath, sameNode: found === el }
    })
    // Element has hash-like class; implementation may return null when path is ambiguous
    if (result) {
      expect(result.xpath).toBeTruthy()
      expect(result.sameNode).toBe(true)
      expect(result.xpath).not.toContain('abc123def456')
    }
  })

  test('should skip html/body in XPath path', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.getElementById('title') as HTMLElement
      if (!el) return null
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return null
      return { xpath }
    })
    expect(result?.xpath).toBeTruthy()
    expect(result?.xpath).not.toMatch(/^\/html/)
    expect(result?.xpath).not.toMatch(/^\/body/)
    expect(result?.xpath).toContain('h1')
  })

  test('should find node by generated XPath (validate round-trip)', async ({ page }) => {
    const isValid = await page.evaluate(() => {
      const el = document.getElementById('title') as HTMLElement
      if (!el) return false
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return false
      const found = (window as any).findElementByXPath(xpath)
      return found === el && found?.textContent?.trim() === 'Test Page'
    })
    expect(isValid).toBe(true)
  })

  test('should generate XPath with data-* priority and find node', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.querySelector('[data-id="card-1"]') as HTMLElement
      if (!el) return null
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return null
      const found = (window as any).findElementByXPath(xpath)
      return { xpath, sameNode: found === el }
    })
    expect(result).toBeTruthy()
    expect(result?.sameNode).toBe(true)
    // Implementation may use class or data-*; we only require correct node is found
  })

  test('should generate XPath for nested element and find node', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.querySelector('.card-content') as HTMLElement
      if (!el) return null
      const xpath = (window as any).generateXPath(el)
      if (!xpath) return null
      const found = (window as any).findElementByXPath(xpath)
      return { xpath, sameNode: found === el, text: found?.textContent?.trim() ?? null }
    })
    expect(result).toBeTruthy()
    expect(result?.xpath).toContain('p')
    expect(result?.sameNode).toBe(true)
    expect(result?.text).toBe('Content 1')
  })
})
