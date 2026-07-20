import {
  clearTabTriggerState,
  ensureTabTriggerHydrated,
  getTabBadgePhase,
  getTabTriggerCount,
  incrementTabTriggerCount,
  resetTabTriggerCountsForPageLoad,
  simulateTabTriggerServiceWorkerRestart,
  syncTabTriggerUrlForClientNavigation,
  TAB_TRIGGER_SESSION_KEY,
} from '@ext/shared/tab-trigger-badge'

describe('tab-trigger-badge', () => {
  const tabId = 42
  let sessionBlob: Record<string, unknown>

  beforeEach(() => {
    sessionBlob = {}
    simulateTabTriggerServiceWorkerRestart()
    global.chrome = {
      storage: {
        session: {
          get: jest.fn(async (key: string) => {
            if (key === TAB_TRIGGER_SESSION_KEY && sessionBlob[TAB_TRIGGER_SESSION_KEY] != null) {
              return { [TAB_TRIGGER_SESSION_KEY]: sessionBlob[TAB_TRIGGER_SESSION_KEY] }
            }
            return {}
          }),
          set: jest.fn(async (items: Record<string, unknown>) => {
            Object.assign(sessionBlob, items)
          }),
          remove: jest.fn(async (key: string) => {
            delete sessionBlob[key]
          }),
        },
      },
    } as unknown as typeof chrome
  })

  it('should preserve trigger count when syncing URL after client-side routing', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|b.js|document-end')

    await syncTabTriggerUrlForClientNavigation(tabId, 'https://example.com/b')

    expect(getTabTriggerCount(tabId)).toBe(2)
  })

  it('should reset trigger count on main-frame page load commit', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')

    await resetTabTriggerCountsForPageLoad(tabId, 'https://example.com/b')

    expect(getTabTriggerCount(tabId)).toBe(0)
    expect(getTabBadgePhase(tabId)).toBe('initializing')
  })

  it('should reset trigger count on same-URL reload via page load reset', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')

    await resetTabTriggerCountsForPageLoad(tabId, 'https://example.com/a')

    expect(getTabTriggerCount(tabId)).toBe(0)
  })

  it('should restore trigger count from session after service worker restart', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|b.js|document-end')
    expect(getTabTriggerCount(tabId)).toBe(2)

    simulateTabTriggerServiceWorkerRestart()
    expect(getTabTriggerCount(tabId)).toBe(0)

    await ensureTabTriggerHydrated()
    expect(getTabTriggerCount(tabId)).toBe(2)
  })

  it('should hydrate before a write so a post-wake increment does not wipe sibling tabs', async () => {
    const otherTabId = 99
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')
    await incrementTabTriggerCount(otherTabId, 'https://other.example/b', 'key|b.js|document-end')
    expect(getTabTriggerCount(tabId)).toBe(1)
    expect(getTabTriggerCount(otherTabId)).toBe(1)

    simulateTabTriggerServiceWorkerRestart()
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')

    expect(getTabTriggerCount(tabId)).toBe(1)
    expect(getTabTriggerCount(otherTabId)).toBe(1)
  })

  it('should not clear session state when clearing a missing tab id', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')
    await clearTabTriggerState(999)
    expect(getTabTriggerCount(tabId)).toBe(1)
  })
})
