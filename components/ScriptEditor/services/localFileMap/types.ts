'use client'

/**
 * Local file map types.
 * File System Access API type augmentations and window extensions (Chromium only).
 */

declare global {
  interface FileSystemHandle {
    readonly kind: 'file' | 'directory'
  }
  interface FileSystemDirectoryHandle extends FileSystemHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
  }
  interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>
  }
}

/** Window with optional File System Access API (Chromium only) */
export interface WindowWithPicker {
  showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
}
