'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'

import { useTabBar } from '../../hooks/useTabBar'
import { getFileIcon, getFileStatusIndicator } from '../FileListPanel/utils'

/**
 * Tab bar component props
 */
export interface TabBarProps {
  /** Callback when a tab is clicked */
  onTabClick?: (path: string) => void
  /** Callback when a tab is closed */
  onTabClose?: (path: string) => void
}

/**
 * Get file name from path
 * @param path File path
 * @returns File name
 */
function getFileName(path: string): string {
  return path.split('/').pop() || path
}

/**
 * Tab bar component for ScriptEditor
 * Displays open files as tabs with ability to switch and close
 */
export default function TabBar({ onTabClick, onTabClose }: TabBarProps) {
  const tabBar = useTabBar()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Handle outside click to close context menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /**
   * Handle context menu
   * @param e Mouse event
   * @param path File path
   */
  function handleContextMenu(e: React.MouseEvent, path: string) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, path })
  }

  /**
   * Handle tab click
   * @param path File path
   */
  function handleTabClick(path: string) {
    tabBar.switchTab(path)
    onTabClick?.(path)
  }

  /**
   * Handle tab close
   * @param path File path
   * @param e Mouse event
   */
  function handleTabClose(path: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    tabBar.closeTab(path)
    onTabClose?.(path)
  }

  /**
   * Handle close current tab
   */
  function handleCloseCurrent() {
    if (contextMenu?.path) {
      handleTabClose(contextMenu.path)
      setContextMenu(null)
    }
  }

  /**
   * Handle close tabs to the right
   */
  function handleCloseTabsToRight() {
    if (contextMenu?.path) {
      tabBar.closeTabsToRight(contextMenu.path)
      setContextMenu(null)
    }
  }

  /**
   * Handle close other tabs
   */
  function handleCloseOtherTabs() {
    if (contextMenu?.path) {
      tabBar.closeOtherTabs(contextMenu.path)
      setContextMenu(null)
    }
  }

  /**
   * Handle close all tabs
   */
  function handleCloseAllTabs() {
    tabBar.closeAllTabs()
    setContextMenu(null)
  }

  // Get all tab information
  const tabInfos = useMemo(() => tabBar.getAllTabInfo(), [tabBar])

  if (tabInfos.length === 0) {
    return null
  }

  return (
    <>
      <div
        ref={scrollContainerRef}
        className="h-[33px] bg-[#2d2d2d] border-b border-[#2d2d2d] flex items-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {tabInfos.map((tab) => {
          const isActive = tab.path === tabBar.activeTab
          const fileName = getFileName(tab.path)
          const statusIndicator = tab.status !== undefined ? getFileStatusIndicator(tab.status) : null

          return (
            <div
              key={tab.path}
              className={`
                group flex items-center gap-1.5 px-3 py-1.5 h-full cursor-pointer
                border-r border-[#2d2d2d] min-w-[120px] max-w-[200px]
                transition-colors duration-150
                ${isActive ? 'bg-[#1e1e1e] text-white' : 'bg-[#2d2d2d] text-[#cccccc] hover:bg-[#37373d]'}
              `}
              onClick={() => handleTabClick(tab.path)}
              onContextMenu={(e) => handleContextMenu(e, tab.path)}
              title={tab.path}
            >
              {/* File icon */}
              <span className="flex-shrink-0">{getFileIcon(fileName)}</span>

              {/* File name */}
              <span className="text-xs flex-1 truncate">{fileName}</span>

              {/* State indicator or close button */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* File status indicator */}
                {statusIndicator && <div className="flex-shrink-0 flex items-center">{statusIndicator}</div>}

                {/* Close button */}
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-all duration-150"
                  onClick={(e) => handleTabClose(tab.path, e)}
                  title="Close tab"
                >
                  <FiX className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed bg-[#252526] shadow-xl border border-[#3a3a3a] py-1 z-[100] min-w-[120px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors" onClick={handleCloseCurrent}>
            Close
          </button>
          <button className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors" onClick={handleCloseTabsToRight}>
            Close Tabs to the Right
          </button>
          <button className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors" onClick={handleCloseOtherTabs}>
            Close Others
          </button>
          <button className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#ce3c3c] hover:text-white transition-colors" onClick={handleCloseAllTabs}>
            Close All
          </button>
        </div>
      )}
    </>
  )
}
