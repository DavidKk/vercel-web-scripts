import type { TabBarContextValue } from '@/components/ScriptEditor/context/TabBarContext'
import { FileStatus } from '@/components/ScriptEditor/types'

import { createFileStateProvider } from './FileStateContext.spec'

/**
 * Helper to create and test TabBarProvider
 * Directly tests the provider logic without React DOM
 */
function createTabBarProvider(fileState: ReturnType<typeof createFileStateProvider>): TabBarContextValue {
  let openTabs: string[] = []
  let activeTab: string | null = null

  const getTabInfo = (path: string) => {
    const file = fileState.getFile(path)
    if (!file) {
      return null
    }

    const name = path.split('/').pop() || path
    return {
      path,
      name,
      status: file.status,
      hasUnsavedChanges: fileState.hasUnsavedChanges(path),
    }
  }

  const getAllTabInfo = () => {
    return openTabs
      .map((path) => getTabInfo(path))
      .filter((tab) => tab !== null)
      .filter((tab) => tab!.status !== FileStatus.Deleted)
  }

  const openTab = (path: string) => {
    if (!openTabs.includes(path)) {
      openTabs = [...openTabs, path]
    }
    activeTab = path
  }

  const closeTab = (path: string) => {
    const newTabs = openTabs.filter((tab) => tab !== path)
    if (path === activeTab) {
      const currentIndex = openTabs.indexOf(path)
      if (newTabs.length > 0) {
        const nextIndex = currentIndex < newTabs.length ? currentIndex : currentIndex - 1
        activeTab = newTabs[nextIndex] || null
      } else {
        activeTab = null
      }
    }
    openTabs = newTabs
  }

  const switchTab = (path: string) => {
    if (!openTabs.includes(path)) {
      openTab(path)
    } else {
      activeTab = path
    }
  }

  const closeAllTabs = () => {
    openTabs = []
    activeTab = null
  }

  const closeOtherTabs = (path: string) => {
    openTabs = [path]
    activeTab = path
  }

  const closeTabsToRight = (path: string) => {
    const currentIndex = openTabs.indexOf(path)
    if (currentIndex === -1) {
      return
    }
    const newTabs = openTabs.slice(0, currentIndex + 1)
    if (activeTab && !newTabs.includes(activeTab)) {
      activeTab = newTabs[newTabs.length - 1] || null
    }
    openTabs = newTabs
  }

  const getTabCount = () => openTabs.length

  const isTabOpen = (path: string) => openTabs.includes(path)

  // Return object with getters that always reflect current state
  return {
    get openTabs() {
      return openTabs
    },
    get activeTab() {
      return activeTab
    },
    getTabInfo,
    getAllTabInfo,
    openTab,
    closeTab,
    switchTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToRight,
    getTabCount,
    isTabOpen,
  }
}

// Export for use in other test files
export { createTabBarProvider }

describe('TabBarContext', () => {
  describe('openTab', () => {
    it('should open a new tab and set it as active', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')

      expect(tabBar.isTabOpen('file1.ts')).toBe(true)
      expect(tabBar.activeTab).toBe('file1.ts')
      expect(tabBar.getTabCount()).toBe(1)
    })

    it('should not add duplicate tabs', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file1.ts')

      expect(tabBar.getTabCount()).toBe(1)
      expect(tabBar.openTabs).toEqual(['file1.ts'])
    })

    it('should open multiple tabs', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')

      expect(tabBar.getTabCount()).toBe(3)
      expect(tabBar.openTabs).toEqual(['file1.ts', 'file2.ts', 'file3.ts'])
      expect(tabBar.activeTab).toBe('file3.ts')
    })
  })

  describe('closeTab', () => {
    it('should close a tab', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.closeTab('file1.ts')

      expect(tabBar.isTabOpen('file1.ts')).toBe(false)
      expect(tabBar.activeTab).toBe(null)
      expect(tabBar.getTabCount()).toBe(0)
    })

    it('should switch to next tab when closing active tab', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')
      // Active tab is file3.ts (last opened)
      tabBar.closeTab('file3.ts')

      expect(tabBar.isTabOpen('file3.ts')).toBe(false)
      expect(tabBar.activeTab).toBe('file2.ts')
      expect(tabBar.getTabCount()).toBe(2)
    })

    it('should switch to left tab when closing last tab', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')
      tabBar.switchTab('file3.ts') // Ensure file3 is active
      tabBar.closeTab('file3.ts')

      expect(tabBar.activeTab).toBe('file2.ts')
    })

    it('should set activeTab to null when closing the only tab', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.closeTab('file1.ts')

      expect(tabBar.activeTab).toBe(null)
    })
  })

  describe('switchTab', () => {
    it('should switch to an existing tab', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.switchTab('file1.ts')

      expect(tabBar.activeTab).toBe('file1.ts')
    })

    it('should open and switch to a new tab if not already open', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.switchTab('file1.ts')

      expect(tabBar.isTabOpen('file1.ts')).toBe(true)
      expect(tabBar.activeTab).toBe('file1.ts')
    })
  })

  describe('closeAllTabs', () => {
    it('should close all tabs', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')
      tabBar.closeAllTabs()

      expect(tabBar.getTabCount()).toBe(0)
      expect(tabBar.activeTab).toBe(null)
    })
  })

  describe('closeOtherTabs', () => {
    it('should close all tabs except the specified one', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')
      tabBar.closeOtherTabs('file2.ts')

      expect(tabBar.getTabCount()).toBe(1)
      expect(tabBar.isTabOpen('file2.ts')).toBe(true)
      expect(tabBar.activeTab).toBe('file2.ts')
    })
  })

  describe('closeTabsToRight', () => {
    it('should close tabs to the right of the specified tab', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
        'file4.ts': 'content4',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')
      tabBar.openTab('file4.ts')
      tabBar.closeTabsToRight('file2.ts')

      expect(tabBar.getTabCount()).toBe(2)
      expect(tabBar.openTabs).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should switch active tab if it was closed', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')
      tabBar.switchTab('file3.ts')
      // Close tabs to the right of file1.ts (closes file2.ts and file3.ts)
      tabBar.closeTabsToRight('file1.ts')

      // After closing tabs to the right of file1.ts, only file1.ts should remain
      // Since file3.ts was active and got closed, we should switch to file1.ts (the last remaining tab)
      expect(tabBar.getTabCount()).toBe(1)
      expect(tabBar.openTabs).toEqual(['file1.ts'])
      expect(tabBar.activeTab).toBe('file1.ts')
    })

    it('should not close tabs if specified tab is not found', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.closeTabsToRight('nonexistent.ts')

      expect(tabBar.getTabCount()).toBe(2)
    })
  })

  describe('getTabInfo', () => {
    it('should return tab information for an open file', () => {
      const fileState = createFileStateProvider({ 'src/file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('src/file1.ts')
      const tabInfo = tabBar.getTabInfo('src/file1.ts')

      expect(tabInfo).toBeDefined()
      expect(tabInfo?.path).toBe('src/file1.ts')
      expect(tabInfo?.name).toBe('file1.ts')
      expect(tabInfo?.status).toBe(FileStatus.Unchanged)
      expect(tabInfo?.hasUnsavedChanges).toBe(false)
    })

    it('should return null for a non-existent file', () => {
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)

      const tabInfo = tabBar.getTabInfo('nonexistent.ts')

      expect(tabInfo).toBeNull()
    })

    it('should reflect unsaved changes in tab info', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      fileState.updateFile('file1.ts', 'modified')
      const tabInfo = tabBar.getTabInfo('file1.ts')

      expect(tabInfo?.hasUnsavedChanges).toBe(true)
      expect(tabInfo?.status).toBe(FileStatus.ModifiedUnsaved)
    })
  })

  describe('getAllTabInfo', () => {
    it('should return information for all open tabs', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')

      const allTabInfo = tabBar.getAllTabInfo()

      expect(allTabInfo).toHaveLength(3)
      expect(allTabInfo.map((tab) => tab.path)).toEqual(['file1.ts', 'file2.ts', 'file3.ts'])
    })

    it('should filter out tabs for deleted files', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      fileState.deleteFile('file2.ts')

      const allTabInfo = tabBar.getAllTabInfo()

      expect(allTabInfo).toHaveLength(1)
      expect(allTabInfo[0]?.path).toBe('file1.ts')
    })
  })

  describe('getTabCount', () => {
    it('should return the number of open tabs', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)

      expect(tabBar.getTabCount()).toBe(0)

      tabBar.openTab('file1.ts')
      expect(tabBar.getTabCount()).toBe(1)

      tabBar.openTab('file2.ts')
      expect(tabBar.getTabCount()).toBe(2)

      tabBar.closeTab('file1.ts')
      expect(tabBar.getTabCount()).toBe(1)
    })
  })

  describe('isTabOpen', () => {
    it('should return true for open tabs', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      tabBar.openTab('file1.ts')

      expect(tabBar.isTabOpen('file1.ts')).toBe(true)
    })

    it('should return false for closed tabs', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)

      expect(tabBar.isTabOpen('file1.ts')).toBe(false)
    })
  })

  describe('TabBar state restoration with async file loading', () => {
    it('should restore tabs even when files are not loaded yet', () => {
      // Simulate scenario: files are loaded asynchronously (e.g., from IndexedDB)
      // TabBar should restore tabs first, then validate after files are loaded

      // Step 1: Create file state provider with empty files (simulating before async load)
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)

      // Step 2: Simulate saved tab state (what would be loaded from IndexedDB)
      const savedOpenTabs = ['file1.ts', 'file2.ts', 'file3.ts']
      const savedActiveTab = 'file2.ts'

      // Step 3: Restore tabs (simulating TabBarContext restoration)
      // At this point, files don't exist yet, but tabs should still be restored
      savedOpenTabs.forEach((path) => {
        tabBar.openTab(path)
      })
      tabBar.switchTab(savedActiveTab)

      // Step 4: Verify tabs are restored even though files don't exist
      expect(tabBar.getTabCount()).toBe(3)
      expect(tabBar.openTabs).toEqual(savedOpenTabs)
      expect(tabBar.activeTab).toBe(savedActiveTab)

      // Step 5: Simulate files being loaded asynchronously
      fileState.initializeFiles({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })

      // Step 6: After files are loaded, tabs should still be valid
      expect(tabBar.getTabCount()).toBe(3)
      expect(tabBar.openTabs).toEqual(savedOpenTabs)
      expect(tabBar.activeTab).toBe(savedActiveTab)

      // Step 7: Verify tab info is now available
      const tabInfo = tabBar.getTabInfo('file2.ts')
      expect(tabInfo).not.toBeNull()
      expect(tabInfo?.path).toBe('file2.ts')
      expect(tabInfo?.status).toBe(FileStatus.Unchanged)
    })

    it('should filter out invalid tabs after files are loaded', () => {
      // Simulate scenario: some saved tabs reference files that no longer exist

      // Step 1: Create file state provider with empty files
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)

      // Step 2: Restore tabs including some invalid ones
      const savedOpenTabs = ['file1.ts', 'deleted-file.ts', 'file2.ts', 'nonexistent.ts']
      const savedActiveTab = 'deleted-file.ts'

      savedOpenTabs.forEach((path) => {
        tabBar.openTab(path)
      })
      tabBar.switchTab(savedActiveTab)

      // Step 3: Verify tabs are restored
      expect(tabBar.getTabCount()).toBe(4)
      expect(tabBar.openTabs).toEqual(savedOpenTabs)

      // Step 4: Load files (only some files exist)
      fileState.initializeFiles({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })

      // Step 5: Simulate validation (filter invalid tabs)
      // In real implementation, this happens in useEffect when fileState.files changes
      const allTabInfo = tabBar.getAllTabInfo()
      const validTabs = allTabInfo.map((tab) => tab.path)

      // Step 6: Verify only valid tabs remain
      expect(validTabs).toEqual(['file1.ts', 'file2.ts'])
      expect(validTabs).not.toContain('deleted-file.ts')
      expect(validTabs).not.toContain('nonexistent.ts')
    })

    it('should handle active tab being invalid after file load', () => {
      // Simulate scenario: active tab references a file that doesn't exist

      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)

      // Restore tabs with invalid active tab
      tabBar.openTab('file1.ts')
      tabBar.openTab('invalid-file.ts')
      tabBar.switchTab('invalid-file.ts') // Active tab is invalid

      expect(tabBar.activeTab).toBe('invalid-file.ts')
      expect(tabBar.getTabCount()).toBe(2)

      // Load files (invalid-file.ts doesn't exist)
      fileState.initializeFiles({
        'file1.ts': 'content1',
      })

      // Simulate validation: filter invalid tabs and switch active tab to first valid tab
      // In real implementation, this happens in TabBarContext's useEffect
      // First, get valid tabs (only tabs that exist in file state)
      const allTabInfo = tabBar.getAllTabInfo()
      const validTabs = allTabInfo.map((tab) => tab.path)

      // Verify we have valid tabs
      expect(validTabs).toEqual(['file1.ts'])

      // Close invalid tabs (simulating TabBarContext's validation logic)
      // When closing invalid-file.ts, closeTab will automatically switch activeTab
      // to the next available tab (file1.ts) since invalid-file.ts is the active tab
      const invalidTabs = tabBar.openTabs.filter((path) => !validTabs.includes(path))
      expect(invalidTabs).toEqual(['invalid-file.ts'])

      // Close the invalid tab - this should automatically switch activeTab to file1.ts
      tabBar.closeTab('invalid-file.ts')

      // Verify active tab is now valid and invalid tabs are closed
      // closeTab should have automatically switched to file1.ts since it was the active tab
      expect(tabBar.activeTab).toBe('file1.ts')
      expect(tabBar.getTabCount()).toBe(1)
      expect(tabBar.openTabs).toEqual(['file1.ts'])
    })

    it('should restore and validate tabs in correct order', async () => {
      // Simulate full async loading scenario

      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)

      // Step 1: Restore tabs from storage (files not loaded yet)
      const savedState = {
        openTabs: ['file1.ts', 'file2.ts', 'file3.ts'],
        activeTab: 'file2.ts',
      }

      savedState.openTabs.forEach((path) => {
        tabBar.openTab(path)
      })
      tabBar.switchTab(savedState.activeTab)

      // Verify tabs are restored
      expect(tabBar.getTabCount()).toBe(3)
      expect(tabBar.openTabs).toEqual(savedState.openTabs)
      expect(tabBar.activeTab).toBe(savedState.activeTab)

      // Step 2: Simulate async file loading (with delay)
      await new Promise((resolve) => setTimeout(resolve, 10))

      fileState.initializeFiles({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
        'file3.ts': 'content3',
      })

      // Step 3: After files are loaded, all tabs should be valid
      const allTabInfo = tabBar.getAllTabInfo()
      expect(allTabInfo).toHaveLength(3)
      expect(allTabInfo.map((tab) => tab.path)).toEqual(['file1.ts', 'file2.ts', 'file3.ts'])
      expect(tabBar.activeTab).toBe('file2.ts')

      // Step 4: Verify tab info is correct
      const activeTabInfo = tabBar.getTabInfo('file2.ts')
      expect(activeTabInfo).not.toBeNull()
      expect(activeTabInfo?.status).toBe(FileStatus.Unchanged)
    })
  })
})
