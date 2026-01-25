'use client'

import { useEffect, useRef } from 'react'

import InternalCodeEditor, { type CodeEditorRef } from './components/Editor'
import FileListPanel from './components/FileListPanel'
import { Resizer } from './components/Resizer'
import TabBar from './components/TabBar'
import { useFileState } from './context/FileStateContext'
import { useFileStorage } from './hooks/useFileStorage'
import { useLayout } from './hooks/useLayout'
import { useTabBar } from './hooks/useTabBar'
import type { ScriptEditorProps } from './ScriptEditor'

/**
 * Internal content component that uses LayoutContext, TabBarContext, and FileStateContext
 */
export function ScriptEditorContent({
  storageKey,
  extraLibs = [],
  title = 'Script Editor',
  headerActions,
  footerInfo,
  className = '',
  hideHeader = false,
  hideFooter = false,
  showFileCount = true,
  onReady,
  renderRightPanel,
}: ScriptEditorProps) {
  const fileState = useFileState()
  const fileStorage = useFileStorage(storageKey)
  const tabBar = useTabBar()
  const layout = useLayout()
  const codeEditorRef = useRef<CodeEditorRef>(null)
  const lastActiveTabRef = useRef<string | null>(null)

  // Sync editor content when active tab changes
  useEffect(() => {
    // If we have an active tab and it changed (or first time)
    if (tabBar.activeTab && tabBar.activeTab !== lastActiveTabRef.current) {
      const file = fileState.getFile(tabBar.activeTab)
      if (file && codeEditorRef.current) {
        codeEditorRef.current.setContent(file.content.modifiedContent, true)
        lastActiveTabRef.current = tabBar.activeTab
      }
    } else if (!tabBar.activeTab && lastActiveTabRef.current) {
      // If we cleared the tab, clear the editor content if it's ready
      if (codeEditorRef.current) {
        codeEditorRef.current.setContent('', true)
      }
      lastActiveTabRef.current = null
    }
  }, [tabBar.activeTab, fileState])

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
   * Handle file rename
   */
  function handleRenameFile(oldPath: string, newPath: string) {
    fileState.renameFile(oldPath, newPath)
    if (tabBar.isTabOpen(oldPath)) {
      tabBar.closeTab(oldPath)
      tabBar.openTab(newPath)
    }
    if (lastActiveTabRef.current === oldPath) {
      lastActiveTabRef.current = newPath
    }
  }

  /**
   * Handle content change in editor
   */
  function handleContentChange(content: string) {
    if (tabBar.activeTab) {
      fileState.updateFile(tabBar.activeTab, content)
    }
  }

  /**
   * Get current file language
   */
  const getFileLanguage = (filePath: string | null): any => {
    if (!filePath) return 'typescript'
    const ext = filePath.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'json':
        return 'json'
      case 'ts':
      case 'tsx':
        return 'typescript'
      case 'js':
      case 'jsx':
        return 'javascript'
      case 'css':
        return 'css'
      case 'less':
        return 'less'
      case 'scss':
        return 'scss'
      case 'html':
        return 'html'
      case 'md':
        return 'markdown'
      default:
        return 'typescript'
    }
  }

  const selectedFileData = tabBar.activeTab ? fileState.getFile(tabBar.activeTab) : null
  const unsavedFiles = fileState.getUnsavedFiles()

  return (
    <div className={`w-full h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] ${className}`}>
      {/* Header */}
      {!hideHeader && (
        <div className="h-[40px] bg-[#2d2d2d] border-b border-[#3e3e42] flex items-center justify-between px-4 sticky top-0 z-20 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-sm font-semibold truncate">{title}</div>
            {showFileCount && (
              <div className="text-xs text-[#858585] hidden sm:block">
                {Object.keys(fileState.files).length} files
                {unsavedFiles.length > 0 && ` • ${unsavedFiles.length} unsaved`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: File List Panel */}
        <div className="flex-shrink-0" style={{ width: `${layout.leftPanelWidth}px` }}>
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
        <Resizer initialWidth={layout.leftPanelWidth} minWidth={150} maxWidth={600} onResize={layout.setLeftPanelWidth} />

        {/* Right: Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab Bar */}
          <TabBar onTabClick={handleSelectFile} onTabClose={(path) => tabBar.closeTab(path)} />

          <div className="flex-1 min-w-0 relative bg-[#1e1e1e]">
            {/* 
              Render CodeEditor always to speed up initialization.
              It will show its own loading spinner initially.
            */}
            <InternalCodeEditor
              defaultValue={selectedFileData?.content.modifiedContent || ''}
              path={tabBar.activeTab || 'initialization.ts'}
              language={getFileLanguage(tabBar.activeTab)}
              onChange={handleContentChange}
              onSave={() => tabBar.activeTab && fileStorage.saveFile(tabBar.activeTab)}
              onDelete={() => tabBar.activeTab && handleDeleteFile(tabBar.activeTab)}
              onReady={onReady}
              extraLibs={extraLibs}
              editorRef={codeEditorRef}
            />

            {/* Overlay if no tab is selected. Only show when editor is ready or when definitely no file. */}
            {!tabBar.activeTab && (
              <div className="absolute inset-0 flex items-center justify-center text-[#858585] bg-[#1e1e1e] z-10 pointer-events-none">
                <div className="text-center p-8">
                  <p className="text-lg mb-2">No file selected</p>
                  <p className="text-sm">Select a file from the sidebar to start editing</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel Slot */}
        {layout.rightPanelType && renderRightPanel && (
          <>
            <Resizer initialWidth={layout.rightPanelWidth} minWidth={300} maxWidth={800} onResize={layout.setRightPanelWidth} reverse={true} />
            <div className="flex-shrink-0 bg-[#1e1e1e] border-l border-[#3e3e42]" style={{ width: `${layout.rightPanelWidth}px` }}>
              {renderRightPanel(layout.rightPanelType)}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {!hideFooter && (
        <div className="h-[24px] bg-[#007acc] flex items-center px-4 text-xs text-white justify-between flex-shrink-0">
          <div className="flex items-center gap-4 overflow-hidden">
            <span className="truncate">Selected: {tabBar.activeTab || 'None'}</span>
            {selectedFileData && (
              <>
                <span className="hidden sm:inline">• Status: {selectedFileData.status}</span>
                <span className="hidden md:inline">• Updated: {new Date(selectedFileData.updatedAt).toLocaleTimeString()}</span>
              </>
            )}
          </div>
          <div>{footerInfo}</div>
        </div>
      )}
    </div>
  )
}
