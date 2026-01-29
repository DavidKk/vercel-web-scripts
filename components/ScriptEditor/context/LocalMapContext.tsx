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
  children: React.ReactNode
}

/**
 * Provider for local file map: maps editor content to a local folder,
 * syncs local → editor state → IndexedDB. When in local map mode, editor is read-only.
 */
export function LocalMapProvider({ storageKey, onNotify, typingsForLocal, children }: LocalMapProviderProps) {
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
      onNotify?.('success', 'Mapped to local. Web editor is now read-only; changes will auto-sync from your local folder.')
    },
    [onNotify]
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
      // As soon as user confirms directory, disable editor (no edit/delete) and treat local as source of truth
      setLocalDirHandle(handle)
      setIsLocalMapMode(true)

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
        }
        const progress = notificationRef.current.loading('Writing files to local folder...', { title: 'Map to local' })
        try {
          await finishMapToLocal(pending.handle, filesToWrite, filesToWriteToDisk, (c, t) => progress.updateProgress(t ? Math.round((c / t) * 100) : 0))
          onNotify?.('success', result === 'resolve' ? 'Mapped with conflict markers; resolve in local editor and sync.' : 'Mapped to local.')
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

  // Auto-sync: poll only when window is visible; run one after another (no setInterval)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isLocalMapMode || !localDirHandle) {
      return
    }

    const POLL_INTERVAL_MS = 2000

    const runPoll = async () => {
      if (!localDirHandleRef.current) return
      if (document.hidden) {
        if (localDirHandleRef.current) pollTimeoutRef.current = setTimeout(runPoll, POLL_INTERVAL_MS)
        return
      }
      if (isLocalMapBusyRef.current) {
        if (localDirHandleRef.current) pollTimeoutRef.current = setTimeout(runPoll, POLL_INTERVAL_MS)
        return
      }

      const handle = localDirHandleRef.current
      if (!handle) return

      const progress = notificationRef.current.loading('Comparing with local files...', { title: 'Syncing' })
      try {
        const { contents, hashes } = await readFilesFromDirectoryWithHashes(handle, '', (c, t) => progress.updateProgress(t ? Math.round((c / t) * 100) : 0))
        // Exclude typings file: only for local IDE; web editor does not read/write it
        delete contents[LOCAL_TYPINGS_FILE]
        delete hashes[LOCAL_TYPINGS_FILE]

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
          for (const [path, content] of Object.entries(contents)) {
            const existing = fileState.getFile(path)
            if (existing) {
              fileState.updateFile(path, content)
            } else {
              fileState.createFile(path, content)
            }
          }
          const localPaths = new Set(Object.keys(contents))
          Object.keys(fileState.files).forEach((path) => {
            if (!localPaths.has(path) && fileState.getFile(path)?.status !== FileStatus.Deleted) {
              fileState.deleteFile(path)
            }
          })
          // Synced from local = saved state; show "变动已保存" (ModifiedSaved) in UI
          for (const path of Object.keys(contents)) {
            fileState.markFileAsSaved(path)
          }
          await persist()
          lastFileHashesRef.current = hashes
          setLastSyncedAt(Date.now())
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
  }, [isLocalMapMode, localDirHandle, fileState, persist])

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
        title="本地文件与编辑器内容不一致"
        message={
          <span>
            以下文件在本地已存在且内容不同，请选择处理方式：
            <ul className="mt-2 list-disc list-inside text-[#858585] space-y-0.5">
              {conflictList.map((c) => (
                <li key={c.path}>{c.path}</li>
              ))}
            </ul>
          </span>
        }
        buttons={[
          { label: '覆盖', value: 'overwrite', variant: 'primary' },
          { label: '解决冲突', value: 'resolve' },
          { label: '取消', value: 'cancel' },
        ]}
      />
    </LocalMapContext.Provider>
  )
}

export function useLocalMap(): LocalMapContextValue | null {
  return useContext(LocalMapContext)
}
