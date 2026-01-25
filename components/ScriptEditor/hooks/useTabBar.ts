'use client'

import { useCallback } from 'react'

import { useFileState } from '../context/FileStateContext'
import { type TabInfo, useTabBar as useTabBarContext } from '../context/TabBarContext'

/**
 * Hook for tab bar operations
 * Provides convenient methods to interact with tab bar and file state
 * @returns Tab bar operations and state
 */
export function useTabBar() {
  const tabBar = useTabBarContext()
  const fileState = useFileState()

  /**
   * Get current active tab information
   * @returns Current active tab info or null
   */
  const getActiveTabInfo = useCallback((): TabInfo | null => {
    if (!tabBar.activeTab) {
      return null
    }
    return tabBar.getTabInfo(tabBar.activeTab)
  }, [tabBar])

  /**
   * Get current active file content
   * @returns Current active file content or empty string
   */
  const getActiveFileContent = useCallback((): string => {
    if (!tabBar.activeTab) {
      return ''
    }
    const file = fileState.getFile(tabBar.activeTab)
    return file?.content.modifiedContent || ''
  }, [tabBar.activeTab, fileState])

  /**
   * Update current active file content
   * @param content New content
   */
  const updateActiveFileContent = useCallback(
    (content: string) => {
      if (tabBar.activeTab) {
        fileState.updateFile(tabBar.activeTab, content)
      }
    },
    [tabBar.activeTab, fileState]
  )

  /**
   * Save current active file
   */
  const saveActiveFile = useCallback(async () => {
    if (tabBar.activeTab) {
      // This would typically call a save service
      // For now, just mark as saved
      fileState.markFileAsSaved(tabBar.activeTab)
    }
  }, [tabBar.activeTab, fileState])

  /**
   * Check if current active file has unsaved changes
   * @returns True if active file has unsaved changes
   */
  const hasActiveFileUnsavedChanges = useCallback((): boolean => {
    if (!tabBar.activeTab) {
      return false
    }
    return fileState.hasUnsavedChanges(tabBar.activeTab)
  }, [tabBar.activeTab, fileState])

  /**
   * Get file status for a tab
   * @param path File path
   * @returns File status or undefined
   */
  const getTabFileStatus = useCallback(
    (path: string) => {
      return fileState.getFileStatus(path)
    },
    [fileState]
  )

  /**
   * Open tab and switch to it
   * @param path File path
   */
  const openAndSwitchTab = useCallback(
    (path: string) => {
      tabBar.openTab(path)
    },
    [tabBar]
  )

  /**
   * Close tab and switch to next available tab
   * @param path File path
   */
  const closeTabAndSwitch = useCallback(
    (path: string) => {
      tabBar.closeTab(path)
    },
    [tabBar]
  )

  /**
   * Get all open tabs with their file information
   * @returns Array of tab information
   */
  const getAllTabsWithInfo = useCallback((): TabInfo[] => {
    return tabBar.getAllTabInfo()
  }, [tabBar])

  /**
   * Check if any tab has unsaved changes
   * @returns True if any tab has unsaved changes
   */
  const hasAnyTabUnsavedChanges = useCallback((): boolean => {
    return tabBar.getAllTabInfo().some((tab) => tab.hasUnsavedChanges)
  }, [tabBar])

  /**
   * Get tabs with unsaved changes
   * @returns Array of tab paths with unsaved changes
   */
  const getTabsWithUnsavedChanges = useCallback((): string[] => {
    return tabBar
      .getAllTabInfo()
      .filter((tab) => tab.hasUnsavedChanges)
      .map((tab) => tab.path)
  }, [tabBar])

  return {
    // Tab bar state
    /** List of open tabs (file paths) */
    openTabs: tabBar.openTabs,
    /** Currently active tab path */
    activeTab: tabBar.activeTab,
    /** Number of open tabs */
    tabCount: tabBar.getTabCount(),

    // Tab information
    /** Get tab information by path */
    getTabInfo: tabBar.getTabInfo,
    /** Get all tab information */
    getAllTabInfo: tabBar.getAllTabInfo,
    /** Get current active tab information */
    getActiveTabInfo,
    /** Get all tabs with their file information */
    getAllTabsWithInfo,

    // File content operations
    /** Get current active file content */
    getActiveFileContent,
    /** Update current active file content */
    updateActiveFileContent,

    // Tab operations
    /** Open a tab */
    openTab: tabBar.openTab,
    /** Open tab and switch to it */
    openAndSwitchTab,
    /** Close a tab */
    closeTab: tabBar.closeTab,
    /** Close tab and switch to next */
    closeTabAndSwitch,
    /** Switch to a tab */
    switchTab: tabBar.switchTab,
    /** Close all tabs */
    closeAllTabs: tabBar.closeAllTabs,
    /** Close other tabs */
    closeOtherTabs: tabBar.closeOtherTabs,
    /** Close tabs to the right */
    closeTabsToRight: tabBar.closeTabsToRight,
    /** Check if a tab is open */
    isTabOpen: tabBar.isTabOpen,

    // File status operations
    /** Get file status for a tab */
    getTabFileStatus,
    /** Check if current active file has unsaved changes */
    hasActiveFileUnsavedChanges,
    /** Check if any tab has unsaved changes */
    hasAnyTabUnsavedChanges,
    /** Get tabs with unsaved changes */
    getTabsWithUnsavedChanges,
    /** Save current active file */
    saveActiveFile,
  }
}
