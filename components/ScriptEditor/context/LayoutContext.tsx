'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { layoutStorageService } from '../services/layoutStorage'

/**
 * Layout context value
 */
export interface LayoutContextValue {
  /** Left panel width */
  leftPanelWidth: number
  /** Right panel width */
  rightPanelWidth: number
  /** Right panel type: 'ai' | 'rules' | null */
  rightPanelType: 'ai' | 'rules' | null
  /** Set left panel width */
  setLeftPanelWidth: (width: number) => void
  /** Set right panel width */
  setRightPanelWidth: (width: number) => void
  /** Set right panel type */
  setRightPanelType: (type: 'ai' | 'rules' | null) => void
  /** Toggle right panel (if already open, close it; if closed, open with specified type) */
  toggleRightPanel: (type: 'ai' | 'rules') => void
  /** Check if right panel is open */
  isRightPanelOpen: () => boolean
}

/**
 * Layout context
 */
const LayoutContext = createContext<LayoutContextValue | null>(null)

/**
 * Layout provider props
 */
export interface LayoutProviderProps {
  /** Initial left panel width */
  initialLeftPanelWidth?: number
  /** Initial right panel width */
  initialRightPanelWidth?: number
  /** Initial right panel type */
  initialRightPanelType?: 'ai' | 'rules' | null
  /** Storage key for layout state */
  storageKey?: string
  /** Children */
  children: React.ReactNode
}

/**
 * Layout provider component
 * Manages editor layout state (panel sizes and open panels)
 * @param props Component props
 * @returns Provider component
 */
export function LayoutProvider({ initialLeftPanelWidth = 250, initialRightPanelWidth = 400, initialRightPanelType = null, storageKey, children }: LayoutProviderProps) {
  const [leftPanelWidth, setLeftPanelWidthState] = useState(initialLeftPanelWidth)
  const [rightPanelWidth, setRightPanelWidthState] = useState(initialRightPanelWidth)
  const [rightPanelType, setRightPanelTypeState] = useState<'ai' | 'rules' | null>(initialRightPanelType)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load layout state from IndexedDB on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsInitialized(true)
      return
    }

    let mounted = true

    layoutStorageService
      .loadLayoutState(storageKey)
      .then((state) => {
        if (!mounted) return

        if (state) {
          setLeftPanelWidthState(state.leftPanelWidth)
          setRightPanelWidthState(state.rightPanelWidth)
          setRightPanelTypeState(state.rightPanelType)
        } else {
          // If no state exists, save initial values to IndexedDB
          // This ensures the store is created and initial values are persisted
          layoutStorageService
            .saveLayoutState(
              {
                leftPanelWidth: initialLeftPanelWidth,
                rightPanelWidth: initialRightPanelWidth,
                rightPanelType: initialRightPanelType,
              },
              storageKey
            )
            .catch((error) => {
              // eslint-disable-next-line no-console
              console.error('[LayoutProvider] Failed to save initial layout state:', error)
            })
        }

        setIsInitialized(true)
      })
      .catch((error) => {
        if (!mounted) return
        // eslint-disable-next-line no-console
        console.error('[LayoutProvider] Failed to load layout state from IndexedDB:', error)
        setIsInitialized(true)
      })

    return () => {
      mounted = false
    }
  }, [storageKey, initialLeftPanelWidth, initialRightPanelWidth, initialRightPanelType])

  // Save layout state to IndexedDB when it changes
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') {
      return
    }

    // Debounce saves to avoid too frequent writes
    const timeoutId = setTimeout(() => {
      layoutStorageService.saveLayoutState({ leftPanelWidth, rightPanelWidth, rightPanelType }, storageKey).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[LayoutProvider] Failed to save layout state to IndexedDB:', error)
      })
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [leftPanelWidth, rightPanelWidth, rightPanelType, isInitialized, storageKey])

  /**
   * Set left panel width
   * @param width New width
   */
  const setLeftPanelWidth = useCallback((width: number) => {
    setLeftPanelWidthState(width)
  }, [])

  /**
   * Set right panel width
   * @param width New width
   */
  const setRightPanelWidth = useCallback((width: number) => {
    setRightPanelWidthState(width)
  }, [])

  /**
   * Set right panel type
   * @param type Panel type
   */
  const setRightPanelType = useCallback((type: 'ai' | 'rules' | null) => {
    setRightPanelTypeState(type)
  }, [])

  /**
   * Toggle right panel
   * If the panel is already open with the same type, close it
   * If the panel is closed or open with a different type, open it with the specified type
   * @param type Panel type to toggle
   */
  const toggleRightPanel = useCallback((type: 'ai' | 'rules') => {
    setRightPanelTypeState((prev) => (prev === type ? null : type))
  }, [])

  /**
   * Check if right panel is open
   * @returns True if right panel is open
   */
  const isRightPanelOpen = useCallback((): boolean => {
    return rightPanelType !== null
  }, [rightPanelType])

  const value = useMemo<LayoutContextValue>(
    () => ({
      leftPanelWidth,
      rightPanelWidth,
      rightPanelType,
      setLeftPanelWidth,
      setRightPanelWidth,
      setRightPanelType,
      toggleRightPanel,
      isRightPanelOpen,
    }),
    [leftPanelWidth, rightPanelWidth, rightPanelType, setLeftPanelWidth, setRightPanelWidth, setRightPanelType, toggleRightPanel, isRightPanelOpen]
  )

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

/**
 * Hook to use layout context
 * @returns Layout context value
 * @throws Error if used outside LayoutProvider
 */
export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider')
  }
  return context
}
