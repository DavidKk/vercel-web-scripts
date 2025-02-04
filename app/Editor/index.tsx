'use client'

import { useEffect, useRef } from 'react'
import { useRequest } from 'ahooks'
import Stackblitz from '@stackblitz/sdk'
import type { Project, VM } from '@stackblitz/sdk'
import { CloudArrowUpIcon } from '@heroicons/react/16/solid'
import { extractMeta, prependMeta } from '@/services/tampermonkey'
import { Spinner } from '@/components/Spinner'
import { updateFiles } from '@/app/api/scripts/actions'
import { ENTRY_SCRIPT_FILE, PACKAGE_FILE } from '@/constants/file'

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
  const vmRef = useRef<VM>(null)

  const { run: save, loading } = useRequest(
    async () => {
      if (!vmRef.current) {
        return
      }

      const snapshot = await vmRef.current.getFsSnapshot()
      if (!snapshot) {
        return
      }

      const needUpdateFiles = Array.from<{ file: string; content: string | null }>(
        (function* () {
          for (const [file, content] of Object.entries(snapshot)) {
            if (file === PACKAGE_FILE) {
              continue
            }

            if (!content) {
              continue
            }

            if (file.endsWith('.js')) {
              yield { file, content }
            }
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
    },
    {
      manual: true,
      throttleWait: 1e3,
    }
  )

  useEffect(() => {
    ;(async () => {
      if (!editorRef.current) {
        return
      }

      const files = Object.fromEntries(
        (function* () {
          for (const [file, { content, rawUrl }] of Object.entries(inFiles)) {
            const meta = extractMeta(content)
            yield [file, prependMeta(content, { ...meta, source: rawUrl })]
          }
        })()
      )

      const project: Project = { template: 'javascript', title: 'test', files }
      vmRef.current = await Stackblitz.embedProject(editorRef.current, project, {
        view: 'editor',
        showSidebar: true,
      })
    })()
  }, [])

  return (
    <div className="w-screen h-screen relative">
      <div ref={editorRef} className="w-full h-full"></div>
      <button disabled={loading} onClick={save} className="fixed bottom-10 right-2 px-6 py-4 bg-teal-400 text-white rounded-md shadow-lg disable:opacity-100">
        {loading ? <Spinner size={16} /> : <CloudArrowUpIcon />}
        <span>Save</span>
      </button>
    </div>
  )
}
