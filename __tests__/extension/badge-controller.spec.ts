import { BADGE_BACKGROUND, BADGE_BACKGROUND_IDLE } from '@ext/shared/badge-display'
import {
  ensureTabTriggerHydrated,
  getTabTriggerCount,
  incrementTabTriggerCount,
  simulateTabTriggerServiceWorkerRestart,
  TAB_TRIGGER_SESSION_KEY,
} from '@ext/shared/tab-trigger-badge'
import { createBadgeRefreshHandler } from '@ext/shell/badge-controller'

describe('badge-controller', () => {
  const tabId = 7
  let sessionBlob: Record<string, unknown>
  let badgeText: string
  let badgeBackground: string

  beforeEach(() => {
    sessionBlob = {}
    badgeText = ''
    badgeBackground = ''
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
      action: {
        setBadgeText: jest.fn(async ({ text }: { text: string }) => {
          badgeText = text
        }),
        setBadgeBackgroundColor: jest.fn(async ({ color }: { color: string }) => {
          badgeBackground = color
        }),
        setBadgeTextColor: jest.fn(async () => undefined),
      },
      tabs: {
        get: jest.fn(),
      },
    } as unknown as typeof chrome
  })

  it('should not clear trigger count when refreshing with a missing URL', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/', 'key|a.js|document-end')
    const updateBadgeForTab = createBadgeRefreshHandler(async () => true)

    await updateBadgeForTab(tabId, undefined)

    expect(getTabTriggerCount(tabId)).toBe(1)
    expect(badgeText).toBe('')
    expect(badgeBackground).toBe(BADGE_BACKGROUND)
  })

  it('should restore badge count after service worker restart before tab switch refresh', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/', 'key|a.js|document-end')
    simulateTabTriggerServiceWorkerRestart()
    expect(getTabTriggerCount(tabId)).toBe(0)

    const updateBadgeForTab = createBadgeRefreshHandler(async () => true)
    await updateBadgeForTab(tabId, 'https://example.com/')

    expect(getTabTriggerCount(tabId)).toBe(1)
    expect(badgeText).toBe('1')
    expect(badgeBackground).not.toBe(BADGE_BACKGROUND_IDLE)
  })

  it('should hydrate via ensure before reading badge state', async () => {
    await incrementTabTriggerCount(tabId, 'https://example.com/', 'key|a.js|document-end')
    simulateTabTriggerServiceWorkerRestart()
    await ensureTabTriggerHydrated()
    expect(getTabTriggerCount(tabId)).toBe(1)
  })
})
