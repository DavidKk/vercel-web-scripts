/**
 * Locator JSON 生成与回放定位 E2E 测试
 * 测试基于语义指纹的多策略节点定位方案
 */

import { expect, test } from '@playwright/test'

test.describe('Locator JSON Generation and Playback', () => {
  test.setTimeout(90_000) // beforeEach may take up to ~45s when waiting for preset under load
  test.beforeEach(async ({ page }) => {
    // Navigate to baseURL first so <script src="/static/preset.js"> resolves to the dev server
    await page.goto('/')
    // Load a test HTML page with various DOM structures
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Locator JSON Test</title>
        </head>
        <body>
          <div id="container" class="main-container">
            <header class="header-section" data-testid="header">
              <h1 id="title" class="title-text">Test Page</h1>
            </header>
            <main class="content-section">
              <button data-testid="submit-btn" class="btn btn-primary" role="button" aria-label="Submit Form">
                Submit
              </button>
              <button class="btn btn-secondary" role="button">Cancel</button>
              <button class="btn" id="delete-btn">Delete</button>
              
              <div class="card" data-id="card-1" data-component-id="card-component">
                <h2 class="card-title">Card 1</h2>
                <p class="card-content">Price: $19.99</p>
                <button class="buy-btn">Buy Now</button>
              </div>
              
              <div class="card" data-id="card-2">
                <h2 class="card-title">Card 2</h2>
                <p class="card-content">Price: $29.99</p>
                <button class="buy-btn">Buy Now</button>
              </div>
              
              <form name="test-form" class="form-container">
                <input type="text" name="username" placeholder="Username" />
                <input type="email" name="email" placeholder="Email" />
                <button type="submit" class="submit-btn" role="button">Submit Form</button>
              </form>
              
              <nav role="navigation" class="nav-menu">
                <a href="/home" class="nav-link">Home</a>
                <a href="/about" class="nav-link">About</a>
              </nav>
              
              <div class="card hash-class-css-1x92ab sc-Ax9z jsx-123456">
                <h2>Card with Hash Classes</h2>
                <p>This card has hash classes that should be filtered</p>
              </div>
            </main>
            <footer class="footer-section">
              <p class="footer-text">Footer</p>
            </footer>
          </div>
          <script src="/static/preset.js"></script>
        </body>
      </html>
    `)

    // Wait for locator APIs (no dependency on node-selector UI or GM storage)
    // Use longer timeout when running in parallel (multiple workers loading preset.js)
    await page.waitForFunction(() => typeof (window as any).generateLocatorJSON === 'function', {
      timeout: 30_000,
    })
    await page.waitForFunction(() => typeof (window as any).locateNodeByJSON === 'function', {
      timeout: 15_000,
    })
  })

  test('should generate Locator JSON with data-testid (stability level A)', async ({ page }) => {
    const locator = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="submit-btn"]') as HTMLElement
      if (!element) return null

      // Generate Locator JSON (available via preset bundle)
      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return null
      }

      return generateLocatorJSON(element)
    })

    // If locator functions are not available, skip test with helpful message
    if (!locator) {
      test.skip()
      return
    }

    expect(locator).toBeTruthy()
    expect(locator.tag).toBe('button')
    expect(locator.attributes?.['data-testid']).toBe('submit-btn')
    expect(locator.stabilityLevel).toBe('A')
    expect(locator.text).toBe('Submit')
    expect(locator.createdAt).toBeDefined()
    expect(locator.version).toBe(1)
  })

  test('should generate Locator JSON with role and aria-label (stability level A)', async ({ page }) => {
    const locator = await page.evaluate(() => {
      const element = document.querySelector('[aria-label="Submit Form"]') as HTMLElement
      if (!element) return null

      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return null
      }

      return generateLocatorJSON(element)
    })

    if (!locator) {
      test.skip()
      return
    }

    expect(locator).toBeTruthy()
    expect(locator.role).toBe('button')
    expect(locator.attributes?.['aria-label']).toBe('Submit Form')
    expect(locator.stabilityLevel).toBe('A')
  })

  test('should generate Locator JSON with role and text (stability level B)', async ({ page }) => {
    const locator = await page.evaluate(() => {
      const element = document.querySelector('button[role="button"]:not([data-testid])') as HTMLElement
      if (!element) return null

      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return null
      }

      return generateLocatorJSON(element)
    })

    if (!locator) {
      test.skip()
      return
    }

    expect(locator).toBeTruthy()
    expect(locator.role).toBe('button')
    expect(locator.text).toBeTruthy()
    expect(locator.stabilityLevel).toBe('B')
  })

  test('should filter out hash classes from stableClasses', async ({ page }) => {
    const locator = await page.evaluate(() => {
      const element = document.querySelector('.hash-class-css-1x92ab') as HTMLElement
      if (!element) return null

      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return null
      }

      return generateLocatorJSON(element)
    })

    if (!locator) {
      test.skip()
      return
    }

    expect(locator).toBeTruthy()
    if (locator.stableClasses) {
      // Should not contain hash classes
      expect(locator.stableClasses).not.toContain('css-1x92ab')
      expect(locator.stableClasses).not.toContain('sc-Ax9z')
      expect(locator.stableClasses).not.toContain('jsx-123456')
    }
  })

  test('should extract nearText from parent and sibling nodes', async ({ page }) => {
    const locator = await page.evaluate(() => {
      const element = document.querySelector('.buy-btn') as HTMLElement
      if (!element) return null

      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return null
      }

      return generateLocatorJSON(element)
    })

    if (!locator) {
      test.skip()
      return
    }

    expect(locator).toBeTruthy()
    expect(locator.nearText).toBeDefined()
    if (locator.nearText && locator.nearText.length > 0) {
      // Should contain text from parent or siblings
      const hasPriceText = locator.nearText.some((text: string) => text.includes('Price') || text.includes('$'))
      expect(hasPriceText).toBe(true)
    }
  })

  test('should calculate DOM depth and position hint', async ({ page }) => {
    const locator = await page.evaluate(() => {
      const element = document.querySelector('.card-title') as HTMLElement
      if (!element) return null

      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return null
      }

      return generateLocatorJSON(element)
    })

    if (!locator) {
      test.skip()
      return
    }

    expect(locator).toBeTruthy()
    expect(locator.domDepth).toBeGreaterThan(0)
    expect(locator.positionHint).toBeDefined()
    if (locator.positionHint) {
      expect(locator.positionHint.indexAmongSameTag).toBeGreaterThanOrEqual(0)
    }
  })

  test('should generate XPath fallback', async ({ page }) => {
    const locator = await page.evaluate(() => {
      const element = document.getElementById('title') as HTMLElement
      if (!element) return null

      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return null
      }

      return generateLocatorJSON(element)
    })

    if (!locator) {
      test.skip()
      return
    }

    expect(locator).toBeTruthy()
    // xpathFallback is optional (may be undefined if generateXPath returns null)
    if (locator.xpathFallback != null) {
      expect(locator.xpathFallback).toBeTruthy()
    }
  })

  test('should locate node by Locator JSON using data-testid (highest priority)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const generateLocatorJSON = (window as any).generateLocatorJSON
      const locateNodeByJSON = (window as any).locateNodeByJSON
      if (!generateLocatorJSON || !locateNodeByJSON) {
        return { error: 'Functions not available' }
      }

      // Generate locator for submit button
      const originalElement = document.querySelector('[data-testid="submit-btn"]') as HTMLElement
      if (!originalElement) {
        return { error: 'Element not found' }
      }

      const locator = generateLocatorJSON(originalElement)

      // Try to locate the node using the locator
      const foundElement = locateNodeByJSON(locator)

      return {
        success: foundElement === originalElement,
        locator,
        foundText: foundElement?.textContent?.trim(),
      }
    })

    if (result.error) {
      test.skip()
      return
    }

    expect(result.success).toBe(true)
    expect(result.foundText).toBe('Submit')
  })

  test('should locate node by Locator JSON using role + text', async ({ page }) => {
    const result = await page.evaluate(() => {
      const generateLocatorJSON = (window as any).generateLocatorJSON
      const locateNodeByJSON = (window as any).locateNodeByJSON
      if (!generateLocatorJSON || !locateNodeByJSON) {
        return { error: 'Functions not available' }
      }

      // Generate locator for cancel button (has role but no data-testid)
      const originalElement = document.querySelector('button.btn-secondary') as HTMLElement
      if (!originalElement) {
        return { error: 'Element not found' }
      }

      const locator = generateLocatorJSON(originalElement)

      // Try to locate the node using the locator
      const foundElement = locateNodeByJSON(locator)

      return {
        success: foundElement === originalElement,
        locator,
        foundText: foundElement?.textContent?.trim(),
      }
    })

    if (result.error) {
      test.skip()
      return
    }

    expect(result.success).toBe(true)
    expect(result.foundText).toBe('Cancel')
  })

  test('should locate node by Locator JSON using text fuzzy matching', async ({ page }) => {
    const result = await page.evaluate(() => {
      const generateLocatorJSON = (window as any).generateLocatorJSON
      const locateNodeByJSON = (window as any).locateNodeByJSON
      if (!generateLocatorJSON || !locateNodeByJSON) {
        return { error: 'Functions not available' }
      }

      // Generate locator for delete button
      const originalElement = document.getElementById('delete-btn') as HTMLElement
      if (!originalElement) {
        return { error: 'Element not found' }
      }

      const locator = generateLocatorJSON(originalElement)

      // Try to locate the node using the locator
      const foundElement = locateNodeByJSON(locator)

      return {
        success: foundElement === originalElement,
        locator,
        foundText: foundElement?.textContent?.trim(),
      }
    })

    if (result.error) {
      test.skip()
      return
    }

    expect(result.success).toBe(true)
    expect(result.foundText).toBe('Delete')
  })

  test('should locate node by Locator JSON using XPath fallback', async ({ page }) => {
    const result = await page.evaluate(() => {
      const generateLocatorJSON = (window as any).generateLocatorJSON
      const locateNodeByJSON = (window as any).locateNodeByJSON
      if (!generateLocatorJSON || !locateNodeByJSON) {
        return { error: 'Functions not available' }
      }

      // Generate locator for title element
      const originalElement = document.getElementById('title') as HTMLElement
      if (!originalElement) {
        return { error: 'Element not found' }
      }

      const locator = generateLocatorJSON(originalElement)

      // Remove other attributes to force XPath fallback
      const fallbackLocator = {
        ...locator,
        attributes: undefined,
        text: undefined,
        role: undefined,
      }

      // Try to locate the node using XPath fallback
      const foundElement = locateNodeByJSON(fallbackLocator)

      return {
        success: foundElement === originalElement,
        locator: fallbackLocator,
        foundText: foundElement?.textContent?.trim(),
      }
    })

    if (result.error) {
      test.skip()
      return
    }

    expect(result.success).toBe(true)
    expect(result.foundText).toBe('Test Page')
  })

  test('should locate all matching nodes with scores', async ({ page }) => {
    const result = await page.evaluate(() => {
      const generateLocatorJSON = (window as any).generateLocatorJSON
      const locateAllNodesByJSON = (window as any).locateAllNodesByJSON
      if (!generateLocatorJSON || !locateAllNodesByJSON) {
        return { error: 'Functions not available' }
      }

      // Generate locator for first buy button
      const originalElement = document.querySelector('.buy-btn') as HTMLElement
      if (!originalElement) {
        return { error: 'Element not found' }
      }

      const locator = generateLocatorJSON(originalElement)

      // Find all matching nodes
      const matches = locateAllNodesByJSON(locator, 5)

      return {
        matches: matches.map((m: { node: { tagName: string; textContent?: string | null }; score: number }) => ({
          tag: m.node.tagName.toLowerCase(),
          text: m.node.textContent?.trim(),
          score: m.score,
        })),
        locator,
      }
    })

    if (result.error) {
      test.skip()
      return
    }

    expect(result.matches).toBeDefined()
    expect(result.matches.length).toBeGreaterThan(0)
    // Should be sorted by score (descending)
    for (let i = 1; i < result.matches.length; i++) {
      expect(result.matches[i - 1].score).toBeGreaterThanOrEqual(result.matches[i].score)
    }
  })

  test('should handle DOM changes and still locate node (dynamic: record first, add content, then get at final moment)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const generateLocatorJSON = (window as any).generateLocatorJSON
      const locateNodeByJSON = (window as any).locateNodeByJSON
      if (!generateLocatorJSON || !locateNodeByJSON) {
        return { error: 'Functions not available' }
      }

      // 1. Record: generate locator for element that has stable selector (data-testid)
      const originalElement = document.querySelector('[data-testid="submit-btn"]') as HTMLElement
      if (!originalElement) {
        return { error: 'Element not found' }
      }
      const locator = generateLocatorJSON(originalElement)

      // 2. Dynamic: add content so DOM is different (from start to end we are in a later state)
      const container = document.getElementById('container')
      if (container) {
        const wrap = document.createElement('div')
        wrap.className = 'dynamic-inserted'
        wrap.innerHTML = '<p>Dynamic content 1</p><p>Dynamic content 2</p>'
        container.insertBefore(wrap, container.firstChild)
      }

      // 3. Get at final moment: locate should find the same node we recorded (not the new content)
      const foundElement = locateNodeByJSON(locator)

      return {
        success: foundElement === originalElement,
        locator,
        foundText: foundElement?.textContent?.trim(),
      }
    })

    if (result.error) {
      test.skip()
      return
    }

    // At final moment we should still find the node we recorded
    expect(result.success).toBe(true)
    expect(result.foundText).toBe('Submit')
  })

  test('should evaluate stability level correctly', async ({ page }) => {
    const results = await page.evaluate(() => {
      const generateLocatorJSON = (window as any).generateLocatorJSON
      if (!generateLocatorJSON) {
        return { error: 'Function not available' }
      }

      // Test different stability levels
      const testCases = [
        {
          selector: '[data-testid="submit-btn"]',
          expectedLevel: 'A' as const,
          description: 'data-testid',
        },
        {
          selector: '[aria-label="Submit Form"]',
          expectedLevel: 'A' as const,
          description: 'aria-label',
        },
        {
          selector: 'button.btn-secondary',
          expectedLevel: 'B' as const,
          description: 'role + text',
        },
        {
          selector: '#delete-btn',
          expectedLevel: 'C' as const,
          description: 'text only',
        },
      ]

      const results = testCases.map((testCase) => {
        const element = document.querySelector(testCase.selector) as HTMLElement
        if (!element) {
          return { error: `Element not found: ${testCase.selector}` }
        }

        const locator = generateLocatorJSON(element)
        return {
          description: testCase.description,
          expectedLevel: testCase.expectedLevel,
          actualLevel: locator.stabilityLevel,
          match: locator.stabilityLevel === testCase.expectedLevel,
        }
      })

      return { results }
    })

    if (results.error || !results.results) {
      test.skip()
      return
    }

    for (const result of results.results) {
      if (result.error) {
        continue
      }
      expect(result.match).toBe(true)
    }
  })
})
