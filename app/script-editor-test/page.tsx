'use client'

import { ScriptEditor, tabBarStorageService, useFileState, useFileStorage, useTabBar } from '@/components/ScriptEditor'

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
    <div className="w-screen h-screen">
      <ScriptEditor
        initialFiles={initialFiles}
        storageKey="script-editor-test"
        layoutStorageKey="script-editor-test-layout"
        title="ScriptEditor Test Page"
        headerActions={<TestPageHeaderActions />}
        // eslint-disable-next-line no-console
        onReady={() => console.log('🚀 ScriptEditor is ready!')}
      />
    </div>
  )
}

/**
 * Component for custom header actions in the test page
 * This component is rendered inside ScriptEditor's providers, so it can use hooks
 */
function TestPageHeaderActions() {
  const fileState = useFileState()
  const fileStorage = useFileStorage('script-editor-test')
  const tabBar = useTabBar()
  const hasUnsavedChanges = fileState.hasAnyUnsavedChanges()

  /**
   * Handle save all
   */
  async function handleSaveAll() {
    await fileStorage.saveAllFiles()
  }

  /**
   * Handle save current file
   */
  async function handleSave() {
    if (tabBar.activeTab) {
      await fileStorage.saveFile(tabBar.activeTab)
    }
  }

  /**
   * Handle test tab bar storage
   */
  async function handleTestTabBarStorage() {
    try {
      await tabBarStorageService.saveTabBarState(tabBar.openTabs, tabBar.activeTab)
      const loadedState = await tabBarStorageService.loadTabBarState()
      const message = `TabBar Storage Test:\n\nCurrent State:\n- Open tabs: ${tabBar.openTabs.join(', ') || 'none'}\n- Active tab: ${tabBar.activeTab || 'none'}\n\nLoaded State:\n- Open tabs: ${loadedState?.openTabs.join(', ') || 'none'}\n- Active tab: ${loadedState?.activeTab || 'none'}`
      alert(message)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Test TabBar Storage] Error:', error)
      alert(`Error testing TabBar storage: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Handle clear storage
   */
  async function handleClearStorage() {
    try {
      await tabBarStorageService.clearTabBarState()
      window.location.reload()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Clear Storage] Error:', error)
      alert(`Error clearing storage: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <>
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
      <div className="text-xs text-[#858585] mx-2">Storage: {fileStorage.isInitialized ? 'Ready' : 'Loading...'}</div>
      <button onClick={handleTestTabBarStorage} className="px-3 py-1.5 text-xs bg-[#3e3e42] hover:bg-[#007acc] rounded transition-colors" title="Test TabBar Storage">
        Test Storage
      </button>
      <button onClick={handleClearStorage} className="px-3 py-1.5 text-xs bg-[#3e3e42] hover:bg-[#ce3c3c] rounded transition-colors" title="Clear All Storage">
        Clear
      </button>
    </>
  )
}
