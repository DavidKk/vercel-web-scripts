'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { tabBarStorageService } from '../services/tabBarStorage'
import { FileStatus } from '../types'
import { useFileState } from './FileStateContext'

/**
 * Tab information
 */
export interface TabInfo {
  /** File path */
  path: string
  /** File name (extracted from path) */
  name: string
  /** File status */
  status: FileStatus | undefined
  /** Whether file has unsaved changes */
  hasUnsavedChanges: boolean
  /** Whether this tab is a replaceable preview tab */
  isPreview: boolean
}

export interface OpenTabOptions {
  /** Whether this open should reuse the current clean preview tab */
  preview?: boolean
}

/**
 * Tab bar context value
 */
export interface TabBarContextValue {
  /** List of open tabs (file paths) */
  openTabs: string[]
  /** Currently active tab path */
  activeTab: string | null
  /** Get tab information by path */
  getTabInfo: (path: string) => TabInfo | null
  /** Get all tab information */
  getAllTabInfo: () => TabInfo[]
  /** Open a tab (add to list if not already open) */
  openTab: (path: string, options?: OpenTabOptions) => void
  /** Close a tab */
  closeTab: (path: string) => void
  /** Switch to a tab (set as active) */
  switchTab: (path: string) => void
  /** Close all tabs */
  closeAllTabs: () => void
  /** Close other tabs (keep only the specified tab) */
  closeOtherTabs: (path: string) => void
  /** Close tabs to the right */
  closeTabsToRight: (path: string) => void
  /** Get number of open tabs */
  getTabCount: () => number
  /** Check if a tab is open */
  isTabOpen: (path: string) => boolean
}

/**
 * Tab bar context
 */
const TabBarContext = createContext<TabBarContextValue | null>(null)

/**
 * Tab bar provider props
 */
export interface TabBarProviderProps {
  /** Children */
  children: React.ReactNode
}

/**
 * Tab bar provider component
 * Manages open tabs and active tab state
 * @param props Component props
 * @returns Provider component
 */
export function TabBarProvider({ children }: TabBarProviderProps) {
  const fileState = useFileState()
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [previewTab, setPreviewTab] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const hasValidatedTabsRef = useRef(false)

  // Load tab bar state from IndexedDB on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsInitialized(true)
      return
    }

    let mounted = true

    tabBarStorageService
      .loadTabBarState()
      .then((state) => {
        if (!mounted) return

        if (state && state.openTabs.length > 0) {
          // First, restore all tabs (don't filter yet, files may not be loaded)
          // We'll validate them later when file state is ready
          setOpenTabs(state.openTabs)
          setActiveTab(state.activeTab || state.openTabs[0] || null)
        }

        setIsInitialized(true)
      })
      .catch((error) => {
        if (!mounted) return
        // eslint-disable-next-line no-console
        console.error('[TabBarProvider] Failed to load tab bar state from IndexedDB:', error)
        setIsInitialized(true)
      })

    return () => {
      mounted = false
    }
  }, []) // Only run once on mount

  // Validate and filter tabs when file state changes (after files are loaded)
  // This effect runs when fileState.files changes, which happens when files are loaded
  useEffect(() => {
    if (!isInitialized || openTabs.length === 0 || hasValidatedTabsRef.current) {
      return
    }

    // Check if files are loaded (at least some files exist)
    // This could be from IndexedDB or initialFiles
    const hasFiles = Object.keys(fileState.files).length > 0
    if (!hasFiles) {
      // Files not loaded yet, wait for fileState.files to be populated
      return
    }

    // Mark as validated to avoid re-running
    hasValidatedTabsRef.current = true

    // Filter out tabs for files that no longer exist or are deleted
    setOpenTabs((prevTabs) => {
      const validTabs = prevTabs.filter((path) => {
        const file = fileState.getFile(path)
        return file && file.status !== FileStatus.Deleted
      })

      if (validTabs.length > 0) {
        // Update active tab if it's no longer valid
        setActiveTab((prevActive) => {
          if (prevActive && !validTabs.includes(prevActive)) {
            return validTabs[0] || null
          }
          return prevActive
        })
        setPreviewTab((prevPreview) => (prevPreview && validTabs.includes(prevPreview) ? prevPreview : null))
        return validTabs
      } else {
        // All tabs are invalid, clear them
        setActiveTab(null)
        setPreviewTab(null)
        return []
      }
    })
  }, [fileState.files, isInitialized, fileState])

  // Save tab bar state to IndexedDB when it changes
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') {
      return
    }

    // Debounce saves to avoid too frequent writes
    const timeoutId = setTimeout(() => {
      tabBarStorageService.saveTabBarState(openTabs, activeTab).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[TabBarProvider] Failed to save tab bar state to IndexedDB:', error)
      })
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [openTabs, activeTab, isInitialized])

  /**
   * Get tab information by path
   * @param path File path
   * @returns Tab information or null
   */
  const getTabInfo = useCallback(
    (path: string): TabInfo | null => {
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
        isPreview: previewTab === path,
      }
    },
    [fileState, previewTab]
  )

  /**
   * Get all tab information
   * @returns Array of tab information
   */
  const getAllTabInfo = useCallback((): TabInfo[] => {
    return openTabs
      .map((path) => getTabInfo(path))
      .filter((tab): tab is TabInfo => tab !== null)
      .filter((tab) => tab.status !== FileStatus.Deleted)
  }, [openTabs, getTabInfo])

  /**
   * Open a tab (add to list if not already open)
   * @param path File path
   * @param options Optional open behavior
   */
  const openTab = useCallback(
    (path: string, options?: OpenTabOptions) => {
      const preview = options?.preview === true

      setOpenTabs((prev) => {
        if (prev.includes(path)) {
          if (!preview && previewTab === path) {
            setPreviewTab(null)
          }
          return prev
        }

        if (preview && previewTab) {
          const currentPreviewFile = fileState.getFile(previewTab)
          const canReplacePreview = prev.includes(previewTab) && currentPreviewFile && currentPreviewFile.status !== FileStatus.Deleted && !fileState.hasUnsavedChanges(previewTab)

          if (canReplacePreview) {
            setPreviewTab(path)
            return prev.map((tab) => (tab === previewTab ? path : tab))
          }
        }

        if (preview) {
          setPreviewTab(path)
        } else if (previewTab === path) {
          setPreviewTab(null)
        }

        return [...prev, path]
      })
      setActiveTab(path)
    },
    [fileState, previewTab]
  )

  /**
   * Close a tab
   * @param path File path
   */
  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const newTabs = prev.filter((tab) => tab !== path)
        // If closing the active tab, switch to the next available tab
        if (path === activeTab) {
          const currentIndex = prev.indexOf(path)
          if (newTabs.length > 0) {
            // Switch to the tab to the right, or if at the end, switch to the tab to the left
            const nextIndex = currentIndex < newTabs.length ? currentIndex : currentIndex - 1
            setActiveTab(newTabs[nextIndex] || null)
          } else {
            setActiveTab(null)
          }
        }
        if (path === previewTab) {
          setPreviewTab(null)
        }
        return newTabs
      })
    },
    [activeTab, previewTab]
  )

  /**
   * Switch to a tab (set as active)
   * @param path File path
   */
  const switchTab = useCallback(
    (path: string) => {
      // If tab is not open, open it first
      if (!openTabs.includes(path)) {
        openTab(path)
      } else {
        setActiveTab(path)
        if (previewTab === path) {
          setPreviewTab(null)
        }
      }
    },
    [openTabs, openTab, previewTab]
  )

  /**
   * Close all tabs
   */
  const closeAllTabs = useCallback(() => {
    setOpenTabs([])
    setActiveTab(null)
    setPreviewTab(null)
  }, [])

  /**
   * Close other tabs (keep only the specified tab)
   * @param path File path to keep
   */
  const closeOtherTabs = useCallback((path: string) => {
    setOpenTabs([path])
    setActiveTab(path)
    setPreviewTab((current) => (current === path ? current : null))
  }, [])

  /**
   * Close tabs to the right
   * @param path File path (close all tabs to the right of this one)
   */
  const closeTabsToRight = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const currentIndex = prev.indexOf(path)
        if (currentIndex === -1) {
          return prev
        }
        const newTabs = prev.slice(0, currentIndex + 1)
        // If active tab was closed, switch to the last remaining tab
        if (activeTab && !newTabs.includes(activeTab)) {
          setActiveTab(newTabs[newTabs.length - 1] || null)
        }
        if (previewTab && !newTabs.includes(previewTab)) {
          setPreviewTab(null)
        }
        return newTabs
      })
    },
    [activeTab, previewTab]
  )

  /**
   * Get number of open tabs
   * @returns Number of open tabs
   */
  const getTabCount = useCallback((): number => {
    return openTabs.length
  }, [openTabs])

  /**
   * Check if a tab is open
   * @param path File path
   * @returns True if tab is open
   */
  const isTabOpen = useCallback(
    (path: string): boolean => {
      return openTabs.includes(path)
    },
    [openTabs]
  )

  const value = useMemo<TabBarContextValue>(
    () => ({
      openTabs,
      activeTab,
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
    }),
    [openTabs, activeTab, getTabInfo, getAllTabInfo, openTab, closeTab, switchTab, closeAllTabs, closeOtherTabs, closeTabsToRight, getTabCount, isTabOpen]
  )

  return <TabBarContext.Provider value={value}>{children}</TabBarContext.Provider>
}

/**
 * Hook to use tab bar context
 * @returns Tab bar context value
 * @throws Error if used outside TabBarProvider
 */
export function useTabBar(): TabBarContextValue {
  const context = useContext(TabBarContext)
  if (!context) {
    throw new Error('useTabBar must be used within TabBarProvider')
  }
  return context
}
