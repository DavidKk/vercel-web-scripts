import { FileStatus } from '@/components/ScriptEditor/types'

import { createFileStateProvider } from './context/FileStateContext.spec'
import { createLayoutProvider } from './context/LayoutContext.spec'
import { createTabBarProvider } from './context/TabBarContext.spec'

/**
 * Helper to create and test ScriptEditorContent logic
 * Directly tests the orchestration without React DOM
 */
function createScriptEditorContentScenario(initialFiles?: Record<string, string>) {
  const fileState = createFileStateProvider(initialFiles)
  const tabBar = createTabBarProvider(fileState)
  const layout = createLayoutProvider()

  // Simulate ScriptEditorContent orchestration logic

  const handleSelectFile = (path: string) => {
    tabBar.openTab(path)
  }

  const handleDeleteFile = (path: string) => {
    fileState.deleteFile(path)
    if (tabBar.activeTab === path) {
      tabBar.closeTab(path)
    }
  }

  const handleAddFile = (fileName: string) => {
    fileState.createFile(fileName, '')
    tabBar.openTab(fileName)
  }

  const handleRenameFile = (oldPath: string, newPath: string) => {
    fileState.renameFile(oldPath, newPath)
    if (tabBar.isTabOpen(oldPath)) {
      tabBar.closeTab(oldPath)
      tabBar.openTab(newPath)
    }
  }

  const handleContentChange = (content: string) => {
    if (tabBar.activeTab) {
      fileState.updateFile(tabBar.activeTab, content)
    }
  }

  const handleSaveFile = () => {
    if (tabBar.activeTab) {
      fileState.markFileAsSaved(tabBar.activeTab)
    }
  }

  return {
    fileState,
    tabBar,
    layout,
    handleSelectFile,
    handleDeleteFile,
    handleAddFile,
    handleRenameFile,
    handleContentChange,
    handleSaveFile,
  }
}

describe('ScriptEditorContent Logic', () => {
  it('should handle file selection and tab updates', () => {
    const scenario = createScriptEditorContentScenario({ 'file1.ts': 'content1' })

    scenario.handleSelectFile('file1.ts')
    expect(scenario.tabBar.activeTab).toBe('file1.ts')
    expect(scenario.tabBar.isTabOpen('file1.ts')).toBe(true)
  })

  it('should handle file deletion and close tab if active', () => {
    const scenario = createScriptEditorContentScenario({ 'file1.ts': 'content1' })

    scenario.handleSelectFile('file1.ts')
    scenario.handleDeleteFile('file1.ts')

    expect(scenario.fileState.getFileStatus('file1.ts')).toBe(FileStatus.Deleted)
    expect(scenario.tabBar.activeTab).toBeNull()
    expect(scenario.tabBar.getTabCount()).toBe(0)
  })

  it('should handle file renaming and update tabs', () => {
    const scenario = createScriptEditorContentScenario({ 'file1.ts': 'content1' })

    scenario.handleSelectFile('file1.ts')
    scenario.handleRenameFile('file1.ts', 'file2.ts')

    expect(scenario.fileState.getFile('file1.ts')).toBeUndefined()
    expect(scenario.fileState.getFile('file2.ts')).toBeDefined()
    expect(scenario.tabBar.activeTab).toBe('file2.ts')
    expect(scenario.tabBar.isTabOpen('file1.ts')).toBe(false)
    expect(scenario.tabBar.isTabOpen('file2.ts')).toBe(true)
  })

  it('should handle content changes and update file status', () => {
    const scenario = createScriptEditorContentScenario({ 'file1.ts': 'content1' })

    scenario.handleSelectFile('file1.ts')
    scenario.handleContentChange('modified content')

    expect(scenario.fileState.getFileStatus('file1.ts')).toBe(FileStatus.ModifiedUnsaved)
    expect(scenario.fileState.getFile('file1.ts')?.content.modifiedContent).toBe('modified content')
  })

  it('should handle save action and update file status', () => {
    const scenario = createScriptEditorContentScenario({ 'file1.ts': 'content1' })

    scenario.handleSelectFile('file1.ts')
    scenario.handleContentChange('modified content')
    scenario.handleSaveFile()

    expect(scenario.fileState.getFileStatus('file1.ts')).toBe(FileStatus.ModifiedSaved)
    expect(scenario.fileState.getFile('file1.ts')?.content.originalContent).toBe('modified content')
  })

  it('should integrate with layout panel toggling', () => {
    const scenario = createScriptEditorContentScenario()

    scenario.layout.toggleRightPanel('ai')
    expect(scenario.layout.rightPanelType).toBe('ai')
    expect(scenario.layout.isRightPanelOpen()).toBe(true)

    scenario.layout.toggleRightPanel('ai')
    expect(scenario.layout.rightPanelType).toBeNull()
    expect(scenario.layout.isRightPanelOpen()).toBe(false)
  })
})
