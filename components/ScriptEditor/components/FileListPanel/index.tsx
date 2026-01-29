'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { VscFileCode, VscFolder, VscSearch } from 'react-icons/vsc'

import { useFileState } from '@/components/ScriptEditor/context/FileStateContext'
import { FileStatus } from '@/components/ScriptEditor/types'
import { Spinner } from '@/components/Spinner'

import { FileListConfirmDialogs } from './FileListConfirmDialogs'
import { FileListContextMenu } from './FileListContextMenu'
import { FileListPanelHeader } from './FileListPanelHeader'
import { buildFileTree, findNodeByPath } from './fileTree'
import { FileTreeNode } from './FileTreeNode'
import type { FileListConfirmState, FileListContextMenuState, FileListPanelProps } from './types'
import { FILE_LIST_ROW } from './types'
import { isMacOS } from './utils'

export type { FileListPanelProps } from './types'

/**
 * File list panel component
 */
export default function FileListPanel({
  selectedFile,
  onSelectFile,
  onDeleteFile,
  onAddFile,
  onRenameFile,
  isLoading = false,
  onResetToOnline,
  readOnly = false,
}: FileListPanelProps) {
  const fileState = useFileState()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [contextMenu, setContextMenu] = useState<FileListContextMenuState | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isResettingToOnline, setIsResettingToOnline] = useState(false)
  const [confirmState, setConfirmState] = useState<FileListConfirmState>({ open: false })
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Get all file paths from context
  const filePaths = useMemo(() => {
    return Object.keys(fileState.files).filter((path) => {
      const file = fileState.getFile(path)
      // Filter out deleted files from the list
      return file && file.status !== FileStatus.Deleted
    })
  }, [fileState.files, fileState])

  const root = useMemo(() => buildFileTree(filePaths), [filePaths])
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLDivElement>(null)
  const fileTreePanelRef = useRef<HTMLDivElement>(null)

  // Filter files based on search query
  const filteredRoot = useMemo(() => {
    if (!searchQuery.trim()) {
      return root
    }

    const query = searchQuery.toLowerCase()
    const filteredFiles = filePaths.filter((path) => path.toLowerCase().includes(query))

    return buildFileTree(filteredFiles)
  }, [root, filePaths, searchQuery])

  // Auto-expand directories when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const pathsToExpand = new Set<string>()
      filePaths.forEach((filePath) => {
        if (filePath.toLowerCase().includes(searchQuery.toLowerCase())) {
          const parts = filePath.split('/')
          for (let i = 1; i < parts.length; i++) {
            pathsToExpand.add(parts.slice(0, i).join('/'))
          }
        }
      })
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        pathsToExpand.forEach((path) => next.add(path))
        return next
      })
    }
  }, [searchQuery, filePaths])

  // Focus search input when search is opened
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  // Auto-focus file tree container when selection changes
  useEffect(() => {
    if (selectedFile && scrollContainerRef.current && !editingPath && !isSearchOpen) {
      setTimeout(() => {
        scrollContainerRef.current?.focus()
      }, 0)
    }
  }, [selectedFile, editingPath, isSearchOpen])

  // Handle search keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !isSearchOpen) {
        e.preventDefault()
        setIsSearchOpen(true)
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isSearchOpen])

  // Auto-scroll to selected file
  useEffect(() => {
    if (selectedFile && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [selectedFile])

  // Scroll to top when adding a new file
  useEffect(() => {
    if (isAdding && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [isAdding])

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

  // Handle outside click to close search box
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!isSearchOpen || searchQuery.trim()) {
        return
      }

      if (fileTreePanelRef.current && !fileTreePanelRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isSearchOpen, searchQuery])

  // Auto-expand directories containing selected file
  useEffect(() => {
    if (selectedFile) {
      const parts = selectedFile.split('/')
      const pathsToExpand = new Set<string>()
      for (let i = 1; i < parts.length; i++) {
        pathsToExpand.add(parts.slice(0, i).join('/'))
      }
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        pathsToExpand.forEach((path) => next.add(path))
        return next
      })
    }
  }, [selectedFile])

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleStartRename = (path: string, name: string) => {
    setEditingPath(path)
    setEditingValue(name)
    setContextMenu(null)
  }

  const handleFinishRename = () => {
    if (editingPath && editingValue) {
      const oldName = editingPath.split('/').pop() || ''
      if (editingValue !== oldName) {
        const dirPath = editingPath.includes('/') ? editingPath.substring(0, editingPath.lastIndexOf('/') + 1) : ''
        const newPath = dirPath + editingValue

        // Check if it's a directory by finding the node in the root tree
        const node = findNodeByPath(root, editingPath)
        const isDirectory = node?.isDirectory ?? false

        if (isDirectory) {
          // For directory rename, update all files under this directory
          const filesToRename: Array<{ oldPath: string; newPath: string }> = []
          filePaths.forEach((filePath) => {
            if (filePath.startsWith(editingPath + '/')) {
              const relativePath = filePath.substring(editingPath.length)
              filesToRename.push({
                oldPath: filePath,
                newPath: newPath + relativePath,
              })
            }
          })

          // Rename all files in the directory
          filesToRename.forEach(({ oldPath, newPath }) => {
            onRenameFile?.(oldPath, newPath)
          })
        } else {
          // For file rename, just rename the file
          onRenameFile?.(editingPath, newPath)
        }
      }
    }
    setEditingPath(null)
    setEditingValue('')
  }

  const handleStartAdd = () => {
    setIsAdding(true)
    setEditingValue('')
  }

  const handleFinishAdd = () => {
    if (editingValue) {
      const fileName = editingValue.endsWith('.ts') ? editingValue : `${editingValue}.ts`
      onAddFile?.(fileName)
    }
    setIsAdding(false)
    setEditingValue('')
  }

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string, isDirectory: boolean) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDirectory })
  }

  const getFileStatus = (path: string) => fileState.getFile(path)?.status

  const handleConfirmClose = (value: string | null) => {
    if (value === 'confirm' && confirmState.open) {
      if (confirmState.type === 'resetToOnline') {
        setIsResettingToOnline(true)
        Promise.resolve(onResetToOnline?.()).finally(() => setIsResettingToOnline(false))
      }
      if (confirmState.type === 'delete') {
        if (confirmState.isDirectory) {
          const filesToDelete = filePaths.filter((p) => p.startsWith(confirmState.path + '/'))
          filesToDelete.forEach((p) => onDeleteFile?.(p))
        } else {
          onDeleteFile?.(confirmState.path)
        }
      }
      if (confirmState.type === 'resetFile') {
        fileState.resetFile(confirmState.path)
      }
    }
    setConfirmState({ open: false })
    setContextMenu(null)
  }

  return (
    <div
      ref={fileTreePanelRef}
      className="w-full h-full bg-[#1e1e1e] border-r border-[#2d2d2d] flex flex-col relative"
      style={{ fontSize: FILE_LIST_ROW.fontSize, lineHeight: FILE_LIST_ROW.lineHeight }}
    >
      <FileListPanelHeader
        isSearchOpen={isSearchOpen}
        setIsSearchOpen={setIsSearchOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchInputRef={searchInputRef}
        onResetToOnline={onResetToOnline}
        setConfirmState={setConfirmState}
        readOnly={readOnly}
        isResettingToOnline={isResettingToOnline}
        onStartAdd={handleStartAdd}
        onAddFile={onAddFile}
      />

      {/* File tree */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] outline-none focus:ring-0"
        role="tree"
        tabIndex={0}
        onKeyDown={(e) => {
          if (selectedFile && !editingPath && !isSearchOpen) {
            if ((isMacOS() && e.key === 'Enter') || (!isMacOS() && e.key === 'F2')) {
              e.preventDefault()
              e.stopPropagation()
              const selectedNode = findNodeByPath(filteredRoot, selectedFile)
              if (selectedNode) {
                setEditingPath(selectedFile)
                const itemName = selectedFile.split('/').pop() || selectedFile
                setEditingValue(itemName)
              }
            }
          }
        }}
      >
        {isAdding && (
          <div
            className="flex items-center px-2"
            style={{
              paddingLeft: '24px',
              paddingRight: FILE_LIST_ROW.paddingRight,
              paddingTop: FILE_LIST_ROW.paddingTop,
              paddingBottom: FILE_LIST_ROW.paddingBottom,
              minHeight: FILE_LIST_ROW.minHeight,
              fontSize: FILE_LIST_ROW.fontSize,
              lineHeight: FILE_LIST_ROW.lineHeight,
            }}
          >
            <VscFileCode className="w-4 h-4 mr-2 text-[#cccccc] flex-shrink-0" />
            <div className="flex items-center flex-1 bg-[#3c3c3c] rounded px-1">
              <input
                autoFocus
                className="bg-transparent text-white outline-none flex-1 min-w-0"
                style={{ fontSize: FILE_LIST_ROW.fontSize, lineHeight: FILE_LIST_ROW.lineHeight }}
                placeholder="Filename"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={handleFinishAdd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishAdd()
                  if (e.key === 'Escape') {
                    setIsAdding(false)
                    setEditingValue('')
                  }
                }}
              />
              <span className="text-[#858585] text-xs">.ts</span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center min-h-full">
            <div className="text-center flex flex-col items-center">
              <Spinner color="text-[#007acc]" />
              <p className="text-sm text-[#cccccc] mt-3">Loading files...</p>
            </div>
          </div>
        ) : filteredRoot.children.size === 0 ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center min-h-full">
            <div className="text-center flex flex-col items-center">
              {searchQuery.trim() ? (
                <>
                  <VscSearch className="w-12 h-12 text-[#858585] mb-3" />
                  <p className="text-sm text-[#cccccc] mb-1">No files found</p>
                  <p className="text-xs text-[#858585]">Try a different search term</p>
                </>
              ) : (
                <>
                  <VscFolder className="w-12 h-12 text-[#858585] mb-3" />
                  <p className="text-sm text-[#cccccc] mb-1">No files</p>
                  <p className="text-xs text-[#858585]">Click the + button to add a file</p>
                </>
              )}
            </div>
          </div>
        ) : (
          /* File list */
          Array.from(filteredRoot.children.values())
            .sort((a, b) => {
              if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1
              }
              return a.name.localeCompare(b.name)
            })
            .map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                expandedPaths={expandedPaths}
                selectedFile={selectedFile}
                editingPath={editingPath}
                editingValue={editingValue}
                selectedItemRef={selectedItemRef}
                getFileStatus={getFileStatus}
                onSelectFile={onSelectFile}
                toggleExpand={toggleExpand}
                setEditingPath={setEditingPath}
                setEditingValue={setEditingValue}
                onContextMenu={handleContextMenu}
                onFinishRename={handleFinishRename}
                setConfirmState={setConfirmState}
                onDeleteFile={onDeleteFile}
              />
            ))
        )}
      </div>

      <FileListContextMenu
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        onRenameFile={onRenameFile}
        hasUnsavedChanges={(path) => fileState.hasUnsavedChanges(path)}
        setConfirmState={setConfirmState}
        setContextMenu={setContextMenu}
        onStartRename={handleStartRename}
        onDeleteFile={onDeleteFile}
      />

      <FileListConfirmDialogs confirmState={confirmState} onClose={handleConfirmClose} />
    </div>
  )
}
