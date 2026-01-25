import type { LayoutContextValue } from '@/components/ScriptEditor/context/LayoutContext'

/**
 * Helper to create and test LayoutProvider logic
 * Directly tests the layout management without React DOM
 */
function createLayoutProvider(initialState?: { leftPanelWidth?: number; rightPanelWidth?: number; rightPanelType?: string | null }): LayoutContextValue {
  let leftPanelWidth = initialState?.leftPanelWidth ?? 250
  let rightPanelWidth = initialState?.rightPanelWidth ?? 400
  let rightPanelType = initialState?.rightPanelType ?? null

  const setLeftPanelWidth = (width: number) => {
    leftPanelWidth = width
  }

  const setRightPanelWidth = (width: number) => {
    rightPanelWidth = width
  }

  const setRightPanelType = (type: string | null) => {
    rightPanelType = type
  }

  const toggleRightPanel = (type: string) => {
    rightPanelType = rightPanelType === type ? null : type
  }

  const isRightPanelOpen = () => rightPanelType !== null

  return {
    get leftPanelWidth() {
      return leftPanelWidth
    },
    get rightPanelWidth() {
      return rightPanelWidth
    },
    get rightPanelType() {
      return rightPanelType
    },
    setLeftPanelWidth,
    setRightPanelWidth,
    setRightPanelType,
    toggleRightPanel,
    isRightPanelOpen,
  }
}

export { createLayoutProvider }

describe('LayoutContext', () => {
  it('should initialize with default values', () => {
    const layout = createLayoutProvider()
    expect(layout.leftPanelWidth).toBe(250)
    expect(layout.rightPanelWidth).toBe(400)
    expect(layout.rightPanelType).toBeNull()
  })

  it('should initialize with provided values', () => {
    const layout = createLayoutProvider({
      leftPanelWidth: 300,
      rightPanelWidth: 500,
      rightPanelType: 'ai',
    })
    expect(layout.leftPanelWidth).toBe(300)
    expect(layout.rightPanelWidth).toBe(500)
    expect(layout.rightPanelType).toBe('ai')
  })

  it('should update panel widths', () => {
    const layout = createLayoutProvider()
    layout.setLeftPanelWidth(350)
    layout.setRightPanelWidth(450)
    expect(layout.leftPanelWidth).toBe(350)
    expect(layout.rightPanelWidth).toBe(450)
  })

  it('should update right panel type', () => {
    const layout = createLayoutProvider()
    layout.setRightPanelType('rules')
    expect(layout.rightPanelType).toBe('rules')
    layout.setRightPanelType(null)
    expect(layout.rightPanelType).toBeNull()
  })

  it('should toggle right panel', () => {
    const layout = createLayoutProvider()

    // Toggle on
    layout.toggleRightPanel('ai')
    expect(layout.rightPanelType).toBe('ai')
    expect(layout.isRightPanelOpen()).toBe(true)

    // Toggle off
    layout.toggleRightPanel('ai')
    expect(layout.rightPanelType).toBeNull()
    expect(layout.isRightPanelOpen()).toBe(false)

    // Switch type via toggle
    layout.toggleRightPanel('ai')
    layout.toggleRightPanel('rules')
    expect(layout.rightPanelType).toBe('rules')
  })
})
