import { FileStatus } from '@/components/ScriptEditor/types'

import { createFileStateProvider } from '../context/FileStateContext.spec'
import { createTabBarProvider } from '../context/TabBarContext.spec'

/**
 * Helper to create useTabBar hook simulation
 */
function createUseTabBar(fileState: ReturnType<typeof createFileStateProvider>, tabBar: ReturnType<typeof createTabBarProvider>) {
  const getActiveTabInfo = () => {
    if (!tabBar.activeTab) {
      return null
    }
    return tabBar.getTabInfo(tabBar.activeTab)
  }

  const getActiveFileContent = () => {
    if (!tabBar.activeTab) {
      return ''
    }
    const file = fileState.getFile(tabBar.activeTab)
    return file?.content.modifiedContent || ''
  }

  const updateActiveFileContent = (content: string) => {
    if (tabBar.activeTab) {
      fileState.updateFile(tabBar.activeTab, content)
    }
  }

  const saveActiveFile = async () => {
    if (tabBar.activeTab) {
      fileState.markFileAsSaved(tabBar.activeTab)
    }
  }

  const hasActiveFileUnsavedChanges = () => {
    if (!tabBar.activeTab) {
      return false
    }
    return fileState.hasUnsavedChanges(tabBar.activeTab)
  }

  const getTabFileStatus = (path: string) => {
    return fileState.getFileStatus(path)
  }

  const openAndSwitchTab = (path: string) => {
    tabBar.openTab(path)
  }

  const closeTabAndSwitch = (path: string) => {
    tabBar.closeTab(path)
  }

  const getAllTabsWithInfo = () => {
    return tabBar.getAllTabInfo()
  }

  const hasAnyTabUnsavedChanges = () => {
    return tabBar.getAllTabInfo().some((tab) => tab.hasUnsavedChanges)
  }

  const getTabsWithUnsavedChanges = () => {
    return tabBar
      .getAllTabInfo()
      .filter((tab) => tab.hasUnsavedChanges)
      .map((tab) => tab.path)
  }

  return {
    get openTabs() {
      return tabBar.openTabs
    },
    get activeTab() {
      return tabBar.activeTab
    },
    get tabCount() {
      return tabBar.getTabCount()
    },
    getTabInfo: tabBar.getTabInfo,
    getAllTabInfo: tabBar.getAllTabInfo,
    getActiveTabInfo,
    getAllTabsWithInfo,
    getActiveFileContent,
    updateActiveFileContent,
    openTab: tabBar.openTab,
    openAndSwitchTab,
    closeTab: tabBar.closeTab,
    closeTabAndSwitch,
    switchTab: tabBar.switchTab,
    closeAllTabs: tabBar.closeAllTabs,
    closeOtherTabs: tabBar.closeOtherTabs,
    closeTabsToRight: tabBar.closeTabsToRight,
    isTabOpen: tabBar.isTabOpen,
    getTabFileStatus,
    hasActiveFileUnsavedChanges,
    hasAnyTabUnsavedChanges,
    getTabsWithUnsavedChanges,
    saveActiveFile,
  }
}

describe('useTabBar', () => {
  describe('getActiveTabInfo', () => {
    it('should return active tab info when a tab is active', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      const activeTabInfo = useTabBar.getActiveTabInfo()

      expect(activeTabInfo).toBeDefined()
      expect(activeTabInfo?.path).toBe('file1.ts')
      expect(activeTabInfo?.name).toBe('file1.ts')
    })

    it('should return null when no tab is active', () => {
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      const activeTabInfo = useTabBar.getActiveTabInfo()

      expect(activeTabInfo).toBeNull()
    })
  })

  describe('getActiveFileContent', () => {
    it('should return active file content', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      const content = useTabBar.getActiveFileContent()

      expect(content).toBe('content1')
    })

    it('should return empty string when no tab is active', () => {
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      const content = useTabBar.getActiveFileContent()

      expect(content).toBe('')
    })

    it('should return modified content after update', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      useTabBar.updateActiveFileContent('modified')
      const content = useTabBar.getActiveFileContent()

      expect(content).toBe('modified')
    })
  })

  describe('updateActiveFileContent', () => {
    it('should update active file content', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      useTabBar.updateActiveFileContent('modified')

      const file = fileState.getFile('file1.ts')
      expect(file?.content.modifiedContent).toBe('modified')
      expect(file?.status).toBe(FileStatus.ModifiedUnsaved)
    })

    it('should not update if no tab is active', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      useTabBar.updateActiveFileContent('modified')

      const file = fileState.getFile('file1.ts')
      expect(file?.content.modifiedContent).toBe('original')
    })
  })

  describe('saveActiveFile', () => {
    it('should mark active file as saved', async () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      fileState.updateFile('file1.ts', 'modified')
      await useTabBar.saveActiveFile()

      const file = fileState.getFile('file1.ts')
      expect(file?.status).toBe(FileStatus.ModifiedSaved)
    })

    it('should not save if no tab is active', async () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      await useTabBar.saveActiveFile()

      // Should not throw or cause errors
      expect(true).toBe(true)
    })
  })

  describe('hasActiveFileUnsavedChanges', () => {
    it('should return true when active file has unsaved changes', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      fileState.updateFile('file1.ts', 'modified')

      expect(useTabBar.hasActiveFileUnsavedChanges()).toBe(true)
    })

    it('should return false when active file has no unsaved changes', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')

      expect(useTabBar.hasActiveFileUnsavedChanges()).toBe(false)
    })

    it('should return false when no tab is active', () => {
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      expect(useTabBar.hasActiveFileUnsavedChanges()).toBe(false)
    })
  })

  describe('getTabFileStatus', () => {
    it('should return file status for a tab', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      const status = useTabBar.getTabFileStatus('file1.ts')

      expect(status).toBe(FileStatus.Unchanged)
    })

    it('should return undefined for non-existent file', () => {
      const fileState = createFileStateProvider()
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      const status = useTabBar.getTabFileStatus('nonexistent.ts')

      expect(status).toBeUndefined()
    })
  })

  describe('openAndSwitchTab', () => {
    it('should open and switch to a tab', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      useTabBar.openAndSwitchTab('file1.ts')

      expect(tabBar.isTabOpen('file1.ts')).toBe(true)
      expect(tabBar.activeTab).toBe('file1.ts')
    })
  })

  describe('closeTabAndSwitch', () => {
    it('should close tab and switch to next', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      useTabBar.closeTabAndSwitch('file2.ts')

      expect(tabBar.isTabOpen('file2.ts')).toBe(false)
      expect(tabBar.activeTab).toBe('file1.ts')
    })
  })

  describe('getAllTabsWithInfo', () => {
    it('should return all tabs with their information', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')

      const allTabs = useTabBar.getAllTabsWithInfo()

      expect(allTabs).toHaveLength(2)
      expect(allTabs.map((tab) => tab.path)).toEqual(['file1.ts', 'file2.ts'])
    })
  })

  describe('hasAnyTabUnsavedChanges', () => {
    it('should return true when any tab has unsaved changes', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'original1',
        'file2.ts': 'original2',
      })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      fileState.updateFile('file1.ts', 'modified1')

      expect(useTabBar.hasAnyTabUnsavedChanges()).toBe(true)
    })

    it('should return false when no tabs have unsaved changes', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')

      expect(useTabBar.hasAnyTabUnsavedChanges()).toBe(false)
    })
  })

  describe('getTabsWithUnsavedChanges', () => {
    it('should return paths of tabs with unsaved changes', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'original1',
        'file2.ts': 'original2',
        'file3.ts': 'original3',
      })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')
      tabBar.openTab('file3.ts')
      fileState.updateFile('file1.ts', 'modified1')
      fileState.updateFile('file3.ts', 'modified3')

      const unsavedTabs = useTabBar.getTabsWithUnsavedChanges()

      expect(unsavedTabs).toHaveLength(2)
      expect(unsavedTabs).toContain('file1.ts')
      expect(unsavedTabs).toContain('file3.ts')
      expect(unsavedTabs).not.toContain('file2.ts')
    })

    it('should return empty array when no tabs have unsaved changes', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      tabBar.openTab('file1.ts')
      tabBar.openTab('file2.ts')

      const unsavedTabs = useTabBar.getTabsWithUnsavedChanges()

      expect(unsavedTabs).toHaveLength(0)
    })
  })

  describe('tabCount', () => {
    it('should return the number of open tabs', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      const tabBar = createTabBarProvider(fileState)
      const useTabBar = createUseTabBar(fileState, tabBar)

      expect(useTabBar.tabCount).toBe(0)

      tabBar.openTab('file1.ts')
      expect(useTabBar.tabCount).toBe(1)

      tabBar.openTab('file2.ts')
      expect(useTabBar.tabCount).toBe(2)
    })
  })
})
