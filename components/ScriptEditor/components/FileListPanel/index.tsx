'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiPlus, FiTrash2, FiX } from 'react-icons/fi'
import { VscFileCode, VscFolder, VscSearch } from 'react-icons/vsc'

import { Spinner } from '@/components/Spinner'

import { useFileState } from '../../context/FileStateContext'
import { FileStatus } from '../../types'
import { buildFileTree, findNodeByPath } from './fileTree'
import type { FileListPanelProps, FileNode } from './types'
import { getFileIcon, getFileStatusIndicator, isMacOS } from './utils'

export type { FileListPanelProps } from './types'

/**
 * File list panel component
 */
export default function FileListPanel({ selectedFile, onSelectFile, onDeleteFile, onAddFile, onRenameFile, isLoading = false }: FileListPanelProps) {
  const fileState = useFileState()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string; isDirectory: boolean } | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
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

  const renderNode = (node: FileNode, level = 0): React.ReactNode => {
    const isExpanded = expandedPaths.has(node.path)
    const isEditing = editingPath === node.path
    const isSelected = selectedFile === node.path
    const Icon = node.isDirectory ? <VscFolder className={`w-4 h-4 ${isExpanded ? 'text-[#007acc]' : 'text-[#cccccc]'}`} /> : getFileIcon(node.name)

    // Get file status for status indicator
    const file = !node.isDirectory ? fileState.getFile(node.path) : undefined
    const statusIndicator = file ? getFileStatusIndicator(file.status) : null

    return (
      <div key={node.path}>
        <div
          ref={isSelected ? selectedItemRef : null}
          className={`
            group flex items-center px-2 py-1.5 cursor-pointer select-none
            transition-colors duration-150 outline-none focus:outline-none
            ${isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'}
          `}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (node.isDirectory) {
              toggleExpand(node.path)
            } else {
              onSelectFile(node.path)
            }
          }}
          onDoubleClick={() => {
            if (!node.isDirectory) {
              onSelectFile(node.path)
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, node.path, node.name, node.isDirectory)}
          onKeyDown={(e) => {
            if (isSelected) {
              if ((isMacOS() && e.key === 'Enter') || (!isMacOS() && e.key === 'F2')) {
                e.preventDefault()
                e.stopPropagation()
                if (!isEditing) {
                  setEditingPath(node.path)
                  setEditingValue(node.name)
                }
              }
            }
          }}
          tabIndex={isSelected ? 0 : -1}
        >
          {/* Expand/Collapse icon or Status Dot */}
          <div className="w-3 h-3 mr-1 flex items-center justify-center flex-shrink-0">
            {node.isDirectory ? (
              <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              statusIndicator
            )}
          </div>

          {/* File/Directory icon */}
          <span className="mr-2 text-sm flex-shrink-0">{Icon}</span>

          {/* File name / Input */}
          {isEditing ? (
            <div className="flex items-center flex-1 bg-[#3c3c3c]">
              <input
                autoFocus
                className="bg-transparent text-white text-sm px-1 outline-none flex-1 min-w-0"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFinishRename()
                  }
                  if (e.key === 'Escape') {
                    setEditingPath(null)
                    setEditingValue('')
                  }
                }}
              />
            </div>
          ) : (
            <span className="text-sm flex-1 truncate">{node.name}</span>
          )}

          {/* Delete button */}
          {onDeleteFile && !isEditing && (
            <button
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-red-400 transition-all duration-150"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (window.confirm(`Are you sure you want to delete ${node.name}?${node.isDirectory ? ' All files in this folder will be deleted.' : ''}`)) {
                  if (node.isDirectory) {
                    // Delete all files in the directory
                    const filesToDelete = filePaths.filter((filePath) => filePath.startsWith(node.path + '/'))
                    filesToDelete.forEach((filePath) => {
                      onDeleteFile(filePath)
                    })
                  } else {
                    onDeleteFile(node.path)
                  }
                }
              }}
              title={`Delete ${node.isDirectory ? 'folder' : 'file'}`}
            >
              <FiTrash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Children */}
        {node.isDirectory && isExpanded && (
          <div>
            {Array.from(node.children.values())
              .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                  return a.isDirectory ? -1 : 1
                }
                return a.name.localeCompare(b.name)
              })
              .map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={fileTreePanelRef} className="w-full h-full bg-[#1e1e1e] border-r border-[#2d2d2d] flex flex-col relative">
      {/* Header */}
      <div className="h-[33px] px-3 text-xs font-semibold text-[#cccccc] uppercase border-b border-[#2d2d2d] bg-[#1e1e1e] sticky top-0 z-10 flex items-center justify-between">
        Files
        <div className="flex items-center gap-1">
          <button
            className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setIsSearchOpen((prev) => !prev)
              if (!isSearchOpen) {
                setSearchQuery('')
              }
            }}
            title="Search files (Cmd+F / Ctrl+F)"
          >
            <VscSearch className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              handleStartAdd()
            }}
            title="Add File"
          >
            <FiPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
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
          <div className="flex items-center px-2 py-1.5" style={{ paddingLeft: '24px' }}>
            <VscFileCode className="w-4 h-4 mr-2 text-[#cccccc] flex-shrink-0" />
            <div className="flex items-center flex-1 bg-[#3c3c3c] rounded px-1">
              <input
                autoFocus
                className="bg-transparent text-white text-sm outline-none flex-1 min-w-0"
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
            .map((node) => renderNode(node))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed bg-[#252526] shadow-xl border border-[#3a3a3a] py-1 z-[100] min-w-[120px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {onRenameFile && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors"
              onClick={() => handleStartRename(contextMenu.path, contextMenu.name)}
            >
              Rename
            </button>
          )}
          {!contextMenu.isDirectory && fileState.hasUnsavedChanges(contextMenu.path) && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors"
              onClick={() => {
                if (window.confirm(`Are you sure you want to reset ${contextMenu.name} to its original content? All unsaved changes will be lost.`)) {
                  fileState.resetFile(contextMenu.path)
                }
                setContextMenu(null)
              }}
            >
              Reset
            </button>
          )}
          {onDeleteFile && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#ce3c3c] hover:text-white transition-colors"
              onClick={() => {
                const confirmMessage = contextMenu.isDirectory
                  ? `Are you sure you want to delete the folder "${contextMenu.name}"? All files in this folder will be deleted.`
                  : `Are you sure you want to delete ${contextMenu.name}?`
                if (window.confirm(confirmMessage)) {
                  if (contextMenu.isDirectory) {
                    // Delete all files in the directory
                    const filesToDelete = filePaths.filter((filePath) => filePath.startsWith(contextMenu.path + '/'))
                    filesToDelete.forEach((filePath) => {
                      onDeleteFile(filePath)
                    })
                  } else {
                    onDeleteFile(contextMenu.path)
                  }
                }
                setContextMenu(null)
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
