import { FileStatus } from '@/components/ScriptEditor/types'

import { createFileStateProvider } from '../../context/FileStateContext.spec'
import { createTabBarProvider } from '../../context/TabBarContext.spec'

/**
 * Helper to create TabBar component test scenario
 * Tests TabBar component logic without React DOM rendering
 */
function createTabBarTestScenario(fileState: ReturnType<typeof createFileStateProvider>, tabBar: ReturnType<typeof createTabBarProvider>) {
  /**
   * Get tab information for testing
   * @param path File path
   * @returns Tab information
   */
  const getTabInfo = (path: string) => {
    return tabBar.getTabInfo(path)
  }

  /**
   * Get all tab information
   * @returns Array of tab information
   */
  const getAllTabInfo = () => {
    return tabBar.getAllTabInfo()
  }

  /**
   * Check if status indicator should be displayed
   * @param status File status
   * @returns True if status indicator should be displayed
   */
  const shouldShowStatusIndicator = (status: FileStatus | undefined): boolean => {
    if (status === undefined) {
      return false
    }
    // Status indicator is shown for all statuses except Unchanged
    return status !== FileStatus.Unchanged
  }

  /**
   * Get expected status indicator color
   * @param status File status
   * @returns Expected color class or null
   */
  const getExpectedStatusColor = (status: FileStatus | undefined): string | null => {
    if (status === undefined) {
      return null
    }
    switch (status) {
      case FileStatus.ModifiedUnsaved:
      case FileStatus.NewUnsaved:
        return 'bg-[#007acc]' // Blue for unsaved changes
      case FileStatus.ModifiedSaved:
      case FileStatus.NewSaved:
        return 'bg-[#ff9900]' // Orange for saved locally
      case FileStatus.Deleted:
        return 'bg-[#ce3c3c]' // Red for deleted
      case FileStatus.Unchanged:
      default:
        return null
    }
  }

  return {
    getTabInfo,
    getAllTabInfo,
    shouldShowStatusIndicator,
    getExpectedStatusColor,
    tabBar,
    fileState,
  }
}

describe('TabBar Component', () => {
  describe('File Status Display', () => {
    it('should display status indicator for ModifiedUnsaved files', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Open tab and modify file
      tabBar.openTab('file1.ts')
      fileState.updateFile('file1.ts', 'modified')

      const tabInfo = scenario.getTabInfo('file1.ts')
      expect(tabInfo).not.toBeNull()
      expect(tabInfo?.status).toBe(FileStatus.ModifiedUnsaved)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBe('bg-[#007acc]')
    })

    it('should display status indicator for NewUnsaved files', () => {
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Create new file
      fileState.createFile('new-file.ts', 'content')
      tabBar.openTab('new-file.ts')

      const tabInfo = scenario.getTabInfo('new-file.ts')
      expect(tabInfo).not.toBeNull()
      expect(tabInfo?.status).toBe(FileStatus.NewUnsaved)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBe('bg-[#007acc]')
    })

    it('should display status indicator for ModifiedSaved files', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Open tab, modify and save file
      tabBar.openTab('file1.ts')
      fileState.updateFile('file1.ts', 'modified')
      fileState.markFileAsSaved('file1.ts')

      const tabInfo = scenario.getTabInfo('file1.ts')
      expect(tabInfo).not.toBeNull()
      expect(tabInfo?.status).toBe(FileStatus.ModifiedSaved)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBe('bg-[#ff9900]')
    })

    it('should display status indicator for NewSaved files', () => {
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Create new file and save
      fileState.createFile('new-file.ts', 'content')
      fileState.markFileAsSaved('new-file.ts')
      tabBar.openTab('new-file.ts')

      const tabInfo = scenario.getTabInfo('new-file.ts')
      expect(tabInfo).not.toBeNull()
      expect(tabInfo?.status).toBe(FileStatus.NewSaved)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBe('bg-[#ff9900]')
    })

    it('should not display status indicator for Unchanged files', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Open tab without modifying
      tabBar.openTab('file1.ts')

      const tabInfo = scenario.getTabInfo('file1.ts')
      expect(tabInfo).not.toBeNull()
      expect(tabInfo?.status).toBe(FileStatus.Unchanged)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(false)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBeNull()
    })

    it('should display status indicator for Deleted files', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Open tab and delete file
      tabBar.openTab('file1.ts')
      fileState.deleteFile('file1.ts')

      const tabInfo = scenario.getTabInfo('file1.ts')
      // Deleted files are filtered out from getAllTabInfo, but getTabInfo still returns the info
      expect(tabInfo).not.toBeNull()
      expect(tabInfo?.status).toBe(FileStatus.Deleted)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBe('bg-[#ce3c3c]')
    })

    it('should filter out deleted files from tab list', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Open tabs
      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')

      // Delete one file
      fileState.deleteFile('file1.ts')

      const allTabs = scenario.getAllTabInfo()
      // Deleted files should be filtered out
      expect(allTabs).toHaveLength(1)
      expect(allTabs.map((tab) => tab.path)).not.toContain('file1.ts')
      expect(allTabs.map((tab) => tab.path)).toContain('file2.ts')
    })
  })

  describe('Multiple Tabs with Different Statuses', () => {
    it('should display correct status indicators for multiple tabs', () => {
      const fileState = createFileStateProvider({
        'unchanged.ts': 'content',
        'modified-unsaved.ts': 'original',
      })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Setup files with different statuses
      tabBar.openTab('unchanged.ts')

      tabBar.openTab('modified-unsaved.ts')
      fileState.updateFile('modified-unsaved.ts', 'modified')

      // Create new file (not in initial files)
      fileState.createFile('new-unsaved.ts', 'new content')
      tabBar.openTab('new-unsaved.ts')

      const allTabs = scenario.getAllTabInfo()
      expect(allTabs).toHaveLength(3)

      const unchangedTab = allTabs.find((tab) => tab.path === 'unchanged.ts')
      expect(unchangedTab?.status).toBe(FileStatus.Unchanged)
      expect(scenario.shouldShowStatusIndicator(unchangedTab?.status)).toBe(false)

      const modifiedTab = allTabs.find((tab) => tab.path === 'modified-unsaved.ts')
      expect(modifiedTab?.status).toBe(FileStatus.ModifiedUnsaved)
      expect(scenario.shouldShowStatusIndicator(modifiedTab?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(modifiedTab?.status)).toBe('bg-[#007acc]')

      const newTab = allTabs.find((tab) => tab.path === 'new-unsaved.ts')
      expect(newTab?.status).toBe(FileStatus.NewUnsaved)
      expect(scenario.shouldShowStatusIndicator(newTab?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(newTab?.status)).toBe('bg-[#007acc]')
    })

    it('should update status indicator when file status changes', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      // Open tab - should be Unchanged
      tabBar.openTab('file1.ts')
      let tabInfo = scenario.getTabInfo('file1.ts')
      expect(tabInfo?.status).toBe(FileStatus.Unchanged)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(false)

      // Modify file - should be ModifiedUnsaved
      fileState.updateFile('file1.ts', 'modified')
      tabInfo = scenario.getTabInfo('file1.ts')
      expect(tabInfo?.status).toBe(FileStatus.ModifiedUnsaved)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBe('bg-[#007acc]')

      // Save file - should be ModifiedSaved
      fileState.markFileAsSaved('file1.ts')
      tabInfo = scenario.getTabInfo('file1.ts')
      expect(tabInfo?.status).toBe(FileStatus.ModifiedSaved)
      expect(scenario.shouldShowStatusIndicator(tabInfo?.status)).toBe(true)
      expect(scenario.getExpectedStatusColor(tabInfo?.status)).toBe('bg-[#ff9900]')
    })
  })

  describe('Status Indicator Colors', () => {
    it('should use blue color for unsaved changes', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      tabBar.openTab('file1.ts')
      fileState.updateFile('file1.ts', 'modified')

      const tabInfo = scenario.getTabInfo('file1.ts')
      const color = scenario.getExpectedStatusColor(tabInfo?.status)
      expect(color).toBe('bg-[#007acc]')
    })

    it('should use orange color for saved files', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      tabBar.openTab('file1.ts')
      fileState.updateFile('file1.ts', 'modified')
      fileState.markFileAsSaved('file1.ts')

      const tabInfo = scenario.getTabInfo('file1.ts')
      const color = scenario.getExpectedStatusColor(tabInfo?.status)
      expect(color).toBe('bg-[#ff9900]')
    })

    it('should use red color for deleted files', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content' })
      const tabBar = createTabBarProvider(fileState)
      const scenario = createTabBarTestScenario(fileState, tabBar)

      tabBar.openTab('file1.ts')
      fileState.deleteFile('file1.ts')

      const tabInfo = scenario.getTabInfo('file1.ts')
      const color = scenario.getExpectedStatusColor(tabInfo?.status)
      expect(color).toBe('bg-[#ce3c3c]')
    })
  })
})
