'use client'

import { ScriptEditor, tabBarStorageService, useFileState, useFileStorage, useLayout, useTabBar } from '@/components/ScriptEditor'

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
        renderRightPanel={(panelType) => (
          <div className="h-full flex flex-col p-4 bg-[#252526]">
            <h3 className="text-sm font-semibold mb-4 text-[#abb2bf]">Mock {panelType.toUpperCase()} Panel</h3>
            <div className="flex-1 text-xs text-[#858585] space-y-2">
              <p>This is an extensible side panel.</p>
              <p>
                Active Panel: <span className="text-[#61afef]">{panelType}</span>
              </p>
              <div className="mt-4 p-3 bg-[#1e1e1e] border border-[#3e3e42] rounded">
                <p>Side panels have access to:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Editor state</li>
                  <li>File history</li>
                  <li>Shared layout</li>
                </ul>
              </div>
            </div>
          </div>
        )}
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
  const layout = useLayout()
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
        onClick={() => layout.toggleRightPanel('ai')}
        className={`px-3 py-1.5 text-xs rounded transition-colors ${layout.rightPanelType === 'ai' ? 'bg-[#007acc] text-white' : 'bg-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52]'}`}
      >
        AI Panel
      </button>
      <button
        onClick={() => layout.toggleRightPanel('rules')}
        className={`px-3 py-1.5 text-xs rounded transition-colors ${
          layout.rightPanelType === 'rules' ? 'bg-[#007acc] text-white' : 'bg-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52]'
        }`}
      >
        Rules
      </button>
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
