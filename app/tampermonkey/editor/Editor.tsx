'use client'

import { useEffect, useRef, useState } from 'react'
import { useRequest } from 'ahooks'
import Stackblitz from '@stackblitz/sdk'
import type { Project, VM } from '@stackblitz/sdk'
import { CloudArrowUpIcon } from '@heroicons/react/16/solid'
import { extractMeta, prependMeta } from '@/services/tampermonkey/meta'
import { Spinner } from '@/components/Spinner'
import { updateFiles } from '@/app/api/scripts/actions'
import { ENTRY_SCRIPT_FILE, EXCLUDED_FILES, PACKAGE_FILE, TYPINGS_FILE } from '@/constants/file'
import { useBeforeUnload } from '@/hooks/useClient'

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
            if (file === PACKAGE_FILE || file === ENTRY_SCRIPT_FILE || file === TYPINGS_FILE) {
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
            if (file === PACKAGE_FILE || file === ENTRY_SCRIPT_FILE || file === TYPINGS_FILE) {
              return false
            }
            
            if (!content) return false
            
            const originalFile = inFiles[file]
            return originalFile && originalFile.content !== content
          })
          
          setHasUnsavedChanges(hasChanges)
        }
      } catch (error) {
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
    ;(async () => {
      if (!editorRef.current) {
        return
      }

      const files = Object.fromEntries(
        (function* () {
          for (const [file, { content, rawUrl }] of Object.entries(inFiles)) {
            if (file.endsWith('.json') || EXCLUDED_FILES.includes(file)) {
              yield [file, content]
              continue
            }

            const meta = extractMeta(content)
            yield [file, prependMeta(content, { ...meta, source: rawUrl })]
          }
        })()
      )

      const project: Project = { template: 'javascript', title: 'test', files }
      const vm = await Stackblitz.embedProject(editorRef.current, project, {
        view: 'editor',
        showSidebar: true,
      })

      setVM(vm)
    })()
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
      
      {hasUnsavedChanges && (
        <div className="fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-md shadow-lg">
          <span className="text-sm">Unsaved changes</span>
        </div>
      )}
    </div>
  )
}
