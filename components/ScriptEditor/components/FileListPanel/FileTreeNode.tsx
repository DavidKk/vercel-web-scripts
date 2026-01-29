'use client'

import { FiTrash2 } from 'react-icons/fi'
import { VscFolder } from 'react-icons/vsc'

import type { FileStatus } from '@/components/ScriptEditor/types'

import type { FileListConfirmState, FileNode } from './types'
import { FILE_LIST_ROW } from './types'
import { getFileIcon, getFileStatusIndicator, isMacOS } from './utils'

export interface FileTreeNodeProps {
  /** Tree node to render */
  node: FileNode
  /** Indentation level (0 = root) */
  level?: number
  /** Set of expanded directory paths */
  expandedPaths: Set<string>
  /** Currently selected file path */
  selectedFile: string | null
  /** Path currently being renamed */
  editingPath: string | null
  /** Value of the rename input */
  editingValue: string
  /** Ref for the selected row (scroll into view) */
  selectedItemRef: React.RefObject<HTMLDivElement | null>
  /** Get file status for path (for status indicator) */
  getFileStatus: (path: string) => FileStatus | undefined
  /** Callback when file is selected */
  onSelectFile: (path: string) => void
  /** Toggle directory expand/collapse */
  toggleExpand: (path: string) => void
  /** Start editing (rename) for path */
  setEditingPath: (path: string | null) => void
  /** Set rename input value */
  setEditingValue: (value: string) => void
  /** Context menu handler */
  onContextMenu: (e: React.MouseEvent, path: string, name: string, isDirectory: boolean) => void
  /** Finish rename (commit or cancel) */
  onFinishRename: () => void
  /** Set confirm dialog state (e.g. delete) */
  setConfirmState: (state: FileListConfirmState) => void
  /** Callback when file/folder is deleted */
  onDeleteFile?: (filePath: string) => void
}

/**
 * Renders a single file or directory tree node; recursively renders children when directory is expanded.
 */
export function FileTreeNode({
  node,
  level = 0,
  expandedPaths,
  selectedFile,
  editingPath,
  editingValue,
  selectedItemRef,
  getFileStatus,
  onSelectFile,
  toggleExpand,
  setEditingPath,
  setEditingValue,
  onContextMenu,
  onFinishRename,
  setConfirmState,
  onDeleteFile,
}: FileTreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path)
  const isEditing = editingPath === node.path
  const isSelected = selectedFile === node.path
  const Icon = node.isDirectory ? <VscFolder className={`w-4 h-4 ${isExpanded ? 'text-[#007acc]' : 'text-[#cccccc]'}`} /> : getFileIcon(node.name)
  const status = !node.isDirectory ? getFileStatus(node.path) : undefined
  const statusIndicator = status !== undefined ? getFileStatusIndicator(status) : null

  return (
    <div key={node.path}>
      <div
        ref={isSelected ? selectedItemRef : null}
        className={`
          group flex items-center cursor-pointer select-none
          transition-colors duration-150 outline-none focus:outline-none
          ${isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'}
        `}
        style={{
          paddingLeft: `${level * 16 + 8}px`,
          paddingRight: FILE_LIST_ROW.paddingRight,
          paddingTop: FILE_LIST_ROW.paddingTop,
          paddingBottom: FILE_LIST_ROW.paddingBottom,
          minHeight: FILE_LIST_ROW.minHeight,
          fontSize: FILE_LIST_ROW.fontSize,
          lineHeight: FILE_LIST_ROW.lineHeight,
        }}
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
        onContextMenu={(e) => onContextMenu(e, node.path, node.name, node.isDirectory)}
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
        <div className="w-3 h-3 mr-1 flex items-center justify-center flex-shrink-0">
          {node.isDirectory ? (
            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            statusIndicator
          )}
        </div>
        <span className="mr-2 flex-shrink-0">{Icon}</span>
        {isEditing ? (
          <div className="flex items-center flex-1 bg-[#3c3c3c]">
            <input
              autoFocus
              className="bg-transparent text-white px-1 outline-none flex-1 min-w-0"
              style={{ fontSize: FILE_LIST_ROW.fontSize, lineHeight: FILE_LIST_ROW.lineHeight }}
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={onFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onFinishRename()
                }
                if (e.key === 'Escape') {
                  setEditingPath(null)
                  setEditingValue('')
                }
              }}
            />
          </div>
        ) : (
          <span className="flex-1 truncate" style={{ fontSize: FILE_LIST_ROW.fontSize, lineHeight: FILE_LIST_ROW.lineHeight }}>
            {node.name}
          </span>
        )}
        {onDeleteFile && !isEditing && (
          <button
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-red-400 transition-all duration-150"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setConfirmState({
                open: true,
                type: 'delete',
                path: node.path,
                name: node.name,
                isDirectory: node.isDirectory,
              })
            }}
            title={node.isDirectory ? 'Delete folder' : 'Delete file'}
          >
            <FiTrash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {node.isDirectory && isExpanded && (
        <div>
          {Array.from(node.children.values())
            .sort((a, b) => {
              if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1
              }
              return a.name.localeCompare(b.name)
            })
            .map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                level={level + 1}
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
                onContextMenu={onContextMenu}
                onFinishRename={onFinishRename}
                setConfirmState={setConfirmState}
                onDeleteFile={onDeleteFile}
              />
            ))}
        </div>
      )}
    </div>
  )
}
