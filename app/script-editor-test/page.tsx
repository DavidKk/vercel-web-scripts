'use client'

import { useState } from 'react'

import { FileListPanel, FileStateProvider, TabBar, TabBarProvider, tabBarStorageService, useFileState, useFileStorage, useTabBar } from '@/components/ScriptEditor'

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
      <TabBarProvider>
        <ScriptEditorTestContent />
      </TabBarProvider>
    </FileStateProvider>
  )
}

/**
 * Test content component
 */
function ScriptEditorTestContent() {
  const fileState = useFileState()
  const fileStorage = useFileStorage('script-editor-test')
  const tabBar = useTabBar()
  const [leftPanelWidth, setLeftPanelWidth] = useState(250)

  /**
   * Handle file selection
   */
  function handleSelectFile(path: string) {
    tabBar.openTab(path)
  }

  /**
   * Handle file deletion
   */
  function handleDeleteFile(path: string) {
    fileState.deleteFile(path)
    if (tabBar.activeTab === path) {
      tabBar.closeTab(path)
    }
  }

  /**
   * Handle file addition
   */
  function handleAddFile(fileName: string) {
    fileState.createFile(fileName, '')
    tabBar.openTab(fileName)
  }

  /**
   * Handle file rename (also handles directory rename)
   */
  function handleRenameFile(oldPath: string, newPath: string) {
    fileState.renameFile(oldPath, newPath)
    // Update tab if it matches the old path or is under the renamed directory
    if (tabBar.isTabOpen(oldPath)) {
      tabBar.closeTab(oldPath)
      tabBar.openTab(newPath)
    } else {
      // Update all tabs that are under the renamed directory
      const tabsToUpdate: Array<{ oldPath: string; newPath: string }> = []
      tabBar.openTabs.forEach((tabPath) => {
        if (tabPath.startsWith(oldPath + '/')) {
          const relativePath = tabPath.substring(oldPath.length)
          tabsToUpdate.push({
            oldPath: tabPath,
            newPath: newPath + relativePath,
          })
        }
      })
      // Update tabs
      tabsToUpdate.forEach(({ oldPath: tabOldPath, newPath: tabNewPath }) => {
        tabBar.closeTab(tabOldPath)
        tabBar.openTab(tabNewPath)
      })
    }
  }

  /**
   * Get current file content
   */
  function getCurrentFileContent(): string {
    if (!tabBar.activeTab) {
      return ''
    }
    const file = fileState.getFile(tabBar.activeTab)
    return file?.content.modifiedContent || ''
  }

  /**
   * Handle content change
   */
  function handleContentChange(content: string) {
    if (tabBar.activeTab) {
      fileState.updateFile(tabBar.activeTab, content)
    }
  }

  /**
   * Handle save
   */
  async function handleSave() {
    if (tabBar.activeTab) {
      await fileStorage.saveFile(tabBar.activeTab)
    }
  }

  /**
   * Handle save all
   */
  async function handleSaveAll() {
    await fileStorage.saveAllFiles()
  }

  /**
   * Handle clear tab bar storage
   */
  async function handleClearTabBarStorage() {
    try {
      await tabBarStorageService.clearTabBarState()
      // Reload page to see the effect
      window.location.reload()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Clear TabBar Storage] Error:', error)
      alert(`Error clearing TabBar storage: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Handle test tab bar storage
   */
  async function handleTestTabBarStorage() {
    try {
      // Manually save current state
      await tabBarStorageService.saveTabBarState(tabBar.openTabs, tabBar.activeTab)

      // Load to verify
      const loadedState = await tabBarStorageService.loadTabBarState()

      // Show alert with information
      const message = `TabBar Storage Test:\n\nCurrent State:\n- Open tabs: ${tabBar.openTabs.join(', ') || 'none'}\n- Active tab: ${tabBar.activeTab || 'none'}\n\nLoaded State:\n- Open tabs: ${loadedState?.openTabs.join(', ') || 'none'}\n- Active tab: ${loadedState?.activeTab || 'none'}`
      alert(message)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Test TabBar Storage] Error:', error)
      alert(`Error testing TabBar storage: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const selectedFileData = tabBar.activeTab ? fileState.getFile(tabBar.activeTab) : null
  const hasUnsavedChanges = fileState.hasAnyUnsavedChanges()
  const unsavedFiles = fileState.getUnsavedFiles()
  const tabCount = tabBar.tabCount

  return (
    <div className="w-screen h-screen flex flex-col bg-[#1e1e1e] text-[#cccccc]">
      {/* Header */}
      <div className="h-[40px] bg-[#2d2d2d] border-b border-[#3e3e42] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold">ScriptEditor Test Page</h1>
          <div className="text-xs text-[#858585]">
            {Object.keys(fileState.files).length} files
            {unsavedFiles.length > 0 && ` • ${unsavedFiles.length} unsaved`}
            {tabCount > 0 && ` • ${tabCount} tabs`}
            {tabBar.activeTab && ` • Active: ${tabBar.activeTab.split('/').pop()}`}
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
            disabled={!tabBar.activeTab || !fileState.hasUnsavedChanges(tabBar.activeTab)}
            className="px-3 py-1.5 text-xs bg-[#007acc] hover:bg-[#005a9e] disabled:bg-[#3e3e42] disabled:text-[#858585] disabled:cursor-not-allowed rounded transition-colors"
          >
            Save
          </button>
          <div className="text-xs text-[#858585]">Storage: {fileStorage.isInitialized ? 'Ready' : 'Loading...'}</div>
          <button onClick={handleTestTabBarStorage} className="px-3 py-1.5 text-xs bg-[#3e3e42] hover:bg-[#007acc] rounded transition-colors" title="Test TabBar Storage">
            Test TabBar Storage
          </button>
          <button onClick={handleClearTabBarStorage} className="px-3 py-1.5 text-xs bg-[#3e3e42] hover:bg-[#ce3c3c] rounded transition-colors" title="Clear TabBar Storage">
            Clear TabBar Storage
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: File List Panel */}
        <div className="flex-shrink-0" style={{ width: `${leftPanelWidth}px` }}>
          <FileListPanel
            selectedFile={tabBar.activeTab}
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
          {/* Tab Bar */}
          <TabBar onTabClick={handleSelectFile} onTabClose={(path) => tabBar.closeTab(path)} />

          {tabBar.activeTab ? (
            <>
              {/* File info bar */}
              <div className="h-[30px] bg-[#252526] border-b border-[#3e3e42] flex items-center px-4 text-xs">
                <span className="text-[#cccccc]">{tabBar.activeTab}</span>
                {selectedFileData && (
                  <span className="ml-4 text-[#858585]">
                    Status: {selectedFileData.status}
                    {fileState.hasUnsavedChanges(tabBar.activeTab) && ' • Unsaved'}
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
          <span>Selected: {tabBar.activeTab || 'None'}</span>
          {selectedFileData && (
            <>
              <span>•</span>
              <span>Status: {selectedFileData.status}</span>
              <span>•</span>
              <span>Updated: {new Date(selectedFileData.updatedAt).toLocaleTimeString()}</span>
            </>
          )}
          {tabCount > 0 && (
            <>
              <span>•</span>
              <span>Tabs: {tabCount}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
