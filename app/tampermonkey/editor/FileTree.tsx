'use client'

import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState } from 'react'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children: Map<string, FileNode>
}

interface FileTreeProps {
  files: Record<string, { content: string; rawUrl: string }>
  selectedFile: string | null
  onSelectFile: (filePath: string) => void
  onDeleteFile?: (filePath: string) => void
  onAddFile?: (filePath: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  getFileState?: (filePath: string) => 'synced' | 'local' | 'unsaved'
}

/**
 * Get file icon based on extension
 */
function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    ts: '📘',
    tsx: '⚛️',
    js: '📜',
    jsx: '⚛️',
    json: '📋',
    css: '🎨',
    html: '🌐',
    md: '📝',
  }
  return iconMap[ext || ''] || '📄'
}

/**
 * Build tree structure from flat file paths
 */
function buildFileTree(files: Record<string, { content: string; rawUrl: string }>): FileNode {
  const root: FileNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: new Map(),
  }

  Object.keys(files).forEach((filePath) => {
    const parts = filePath.split('/')
    let current = root

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1
      const path = parts.slice(0, index + 1).join('/')

      if (!current.children.has(path)) {
        current.children.set(path, {
          name: part,
          path,
          isDirectory: !isLast,
          children: new Map(),
        })
      }

      if (!isLast) {
        current = current.children.get(path)!
      }
    })
  })

  return root
}

export default function FileTree({ files, selectedFile, onSelectFile, onDeleteFile, onAddFile, onRenameFile, getFileState }: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string } | null>(null)

  const root = useMemo(() => buildFileTree(files), [files])
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLDivElement>(null)

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
        onRenameFile?.(editingPath, newPath)
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

  const handleContextMenu = (e: React.MouseEvent, path: string, name: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, path, name })
  }

  const renderNode = (node: FileNode, level = 0): React.ReactNode => {
    const isExpanded = expandedPaths.has(node.path)
    const isEditing = editingPath === node.path
    const isSelected = selectedFile === node.path
    const Icon = node.isDirectory ? (isExpanded ? '📂' : '📁') : getFileIcon(node.name)

    return (
      <div key={node.path}>
        <div
          ref={isSelected ? selectedItemRef : null}
          className={`
            group flex items-center px-2 py-1.5 cursor-pointer select-none
            transition-colors duration-150
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
          onContextMenu={(e) => !node.isDirectory && handleContextMenu(e, node.path, node.name)}
        >
          {/* Expand/Collapse icon or State Dot */}
          <div className="w-3 h-3 mr-1 flex items-center justify-center flex-shrink-0">
            {node.isDirectory ? (
              <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              (() => {
                const state = getFileState?.(node.path)
                if (state === 'unsaved') return <span className="w-1.5 h-1.5 rounded-full bg-[#007acc]" title="Unsaved changes" />
                if (state === 'local') return <span className="w-1.5 h-1.5 rounded-full bg-[#ff9900]" title="Saved to local storage" />
                return null
              })()
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
                  if (e.key === 'Enter') handleFinishRename()
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

          {/* Delete button (only for files) */}
          {!node.isDirectory && onDeleteFile && !isEditing && (
            <button
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-red-400 transition-all duration-150"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (window.confirm(`Are you sure you want to delete ${node.name}?`)) {
                  onDeleteFile(node.path)
                }
              }}
              title="Delete file"
            >
              <TrashIcon className="w-3.5 h-3.5" />
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
    <div className="w-64 h-full bg-[#282c34] border-r border-[#3e3e3e] flex flex-col relative">
      {/* Header */}
      <div className="px-3 py-2 text-xs font-semibold text-[#858585] uppercase border-b border-[#3e3e3e] bg-[#282c34] sticky top-0 z-10 flex items-center justify-between">
        Files
        <button
          className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            handleStartAdd()
          }}
          title="Add File"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* File tree - hidden scrollbar but scrollable */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {isAdding && (
          <div className="flex items-center px-2 py-1.5" style={{ paddingLeft: '24px' }}>
            <span className="mr-2 text-sm flex-shrink-0">📘</span>
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
        {Array.from(root.children.values())
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
              return a.isDirectory ? -1 : 1
            }
            return a.name.localeCompare(b.name)
          })
          .map((node) => renderNode(node))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed bg-[#252526] shadow-xl border border-[#454545] py-1 z-[100] min-w-[120px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors"
            onClick={() => handleStartRename(contextMenu.path, contextMenu.name)}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#ce3c3c] hover:text-white transition-colors"
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete ${contextMenu.name}?`)) {
                onDeleteFile?.(contextMenu.path)
              }
              setContextMenu(null)
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
