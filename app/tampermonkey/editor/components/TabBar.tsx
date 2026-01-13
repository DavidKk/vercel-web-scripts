'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'
import { TbBrandTypescript } from 'react-icons/tb'
import { VscJson } from 'react-icons/vsc'

interface Tab {
  path: string
  name: string
}

interface TabBarProps {
  /** List of open file tabs */
  tabs: Tab[]
  /** Currently active tab path */
  activeTab: string | null
  /** Callback when a tab is clicked */
  onTabClick: (path: string) => void
  /** Callback when a tab is closed */
  onTabClose: (path: string, event: React.MouseEvent) => void
  /** Callback to close tabs to the right - receives array of file paths to close */
  onCloseTabsToRight?: (filePaths: string[]) => void
  /** Callback to close other tabs */
  onCloseOtherTabs?: (path: string) => void
  /** Get file state for indicator */
  getFileState?: (filePath: string) => 'synced' | 'local' | 'unsaved'
  /** Check if file has error */
  hasError?: (filePath: string) => boolean
}

/**
 * Get file icon based on extension
 * @param fileName File name
 * @returns React node representing the file icon
 */
function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, React.ReactNode> = {
    ts: <TbBrandTypescript className="w-3.5 h-3.5 text-[#3178c6]" />,
    tsx: '⚛️',
    js: '📜',
    jsx: '⚛️',
    json: <VscJson className="w-3.5 h-3.5 text-[#cbcb41]" />,
    css: '🎨',
    html: '🌐',
    md: '📝',
  }
  return iconMap[ext || ''] || '📄'
}

/**
 * Extract file name from path
 * @param path File path
 * @returns File name
 */
function getFileName(path: string): string {
  return path.split('/').pop() || path
}

/**
 * Tab bar component for editor, similar to VS Code
 * Displays open files as tabs with ability to switch and close
 */
export default function TabBar({ tabs, activeTab, onTabClick, onTabClose, onCloseTabsToRight, onCloseOtherTabs, getFileState, hasError }: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Use tabs as-is, maintain opening order (no sorting)
  // VS Code behavior: tabs maintain their opening order, active tab is just highlighted
  const sortedTabs = useMemo(() => {
    return tabs
  }, [tabs])

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
   * Handle close current tab
   */
  function handleCloseCurrent() {
    if (contextMenu?.path) {
      const syntheticEvent = new MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as React.MouseEvent
      onTabClose(contextMenu.path, syntheticEvent)
      setContextMenu(null)
    }
  }

  /**
   * Handle close tabs to the right
   * Calculate which tabs are to the right based on sortedTabs order
   */
  function handleCloseTabsToRight() {
    if (contextMenu?.path && onCloseTabsToRight) {
      const currentIndex = sortedTabs.findIndex((tab) => tab.path === contextMenu.path)
      if (currentIndex >= 0 && currentIndex < sortedTabs.length - 1) {
        // Get all tabs to the right of the current tab
        const tabsToRight = sortedTabs.slice(currentIndex + 1).map((tab) => tab.path)
        onCloseTabsToRight(tabsToRight)
      }
      setContextMenu(null)
    }
  }

  /**
   * Handle close other tabs
   */
  function handleCloseOtherTabs() {
    if (contextMenu?.path && onCloseOtherTabs) {
      onCloseOtherTabs(contextMenu.path)
      setContextMenu(null)
    }
  }

  // Check if there are tabs to the right of the context menu tab
  const hasTabsToRight = useMemo(() => {
    if (!contextMenu) return false
    const currentIndex = sortedTabs.findIndex((tab) => tab.path === contextMenu.path)
    return currentIndex >= 0 && currentIndex < sortedTabs.length - 1
  }, [contextMenu, sortedTabs])

  if (tabs.length === 0) {
    return null
  }

  return (
    <>
      <div className="h-[33px] bg-[#2d2d2d] border-b border-[#2d2d2d] flex items-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {sortedTabs.map((tab) => {
          const isActive = tab.path === activeTab
          const fileName = getFileName(tab.path)
          const state = getFileState?.(tab.path)
          const fileHasError = hasError?.(tab.path) ?? false

          return (
            <div
              key={tab.path}
              className={`
                group flex items-center gap-1.5 px-3 py-1.5 h-full cursor-pointer
                border-r border-[#2d2d2d] min-w-[120px] max-w-[200px]
                transition-colors duration-150
                ${isActive ? 'bg-[#1e1e1e] text-white' : 'bg-[#2d2d2d] text-[#cccccc] hover:bg-[#37373d]'}
              `}
              onClick={() => onTabClick(tab.path)}
              onContextMenu={(e) => handleContextMenu(e, tab.path)}
              title={tab.path}
            >
              {/* File icon */}
              <span className="flex-shrink-0">{getFileIcon(fileName)}</span>

              {/* File name */}
              <span className={`text-xs flex-1 truncate ${fileHasError ? 'text-red-400' : ''}`}>{fileName}</span>

              {/* State indicator or close button */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* State indicator */}
                {state === 'unsaved' && <span className="w-1.5 h-1.5 rounded-full bg-[#007acc]" title="Unsaved changes" />}
                {state === 'local' && <span className="w-1.5 h-1.5 rounded-full bg-[#ff9900]" title="Saved to local storage" />}
                {fileHasError && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Error" />}

                {/* Close button */}
                <button
                  className={`
                    opacity-0 group-hover:opacity-100 p-0.5 rounded
                    hover:bg-[#3e3e42] transition-all duration-150
                    ${isActive ? 'opacity-100' : ''}
                  `}
                  onClick={(e) => {
                    e.stopPropagation()
                    onTabClose(tab.path, e)
                  }}
                  title="Close"
                >
                  <FiX className="w-3 h-3 text-[#cccccc] hover:text-white" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed bg-[#252526] shadow-xl border border-[#3a3a3a] py-1 z-[100] min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors" onClick={handleCloseCurrent}>
            Close
          </button>
          {hasTabsToRight && (
            <button className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors" onClick={handleCloseTabsToRight}>
              Close Tabs to the Right
            </button>
          )}
          {tabs.length > 1 && (
            <button className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors" onClick={handleCloseOtherTabs}>
              Close Others
            </button>
          )}
        </div>
      )}
    </>
  )
}
