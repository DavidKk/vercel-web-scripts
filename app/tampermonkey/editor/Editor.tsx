'use client'

import { CloudArrowUpIcon } from '@heroicons/react/16/solid'
import type { Project, VM } from '@stackblitz/sdk'
import Stackblitz from '@stackblitz/sdk'
import { useRequest } from 'ahooks'
import { useEffect, useRef, useState } from 'react'

import { updateFiles } from '@/app/api/scripts/actions'
import { Spinner } from '@/components/Spinner'
import { ENTRY_SCRIPT_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { useBeforeUnload } from '@/hooks/useClient'
import { extractMeta, prependMeta } from '@/services/tampermonkey/meta'

export interface EditorProps {
  files: Record<
    string,
    {
      content: string
      rawUrl: string
    }
  >
}

export default function Editor(props: EditorProps) {
  const { files: inFiles } = props
  const editorRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)
  const [vm, setVM] = useState<VM>()
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Use custom hook to handle page leave confirmation
  useBeforeUnload(hasUnsavedChanges, 'You have unsaved changes. Are you sure you want to leave?')

  const { run: save, loading } = useRequest(
    async () => {
      if (!vm) {
        return
      }

      const snapshot = await vm.getFsSnapshot()
      if (!snapshot) {
        return
      }

      const needUpdateFiles = Array.from<{ file: string; content: string | null }>(
        (function* () {
          for (const [file, content] of Object.entries(snapshot)) {
            if (file === ENTRY_SCRIPT_FILE) {
              continue
            }

            if (!content) {
              continue
            }

            yield { file, content }
          }
        })()
      )

      Object.entries(inFiles).forEach(([file]) => {
        if (needUpdateFiles.some(({ file: f }) => f === file)) {
          return
        }

        needUpdateFiles.push({ file, content: null })
      })

      await updateFiles(...needUpdateFiles)
      setHasUnsavedChanges(false)
    },
    {
      manual: true,
      throttleWait: 1e3,
    }
  )

  // Monitor editor content changes
  useEffect(() => {
    if (!vm) return

    const checkForChanges = async () => {
      try {
        const snapshot = await vm.getFsSnapshot()
        if (snapshot) {
          // Check if any file content has changed
          const hasChanges = Object.entries(snapshot).some(([file, content]) => {
            if (file === ENTRY_SCRIPT_FILE) {
              return false
            }

            if (!content) return false

            const originalFile = inFiles[file]
            return originalFile && originalFile.content !== content
          })

          setHasUnsavedChanges(hasChanges)
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error checking for changes:', error)
      }
    }

    // Check for changes periodically
    const interval = setInterval(checkForChanges, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [vm, inFiles])

  useEffect(() => {
    // 防止重复初始化（React Strict Mode 会双重挂载）
    if (isInitializedRef.current) {
      return
    }

    let isMounted = true
    let vmInstance: VM | null = null

    ;(async () => {
      if (!editorRef.current) {
        return
      }

      isInitializedRef.current = true

      const files = Object.fromEntries(
        (function* () {
          for (const [file, { content, rawUrl }] of Object.entries(inFiles)) {
            if (!SCRIPTS_FILE_EXTENSION.some((ext) => file.endsWith(ext))) {
              yield [file, content]
              continue
            }

            const meta = extractMeta(content)
            yield [file, prependMeta(content, { ...meta, source: rawUrl })]
          }
        })()
      )

      const project: Project = { template: 'javascript', title: 'test', files }
      if (!document.body.contains(editorRef.current)) {
        return
      }

      vmInstance = await Stackblitz.embedProject(editorRef.current, project, {
        view: 'editor',
        showSidebar: true,
      })

      // 只有在组件仍然挂载时才设置 VM
      if (isMounted) {
        setVM(vmInstance)
      } else {
        vmInstance = null
        isInitializedRef.current = false
      }
    })()

    // 清理函数：组件卸载时销毁 Stackblitz 实例
    return () => {
      isMounted = false
      if (vmInstance) {
        vmInstance = null
      }
      isInitializedRef.current = false
    }
  }, [])

  return (
    <div className="w-screen h-[calc(100vh-60px-64px)] relative bg-black">
      <div ref={editorRef} className="w-full h-full"></div>

      {!vm ? (
        <div className="fixed w-8 h-8 top-0 left-0 right-0 bottom-0 m-auto">
          <span className="w-8 h-8 flex items-center justify-center">
            <Spinner />
          </span>
        </div>
      ) : (
        <button
          disabled={loading}
          onClick={save}
          className="fixed bottom-10 right-2 px-6 py-4 bg-teal-400 text-white rounded-md shadow-lg disable:opacity-100 flex flex-col items-center"
        >
          <span className="w-8 h-8 flex items-center justify-center">{loading ? <Spinner /> : <CloudArrowUpIcon />}</span>
          <span>Save</span>
        </button>
      )}
    </div>
  )
}
