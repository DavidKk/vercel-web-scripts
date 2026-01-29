'use client'

import { FiDownloadCloud, FiFolder, FiPlus, FiX } from 'react-icons/fi'
import { TbFolderOff } from 'react-icons/tb'
import { VscSearch } from 'react-icons/vsc'

import { useLocalMap } from '@/components/ScriptEditor/context/LocalMapContext'
import { Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'

import type { FileListConfirmState } from './types'

export interface FileListPanelHeaderProps {
  /** Whether search bar is visible */
  isSearchOpen: boolean
  /** Toggle search bar visibility */
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** Search input value */
  searchQuery: string
  /** Set search query */
  setSearchQuery: (query: string) => void
  /** Ref for search input (focus when opened) */
  searchInputRef: React.RefObject<HTMLInputElement | null>
  /** Callback to clear local cache and reload from online */
  onResetToOnline?: () => void | Promise<void>
  /** Set confirm dialog state (e.g. reset to online) */
  setConfirmState: (state: FileListConfirmState) => void
  /** When true, reset/add actions are disabled */
  readOnly: boolean
  /** Whether reset-to-online is in progress */
  isResettingToOnline: boolean
  /** Callback when add-file is clicked (parent starts add flow) */
  onStartAdd: () => void
  /** Callback when new file is added (parent provides onAddFile) */
  onAddFile?: (filePath: string) => void
}

/**
 * File list panel header: title, local map, search, reset to online, add file, and search bar.
 */
export function FileListPanelHeader({
  isSearchOpen,
  setIsSearchOpen,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  onResetToOnline,
  setConfirmState,
  readOnly,
  isResettingToOnline,
  onStartAdd,
  onAddFile,
}: FileListPanelHeaderProps) {
  const localMap = useLocalMap()

  return (
    <>
      <div className="h-[33px] px-3 text-xs font-semibold text-[#cccccc] uppercase border-b border-[#2d2d2d] bg-[#1e1e1e] sticky top-0 z-10 flex items-center justify-between">
        Files
        <div className="flex items-center gap-1">
          {localMap?.isLocalMapSupported && (
            <>
              {!localMap.isLocalMapMode ? (
                <Tooltip content="Map editor to local folder (read-only)" placement="bottom">
                  <button
                    className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation()
                      localMap.onMapToLocal()
                    }}
                    disabled={localMap.isLocalMapBusy}
                  >
                    {localMap.isLocalMapBusy ? (
                      <span className="w-3.5 h-3.5 flex items-center justify-center">
                        <Spinner />
                      </span>
                    ) : (
                      <FiFolder className="w-3.5 h-3.5" />
                    )}
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content="Close local map" placement="bottom">
                  <button
                    className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation()
                      localMap.onCloseLocalMap()
                    }}
                    disabled={localMap.isLocalMapBusy}
                  >
                    {localMap.isLocalMapBusy ? (
                      <span className="w-3.5 h-3.5 flex items-center justify-center">
                        <Spinner />
                      </span>
                    ) : (
                      <TbFolderOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                </Tooltip>
              )}
            </>
          )}
          <Tooltip content="Search files (Cmd+F / Ctrl+F)" placement="bottom">
            <button
              className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setIsSearchOpen((prev: boolean) => !prev)
                if (!isSearchOpen) {
                  setSearchQuery('')
                }
              }}
            >
              <VscSearch className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          {onResetToOnline && (
            <Tooltip content="Clear local cache and reload from online" placement="bottom">
              <button
                className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmState({ open: true, type: 'resetToOnline' })
                }}
                disabled={readOnly || isResettingToOnline}
              >
                {isResettingToOnline ? (
                  <span className="w-3.5 h-3.5 flex items-center justify-center">
                    <Spinner />
                  </span>
                ) : (
                  <FiDownloadCloud className="w-3.5 h-3.5" />
                )}
              </button>
            </Tooltip>
          )}
          {onAddFile && (
            <Tooltip content="Add file" placement="bottom">
              <button
                className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={(e) => {
                  e.stopPropagation()
                  onStartAdd()
                }}
                disabled={readOnly}
              >
                <FiPlus className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {isSearchOpen && (
        <div className="px-3 py-2 border-b border-[#2d2d2d] bg-[#1e1e1e] sticky top-[33px] z-10">
          <div className="relative flex items-center">
            <VscSearch className="absolute left-2 w-3.5 h-3.5 text-[#858585]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-7 pr-7 py-1.5 text-sm bg-[#1e1e1e] border border-[#2d2d2d] rounded text-[#cccccc] placeholder-[#858585] focus:outline-none focus:border-[#007acc]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 p-0.5 hover:bg-[#3e3e42] rounded text-[#858585] hover:text-white transition-colors"
                title="Clear search"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
