'use client'

import { useState } from 'react'

import { FileListPanel, FileStateProvider, useFileState, useFileStorage } from '@/components/ScriptEditor'

/**
 * Test page for ScriptEditor components
 */
export default function ScriptEditorTestPage() {
  // Initial test files
  const initialFiles: Record<string, string> = {
    'src/index.ts': `export function main() {
  console.log('Hello, World!')
}`,
    'src/utils/helper.ts': `export function helper() {
  return 'helper'
}`,
    'package.json': `{
  "name": "test-project",
  "version": "1.0.0"
}`,
    'README.md': `# Test Project

This is a test project for ScriptEditor components.`,
    'styles/main.css': `body {
  margin: 0;
  padding: 0;
}`,
  }

  return (
    <FileStateProvider initialFiles={initialFiles}>
      <ScriptEditorTestContent />
    </FileStateProvider>
  )
}

/**
 * Test content component
 */
function ScriptEditorTestContent() {
  const fileState = useFileState()
  const fileStorage = useFileStorage('script-editor-test')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [leftPanelWidth, setLeftPanelWidth] = useState(250)

  /**
   * Handle file selection
   */
  function handleSelectFile(path: string) {
    setSelectedFile(path)
  }

  /**
   * Handle file deletion
   */
  function handleDeleteFile(path: string) {
    fileState.deleteFile(path)
    if (selectedFile === path) {
      setSelectedFile(null)
    }
  }

  /**
   * Handle file addition
   */
  function handleAddFile(fileName: string) {
    fileState.createFile(fileName, '')
    setSelectedFile(fileName)
  }

  /**
   * Handle file rename (also handles directory rename)
   */
  function handleRenameFile(oldPath: string, newPath: string) {
    fileState.renameFile(oldPath, newPath)
    // Update selected file if it matches the old path or is under the renamed directory
    if (selectedFile === oldPath) {
      setSelectedFile(newPath)
    } else if (selectedFile && selectedFile.startsWith(oldPath + '/')) {
      // If selected file is under the renamed directory, update its path
      const relativePath = selectedFile.substring(oldPath.length)
      setSelectedFile(newPath + relativePath)
    }
  }

  /**
   * Get current file content
   */
  function getCurrentFileContent(): string {
    if (!selectedFile) {
      return ''
    }
    const file = fileState.getFile(selectedFile)
    return file?.content.modifiedContent || ''
  }

  /**
   * Handle content change
   */
  function handleContentChange(content: string) {
    if (selectedFile) {
      fileState.updateFile(selectedFile, content)
    }
  }

  /**
   * Handle save
   */
  async function handleSave() {
    if (selectedFile) {
      await fileStorage.saveFile(selectedFile)
    }
  }

  /**
   * Handle save all
   */
  async function handleSaveAll() {
    await fileStorage.saveAllFiles()
  }

  const selectedFileData = selectedFile ? fileState.getFile(selectedFile) : null
  const hasUnsavedChanges = fileState.hasAnyUnsavedChanges()
  const unsavedFiles = fileState.getUnsavedFiles()

  return (
    <div className="w-screen h-screen flex flex-col bg-[#1e1e1e] text-[#cccccc]">
      {/* Header */}
      <div className="h-[40px] bg-[#2d2d2d] border-b border-[#3e3e42] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold">ScriptEditor Test Page</h1>
          <div className="text-xs text-[#858585]">
            {Object.keys(fileState.files).length} files
            {unsavedFiles.length > 0 && ` • ${unsavedFiles.length} unsaved`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveAll}
            disabled={!hasUnsavedChanges}
            className="px-3 py-1.5 text-xs bg-[#007acc] hover:bg-[#005a9e] disabled:bg-[#3e3e42] disabled:text-[#858585] disabled:cursor-not-allowed rounded transition-colors"
          >
            Save All
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedFile || !fileState.hasUnsavedChanges(selectedFile)}
            className="px-3 py-1.5 text-xs bg-[#007acc] hover:bg-[#005a9e] disabled:bg-[#3e3e42] disabled:text-[#858585] disabled:cursor-not-allowed rounded transition-colors"
          >
            Save
          </button>
          <div className="text-xs text-[#858585]">Storage: {fileStorage.isInitialized ? 'Ready' : 'Loading...'}</div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: File List Panel */}
        <div className="flex-shrink-0" style={{ width: `${leftPanelWidth}px` }}>
          <FileListPanel
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            onDeleteFile={handleDeleteFile}
            onAddFile={handleAddFile}
            onRenameFile={handleRenameFile}
            isLoading={!fileStorage.isInitialized}
          />
        </div>

        {/* Resizer */}
        <div
          className="w-1 bg-[#2d2d2d] hover:bg-[#007acc] cursor-col-resize transition-colors"
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = leftPanelWidth

            function handleMouseMove(e: MouseEvent) {
              const newWidth = Math.max(150, Math.min(600, startWidth + (e.clientX - startX)))
              setLeftPanelWidth(newWidth)
            }

            function handleMouseUp() {
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
            }

            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }}
        />

        {/* Right: Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedFile ? (
            <>
              {/* File info bar */}
              <div className="h-[30px] bg-[#252526] border-b border-[#3e3e42] flex items-center px-4 text-xs">
                <span className="text-[#cccccc]">{selectedFile}</span>
                {selectedFileData && (
                  <span className="ml-4 text-[#858585]">
                    Status: {selectedFileData.status}
                    {fileState.hasUnsavedChanges(selectedFile) && ' • Unsaved'}
                  </span>
                )}
              </div>

              {/* Editor */}
              <div className="flex-1 p-4">
                <textarea
                  value={getCurrentFileContent()}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className="w-full h-full bg-[#1e1e1e] text-[#cccccc] font-mono text-sm p-4 rounded border border-[#3e3e42] focus:outline-none focus:border-[#007acc] resize-none"
                  placeholder="File content will appear here..."
                  spellCheck={false}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-[#858585] mb-2">No file selected</p>
                <p className="text-xs text-[#666666]">Select a file from the left panel to view and edit its content</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="h-[24px] bg-[#007acc] flex items-center px-4 text-xs">
        <div className="flex items-center gap-4">
          <span>Selected: {selectedFile || 'None'}</span>
          {selectedFileData && (
            <>
              <span>•</span>
              <span>Status: {selectedFileData.status}</span>
              <span>•</span>
              <span>Updated: {new Date(selectedFileData.updatedAt).toLocaleTimeString()}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
