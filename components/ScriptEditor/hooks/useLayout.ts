'use client'

import { useLayoutContext } from '../context/LayoutContext'

/**
 * Hook for layout operations
 * Provides convenient methods to interact with editor layout (sidebar widths, panels)
 * @returns Layout state and operations
 */
export function useLayout() {
  const layout = useLayoutContext()

  return {
    /** Left panel width in pixels */
    leftPanelWidth: layout.leftPanelWidth,
    /** Right panel width in pixels */
    rightPanelWidth: layout.rightPanelWidth,
    /** Currently active right panel type */
    rightPanelType: layout.rightPanelType,

    /** Set left panel width */
    setLeftPanelWidth: layout.setLeftPanelWidth,
    /** Set right panel width */
    setRightPanelWidth: layout.setRightPanelWidth,
    /** Set right panel type */
    setRightPanelType: layout.setRightPanelType,
    /** Toggle a specific right panel */
    toggleRightPanel: layout.toggleRightPanel,
    /** Check if right panel is open */
    isRightPanelOpen: layout.isRightPanelOpen(),
  }
}
