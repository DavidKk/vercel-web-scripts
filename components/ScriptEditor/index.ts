/**
 * ScriptEditor module exports
 */

export { default as FileListPanel, type FileListPanelProps } from './components/FileListPanel'
export { default as TabBar, type TabBarProps } from './components/TabBar'
export { type FileStateContextValue, FileStateProvider, type FileStateProviderProps, useFileState } from './context/FileStateContext'
export { type TabBarContextValue, TabBarProvider, type TabBarProviderProps, type TabInfo, useTabBar as useTabBarContext } from './context/TabBarContext'
export { useFileStorage } from './hooks/useFileStorage'
export { useTabBar } from './hooks/useTabBar'
export { FileStorageService, fileStorageService } from './services/fileStorage'
export { IndexedDBService, indexedDBService, OBJECT_STORES } from './services/indexedDBService'
export { TabBarStorageService, tabBarStorageService } from './services/tabBarStorage'
export type { FileContent, FileMetadata, FileStateRecord } from './types'
export { FileStatus } from './types'
