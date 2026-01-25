import { createLayoutProvider } from '../context/LayoutContext.spec'

/**
 * Helper to test useLayout hook logic
 * Since it's a simple wrapper, we can test it by creating a scenario
 */
function createUseLayoutScenario(initialState?: Parameters<typeof createLayoutProvider>[0]) {
  const layout = createLayoutProvider(initialState)

  // Directly use layout methods for testing since the hook is a simple proxy
  return layout
}

describe('useLayout Hook', () => {
  it('should provide layout state and methods', () => {
    const hook = createUseLayoutScenario({
      leftPanelWidth: 200,
      rightPanelWidth: 300,
      rightPanelType: null,
    })

    expect(hook.leftPanelWidth).toBe(200)
    expect(hook.rightPanelWidth).toBe(300)
    expect(hook.rightPanelType).toBeNull()
    expect(hook.isRightPanelOpen()).toBe(false)
  })

  it('should provide generic panel toggling', () => {
    const hook = createUseLayoutScenario()

    // Toggle a custom panel
    hook.toggleRightPanel('custom')
    expect(hook.rightPanelType).toBe('custom')
    expect(hook.isRightPanelOpen()).toBe(true)

    // Toggle off
    hook.toggleRightPanel('custom')
    expect(hook.rightPanelType).toBeNull()
    expect(hook.isRightPanelOpen()).toBe(false)
  })
})
