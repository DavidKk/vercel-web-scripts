'use client'

import { useEffect, useState } from 'react'

import CodeEditor from '@/components/Editor/CodeEditor'
import { Spinner } from '@/components/Spinner'

export default function PreviewPage() {
  const [message, setMessage] = useState<string>()
  const [fileData, setFileData] = useState<{ path: string; content: string } | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    const file = window.sessionStorage.getItem('preview#file')
    const content = window.sessionStorage.getItem('preview#content')
    if (!file || !content) {
      setMessage('No file or content found in session storage')
      setIsInitialized(true)
      return
    }

    setFileData({ path: file, content })
    setIsInitialized(true)
  }, [])

  const getFileLanguage = (filePath: string): 'javascript' | 'typescript' | 'json' => {
    if (filePath.endsWith('.json')) return 'json'
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript'
    return 'javascript'
  }

  return (
    <div className="w-screen h-[calc(100vh-60px-64px)] relative bg-black">
      {fileData ? (
        <CodeEditor content={fileData.content} path={fileData.path} language={getFileLanguage(fileData.path)} readOnly={false} />
      ) : isInitialized ? (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <p>{message || 'No preview available'}</p>
        </div>
      ) : (
        <div className="fixed w-8 h-8 top-0 left-0 right-0 bottom-0 m-auto">
          <span className="w-8 h-8 flex items-center justify-center">
            <Spinner />
          </span>
        </div>
      )}
    </div>
  )
}
