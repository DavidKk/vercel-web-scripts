'use client'

import { useCallback, useEffect, useRef } from 'react'

import InternalCodeEditor, { type CodeEditorRef } from './components/Editor'
import FileListPanel from './components/FileListPanel'
import { Resizer } from './components/Resizer'
import TabBar from './components/TabBar'
import { useFileState } from './context/FileStateContext'
import { LocalMapProvider, useLocalMap } from './context/LocalMapContext'
import { useFileStorage } from './hooks/useFileStorage'
import { useLayout } from './hooks/useLayout'
import { useTabBar } from './hooks/useTabBar'
import type { ScriptEditorProps } from './ScriptEditor'
import { type FileMetadata, FileStatus } from './types'

/**
 * Inner content: uses LocalMap context for readOnly when in local map mode.
 */
function ScriptEditorContentInner(props: ScriptEditorProps) {
  const localMap = useLocalMap()
  const readOnly = localMap?.isLocalMapMode ?? props.readOnly ?? false
  return <ScriptEditorContentBody {...props} readOnly={readOnly} />
}

/**
 * Internal content component that uses LayoutContext, TabBarContext, FileStateContext, and LocalMapContext
 */
export function ScriptEditorContent(outerProps: ScriptEditorProps) {
  return (
    <LocalMapProvider
      storageKey={outerProps.storageKey}
      onNotify={outerProps.onLocalMapNotify}
      typingsForLocal={outerProps.typingsForLocal}
      onLocalFilesSynced={outerProps.onLocalFilesSynced}
    >
      <ScriptEditorContentInner {...outerProps} />
    </LocalMapProvider>
  )
}

function ScriptEditorContentBody({
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
  onSave: onSaveProp,
  onDelete: onDeleteProp,
  readOnly = false,
}: ScriptEditorProps & { readOnly: boolean }) {
  const fileState = useFileState()
  const fileStorage = useFileStorage(storageKey)
  const tabBar = useTabBar()
  const layout = useLayout()
  const codeEditorRef = useRef<CodeEditorRef>(null)
  const lastActiveTabRef = useRef<string | null>(null)
  const activeTabRef = useRef<string | null>(null)

  // Sync editor content when active tab changes
  useEffect(() => {
    activeTabRef.current = tabBar.activeTab
    // If we have an active tab and it changed (or first time)
    if (tabBar.activeTab && tabBar.activeTab !== lastActiveTabRef.current) {
      const file = fileState.getFile(tabBar.activeTab)
      if (file && codeEditorRef.current) {
        // Only force cursor to 1,1 when switching between two tabs; not on initial load (lastActiveTab was null)
        const isTabSwitch = lastActiveTabRef.current != null
        codeEditorRef.current.setContent(file.content.modifiedContent, isTabSwitch)
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

  // Sync editor content when current file content changes (e.g., after sync from local)
  const selectedFileData = tabBar.activeTab ? fileState.getFile(tabBar.activeTab) : null
  const currentFileContent = selectedFileData?.content.modifiedContent
  const currentFileUpdatedAt = selectedFileData?.updatedAt
  const localMap = useLocalMap()

  // Sync editor when file content changed externally (e.g. local sync). Use forceUpdate=false so we
  // never move cursor to 1,1 when the change actually came from the user typing (race: effect runs
  // before getContent() reflects the same content as fileState, so we must not force cursor reset).
  useEffect(() => {
    if (tabBar.activeTab && selectedFileData && codeEditorRef.current && codeEditorRef.current.isReady()) {
      const currentContent = codeEditorRef.current.getContent()
      if (currentContent !== currentFileContent) {
        codeEditorRef.current.setContent(selectedFileData.content.modifiedContent || '', false)
      }
    }
  }, [tabBar.activeTab, currentFileContent, currentFileUpdatedAt, selectedFileData])

  // Force refresh editor when "Sync from local" completes (lastSyncedAt changes)
  // Defer to next tick so fileState has committed; then read latest content and set in editor
  useEffect(() => {
    const activeTab = tabBar.activeTab
    if (!localMap?.lastSyncedAt || !activeTab) return
    const timer = setTimeout(() => {
      const file = fileState.getFile(activeTab)
      if (file && codeEditorRef.current?.isReady()) {
        codeEditorRef.current.setContent(file.content.modifiedContent ?? '', true)
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [localMap?.lastSyncedAt, tabBar.activeTab, fileState])

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
   * Clear local IndexedDB and reset file state to online (initialFiles)
   */
  const handleResetToOnline = useCallback(async () => {
    await fileStorage.clearFiles()
    tabBar.closeAllTabs()
    const initial = fileState.initialFiles
    if (Object.keys(initial).length > 0) {
      const record: Record<string, FileMetadata> = {}
      const now = Date.now()
      for (const [path, content] of Object.entries(initial)) {
        record[path] = {
          path,
          status: FileStatus.Unchanged,
          content: { originalContent: content, modifiedContent: content },
          updatedAt: now,
        }
      }
      fileState.loadStoredFiles(record)
    } else {
      fileState.loadStoredFiles({})
    }
  }, [fileStorage, tabBar, fileState])

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
   * When editor becomes ready, sync current tab content (fixes race: tab restored before fileState, or editor mounted after fileState).
   * Use forceUpdate=false so we do not move cursor to 1,1 on init (avoids "first keystroke jumps cursor to 0,0").
   */
  const handleEditorReady = useCallback(() => {
    if (tabBar.activeTab && codeEditorRef.current?.isReady()) {
      const file = fileState.getFile(tabBar.activeTab)
      if (file) {
        codeEditorRef.current.setContent(file.content.modifiedContent || '', false)
      }
    }
    onReady?.()
  }, [tabBar.activeTab, fileState, onReady])

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
            onDeleteFile={readOnly ? undefined : handleDeleteFile}
            onAddFile={handleAddFile}
            onRenameFile={readOnly ? undefined : handleRenameFile}
            isLoading={!fileStorage.isInitialized}
            onResetToOnline={handleResetToOnline}
            readOnly={readOnly}
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
              readOnly={readOnly}
              onSave={async () => {
                if (activeTabRef.current) {
                  await fileStorage.saveFile(activeTabRef.current)
                  if (onSaveProp) {
                    const file = fileState.getFile(activeTabRef.current)
                    if (file) {
                      await onSaveProp(activeTabRef.current, file.content.modifiedContent)
                    }
                  }
                }
              }}
              onDelete={async () => {
                if (activeTabRef.current) {
                  const path = activeTabRef.current
                  handleDeleteFile(path)
                  if (onDeleteProp) {
                    await onDeleteProp(path)
                  }
                }
              }}
              onReady={handleEditorReady}
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
