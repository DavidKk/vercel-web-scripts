'use client'

import type { Project, VM } from '@stackblitz/sdk'
import Stackblitz from '@stackblitz/sdk'
import { useRequest } from 'ahooks'
import { useEffect, useRef, useState } from 'react'

import { updateFiles } from '@/app/api/scripts/actions'
import { Spinner } from '@/components/Spinner'
import { ENTRY_SCRIPT_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { useBeforeUnload } from '@/hooks/useClient'
import { extractMeta, prependMeta } from '@/services/tampermonkey/meta'

import EditorHeader from './EditorHeader'

export interface EditorProps {
  files: Record<
    string,
    {
      content: string
      rawUrl: string
    }
  >
  scriptKey: string
}

export default function Editor(props: EditorProps) {
  const { files: inFiles, scriptKey } = props
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
    // Prevent duplicate initialization (React Strict Mode will mount twice)
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

      // Only set VM if component is still mounted
      if (isMounted) {
        setVM(vmInstance)
      } else {
        vmInstance = null
        isInitializedRef.current = false
      }
    })()

    // Cleanup function: destroy Stackblitz instance when component unmounts
    return () => {
      isMounted = false
      if (vmInstance) {
        vmInstance = null
      }
      isInitializedRef.current = false
    }
  }, [])

  return (
    <div className="w-screen h-screen flex flex-col bg-black">
      <EditorHeader scriptKey={scriptKey} onSave={save} isSaving={loading} />
      <div className="flex-1 relative">
        <div ref={editorRef} className="w-full h-full"></div>

        {!vm && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-8 h-8 flex items-center justify-center">
              <Spinner />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
