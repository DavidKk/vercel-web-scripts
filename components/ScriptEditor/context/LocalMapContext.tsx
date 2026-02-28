'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useNotification } from '@/components/Notification'
import { contentEqualsByHash, hashString } from '@/utils/hash'

import { useFileState } from '../context/FileStateContext'
import { useFileStorage } from '../hooks/useFileStorage'
import { generateConflictMarkers } from '../services/conflictResolution'
import { getFileAtPath, isLocalFileMapSupported, readFilesFromDirectoryWithHashes, requestLocalDirectory, writeFilesToDirectory } from '../services/localFileMap'
import { FileStatus } from '../types'
import { stripFileSystemAccessGlobalBlock } from '../utils/typingsForLocal'

/** File name for GM/GME typings written only to local; excluded from web editor and sync */
const LOCAL_TYPINGS_FILE = 'gm-globals.d.ts'

/** File name for tsconfig written only to local so IDE picks up gm-globals.d.ts; excluded from sync */
const LOCAL_TSCONFIG_FILE = 'tsconfig.json'

/** Default tsconfig for mapped local project: include all .ts and .d.ts so gm-globals.d.ts is used */
const LOCAL_TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts", "**/*.d.ts"]
}
`

/** One conflicting file: path, editor content, and local file content */
export interface LocalMapConflictItem {
  path: string
  editorContent: string
  localContent: string
}

/** Pending map-to-local state after user chooses action in conflict dialog */
interface PendingMapToLocal {
  handle: FileSystemDirectoryHandle
  filesToWrite: Record<string, string>
  filesToWriteToDisk: Record<string, string>
}

/** Notify type for local map feedback */
export type LocalMapNotifyType = 'success' | 'error' | 'warning'

export interface LocalMapContextValue {
  /** Whether File System Access API is supported */
  isLocalMapSupported: boolean
  /** Whether editor is in local-map mode (read-only, content from local) */
  isLocalMapMode: boolean
  /** Whether map/sync operation is in progress */
  isLocalMapBusy: boolean
  /** Timestamp when last sync from local completed; use to force editor refresh */
  lastSyncedAt: number
  /** Map current editor content to a local directory (init); then editor becomes read-only */
  onMapToLocal: () => Promise<void>
  /** Close local map and make editor editable again */
  onCloseLocalMap: () => void
}

const LocalMapContext = createContext<LocalMapContextValue | null>(null)

export interface LocalMapProviderProps {
  /** Storage key (same as ScriptEditor storageKey) for persisting after sync */
  storageKey: string
  /** Optional callback for success/error/warning messages */
  onNotify?: (type: LocalMapNotifyType, message: string) => void
  /** Optional typings (GME_*, GM_*) to write as gm-globals.d.ts when mapping to local */
  typingsForLocal?: string
  /** Optional callback when local files were synced (content changed and saved). Use e.g. to push to editor dev mode. */
  onLocalFilesSynced?: () => void
  children: React.ReactNode
}

/**
 * Provider for local file map: maps editor content to a local folder,
 * syncs local → editor state → IndexedDB. When in local map mode, editor is read-only.
 */
export function LocalMapProvider({ storageKey, onNotify, typingsForLocal, onLocalFilesSynced, children }: LocalMapProviderProps) {
  const fileState = useFileState()
  const { persist } = useFileStorage(storageKey)
  const notification = useNotification()
  const notificationRef = useRef(notification)
  notificationRef.current = notification
  const [isLocalMapSupported, setIsLocalMapSupported] = useState(false)
  const [isLocalMapMode, setIsLocalMapMode] = useState(false)
  const [localDirHandle, setLocalDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [isLocalMapBusy, setIsLocalMapBusy] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(0)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [conflictList, setConflictList] = useState<LocalMapConflictItem[]>([])
  const [pendingMapToLocal, setPendingMapToLocal] = useState<PendingMapToLocal | null>(null)
  const lastFileHashesRef = useRef<Record<string, string>>({})
  const isLocalMapBusyRef = useRef(isLocalMapBusy)
  isLocalMapBusyRef.current = isLocalMapBusy
  const localDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  localDirHandleRef.current = localDirHandle
  const fileStateRef = useRef(fileState)
  fileStateRef.current = fileState
  const persistRef = useRef(persist)
  persistRef.current = persist
  const onLocalFilesSyncedRef = useRef(onLocalFilesSynced)
  onLocalFilesSyncedRef.current = onLocalFilesSynced

  useEffect(() => {
    setIsLocalMapSupported(isLocalFileMapSupported())
  }, [])

  const finishMapToLocal = useCallback(
    async (
      handle: FileSystemDirectoryHandle,
      filesToWrite: Record<string, string>,
      filesToWriteToDisk: Record<string, string>,
      onProgress?: (current: number, total: number) => void
    ) => {
      await writeFilesToDirectory(handle, filesToWriteToDisk, onProgress)
      const hashEntries = await Promise.all(Object.entries(filesToWrite).map(async ([path, content]) => [path, await hashString(content)] as const))
      const initialHashes: Record<string, string> = Object.fromEntries(hashEntries)
      lastFileHashesRef.current = initialHashes
    },
    []
  )

  const onMapToLocal = useCallback(async () => {
    if (isLocalMapBusy || isLocalMapMode) return
    setIsLocalMapBusy(true)
    try {
      const handle = await requestLocalDirectory()
      if (!handle) {
        onNotify?.('warning', 'No folder selected or permission denied')
        return
      }
      // Do not enter local map mode yet; wait until all files are written (and conflict resolved if any).
      // Otherwise auto-sync would run before user chooses use-current vs use-local and overwrite editor.

      const WRITEABLE_STATUSES = [FileStatus.Unchanged, FileStatus.ModifiedUnsaved, FileStatus.ModifiedSaved]
      const filesToWrite: Record<string, string> = {}
      Object.values(fileState.files).forEach((file) => {
        if (WRITEABLE_STATUSES.includes(file.status)) {
          filesToWrite[file.path] = file.content.modifiedContent
        }
      })
      if (Object.keys(filesToWrite).length === 0) {
        onNotify?.('warning', 'No files to map')
        setLocalDirHandle(null)
        setIsLocalMapMode(false)
        return
      }
      const filesToWriteToDisk: Record<string, string> = { ...filesToWrite }
      // 强制注入最新的 tsconfig.json 与 gm-globals.d.ts，覆盖本地已有文件，便于本地 IDE 使用最新类型
      filesToWriteToDisk[LOCAL_TSCONFIG_FILE] = LOCAL_TSCONFIG_JSON
      if (typingsForLocal && typingsForLocal.trim() !== '') {
        filesToWriteToDisk[LOCAL_TYPINGS_FILE] = stripFileSystemAccessGlobalBlock(typingsForLocal)
      }

      const progress = notificationRef.current.loading('Checking and writing files...', { title: 'Map to local' })
      try {
        // Check for existing files: if content differs, collect conflicts (hash-based comparison)
        const conflicts: LocalMapConflictItem[] = []
        for (const [path, editorContent] of Object.entries(filesToWrite)) {
          const localFile = await getFileAtPath(handle, path)
          if (localFile) {
            const same = await contentEqualsByHash(editorContent, localFile)
            if (!same) {
              const localContent = await localFile.text()
              conflicts.push({ path, editorContent, localContent })
            }
          }
        }
        if (conflicts.length > 0) {
          progress.close()
          setPendingMapToLocal({ handle, filesToWrite, filesToWriteToDisk })
          setConflictList(conflicts)
          setConflictDialogOpen(true)
          return
        }
        await finishMapToLocal(handle, filesToWrite, filesToWriteToDisk, (c, t) => progress.updateProgress(t ? Math.round((c / t) * 100) : 0))
        setLocalDirHandle(handle)
        setIsLocalMapMode(true)
        onNotify?.('success', 'Mapped to local. Web editor is now read-only; changes will auto-sync from your local folder.')
      } catch (err) {
        progress.close()
        onNotify?.('error', `Map to local failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        setLocalDirHandle(null)
        setIsLocalMapMode(false)
      } finally {
        progress.close()
      }
    } catch (err) {
      onNotify?.('error', `Map to local failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLocalDirHandle(null)
      setIsLocalMapMode(false)
    } finally {
      setIsLocalMapBusy(false)
    }
  }, [fileState.files, finishMapToLocal, isLocalMapBusy, isLocalMapMode, onNotify, typingsForLocal])

  const handleConflictClose = useCallback(
    async (result: string | null) => {
      setConflictDialogOpen(false)
      const pending = pendingMapToLocal
      setPendingMapToLocal(null)
      setConflictList([])
      if (!pending || result === null || result === 'cancel') {
        setLocalDirHandle(null)
        setIsLocalMapMode(false)
        setIsLocalMapBusy(false)
        return
      }
      try {
        let filesToWrite = pending.filesToWrite
        let filesToWriteToDisk = pending.filesToWriteToDisk
        if (result === 'resolve') {
          const nextWrite = { ...pending.filesToWrite }
          const nextDisk = { ...pending.filesToWriteToDisk }
          for (const item of conflictList) {
            const merged = generateConflictMarkers(item.editorContent, item.localContent)
            nextWrite[item.path] = merged
            nextDisk[item.path] = merged
          }
          filesToWrite = nextWrite
          filesToWriteToDisk = nextDisk
        } else if (result === 'useLocal') {
          const nextWrite = { ...pending.filesToWrite }
          const nextDisk = { ...pending.filesToWriteToDisk }
          for (const item of conflictList) {
            delete nextWrite[item.path]
            delete nextDisk[item.path]
          }
          filesToWrite = nextWrite
          filesToWriteToDisk = nextDisk
        }
        // useCurrent: keep filesToWrite/filesToWriteToDisk as-is (editor wins)
        const progress = notificationRef.current.loading('Writing files to local folder...', { title: 'Map to local' })
        try {
          await finishMapToLocal(pending.handle, filesToWrite, filesToWriteToDisk, (c, t) => progress.updateProgress(t ? Math.round((c / t) * 100) : 0))
          setLocalDirHandle(pending.handle)
          setIsLocalMapMode(true)
          const successMsg =
            result === 'resolve'
              ? 'Mapped with conflict markers; resolve in local editor and sync.'
              : result === 'useLocal'
                ? 'Mapped to local; conflicting file(s) left unchanged.'
                : 'Mapped to local.'
          onNotify?.('success', successMsg)
        } finally {
          progress.close()
        }
      } catch (err) {
        onNotify?.('error', `Map to local failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setIsLocalMapBusy(false)
      }
    },
    [conflictList, finishMapToLocal, onNotify, pendingMapToLocal]
  )

  // Auto-sync: poll continuously regardless of window visibility; run one after another (no setInterval)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isLocalMapMode || !localDirHandle) {
      return
    }

    const POLL_INTERVAL_MS = 2000

    const runPoll = async () => {
      if (!localDirHandleRef.current) return
      if (isLocalMapBusyRef.current) {
        if (localDirHandleRef.current) pollTimeoutRef.current = setTimeout(runPoll, POLL_INTERVAL_MS)
        return
      }

      const handle = localDirHandleRef.current
      if (!handle) return

      const progress = notificationRef.current.loading('Comparing with local files...', { title: 'Syncing' })
      try {
        // Do not pass onProgress to avoid setState on every file (causes "Maximum update depth exceeded")
        const { contents, hashes } = await readFilesFromDirectoryWithHashes(handle, '')
        // Exclude typings and tsconfig: only for local IDE; web editor does not read/write them
        delete contents[LOCAL_TYPINGS_FILE]
        delete hashes[LOCAL_TYPINGS_FILE]
        delete contents[LOCAL_TSCONFIG_FILE]
        delete hashes[LOCAL_TSCONFIG_FILE]

        const lastHashes = lastFileHashesRef.current

        let hasChanges = false
        for (const [path, hash] of Object.entries(hashes)) {
          if (lastHashes[path] !== hash) {
            hasChanges = true
            break
          }
        }
        if (!hasChanges) {
          for (const path of Object.keys(lastHashes)) {
            if (!(path in hashes)) {
              hasChanges = true
              break
            }
          }
        }

        if (hasChanges) {
          const fs = fileStateRef.current
          for (const [path, content] of Object.entries(contents)) {
            const existing = fs.getFile(path)
            if (existing) {
              fs.updateFile(path, content)
            } else {
              fs.createFile(path, content)
            }
          }
          const localPaths = new Set(Object.keys(contents))
          Object.keys(fs.files).forEach((path) => {
            if (!localPaths.has(path) && fs.getFile(path)?.status !== FileStatus.Deleted) {
              fs.deleteFile(path)
            }
          })
          // Synced from local = saved state; show "变动已保存" (ModifiedSaved) in UI
          for (const path of Object.keys(contents)) {
            fs.markFileAsSaved(path)
          }
          await persistRef.current()
          lastFileHashesRef.current = hashes
          setLastSyncedAt(Date.now())
          onLocalFilesSyncedRef.current?.()
        } else {
          lastFileHashesRef.current = hashes
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[LocalMapProvider] Auto-sync poll error:', err)
      } finally {
        progress.close()
      }

      if (!localDirHandleRef.current) return
      pollTimeoutRef.current = setTimeout(runPoll, POLL_INTERVAL_MS)
    }

    runPoll()

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
    }
  }, [isLocalMapMode, localDirHandle])

  const onCloseLocalMap = useCallback(() => {
    localDirHandleRef.current = null
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    lastFileHashesRef.current = {}
    setLocalDirHandle(null)
    setIsLocalMapMode(false)
    onNotify?.('success', 'Local map closed. You can edit in the web editor again.')
  }, [onNotify])

  const value = useMemo<LocalMapContextValue>(
    () => ({
      isLocalMapSupported,
      isLocalMapMode,
      isLocalMapBusy,
      lastSyncedAt,
      onMapToLocal,
      onCloseLocalMap,
    }),
    [isLocalMapSupported, isLocalMapMode, isLocalMapBusy, lastSyncedAt, onMapToLocal, onCloseLocalMap]
  )

  return (
    <LocalMapContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={conflictDialogOpen}
        onClose={handleConflictClose}
        title="Local file differs from editor content"
        buttonSize="sm"
        message={
          <span>
            The following file(s) already exist locally with different content. Choose an action:
            <ul className="mt-2 list-disc list-inside text-[#858585] space-y-0.5">
              {conflictList.map((c) => (
                <li key={c.path}>{c.path}</li>
              ))}
            </ul>
          </span>
        }
        buttons={[
          { label: 'Use current', value: 'useCurrent', variant: 'primary' },
          { label: 'Use local', value: 'useLocal' },
          { label: 'Resolve conflict', value: 'resolve' },
          { label: 'Cancel', value: 'cancel' },
        ]}
      />
    </LocalMapContext.Provider>
  )
}

export function useLocalMap(): LocalMapContextValue | null {
  return useContext(LocalMapContext)
}
