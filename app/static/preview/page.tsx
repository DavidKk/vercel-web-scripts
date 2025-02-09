'use client'

import { useEffect, useRef, useState } from 'react'
import Stackblitz from '@stackblitz/sdk'
import type { Project, VM } from '@stackblitz/sdk'
import { Spinner } from '@/components/Spinner'

export default function PreviewPage() {
  const previewRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState<string>()
  const [vm, setVM] = useState<VM>()

  useEffect(() => {
    ;(async () => {
      const file = window.sessionStorage.getItem('preview#file')
      const content = window.sessionStorage.getItem('preview#content')
      if (!file || !content) {
        setMessage('No file or content found in session storage')
        return
      }

      if (!previewRef.current) {
        return
      }

      const files = {
        [file]: content,
      }

      const project: Project = { template: 'javascript', title: 'Preview', files }
      const vm = await Stackblitz.embedProject(previewRef.current, project, {
        view: 'editor',
        showSidebar: false,
        openFile: file,
      })

      setVM(vm)
    })()
  }, [])

  return (
    <div className="w-screen h-screen relative bg-black">
      <div ref={previewRef} className="w-full h-full"></div>
      {message ? <p className="text-white text-center">{message}</p> : null}

      {!vm && (
        <div className="fixed w-8 h-8 top-0 left-0 right-0 bottom-0 m-auto">
          <span className="w-8 h-8 flex items-center justify-center">
            <Spinner />
          </span>
        </div>
      )}
    </div>
  )
}
