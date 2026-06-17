import {
  clearTabTriggerState,
  getTabTriggerCount,
  incrementTabTriggerCount,
  resetTabTriggerCountsForPageLoad,
  syncTabTriggerUrlForClientNavigation,
} from '@ext/shared/tab-trigger-badge'

describe('tab-trigger-badge', () => {
  const tabId = 42

  beforeEach(() => {
    clearTabTriggerState(tabId)
    global.chrome = {
      storage: {
        session: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as typeof chrome
  })

  it('should preserve trigger count when syncing URL after client-side routing', () => {
    incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')
    incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|b.js|document-end')

    syncTabTriggerUrlForClientNavigation(tabId, 'https://example.com/b')

    expect(getTabTriggerCount(tabId)).toBe(2)
  })

  it('should reset trigger count on main-frame page load commit', () => {
    incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')

    resetTabTriggerCountsForPageLoad(tabId, 'https://example.com/b')

    expect(getTabTriggerCount(tabId)).toBe(0)
  })

  it('should reset trigger count on same-URL reload via page load reset', () => {
    incrementTabTriggerCount(tabId, 'https://example.com/a', 'key|a.js|document-end')

    resetTabTriggerCountsForPageLoad(tabId, 'https://example.com/a')

    expect(getTabTriggerCount(tabId)).toBe(0)
  })
})
