'use client'

import { ArrowLeftEndOnRectangleIcon, ArrowPathRoundedSquareIcon } from '@heroicons/react/16/solid'
import FeatherIcon from 'feather-icons-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Spinner } from '@/components/Spinner'

interface EditorHeaderProps {
  scriptKey: string
  onSave: () => void
  isSaving: boolean
  isEditorDevMode: boolean
  onToggleEditorDevMode: () => void
}

/**
 * Editor header component with exit, update, and save buttons
 */
export default function EditorHeader({ scriptKey, onSave, isSaving, isEditorDevMode, onToggleEditorDevMode }: EditorHeaderProps) {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)

  /**
   * Handle update button click - check script validity before opening
   */
  const handleUpdate = async () => {
    if (isChecking || isSaving) {
      return
    }

    setIsChecking(true)

    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://vercel-web-scripts.vercel.app'
      const userUrl = `${baseUrl}/static/${scriptKey}/tampermonkey.user.js`
      const fallback = `${baseUrl}/static/${scriptKey}/tampermonkey.js`

      // Check if tampermonkey.user.js exists
      const response = await fetch(userUrl, { method: 'HEAD' })
      const url = response.ok ? userUrl : fallback

      window.open(url, '_blank', 'noopener')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error checking script:', error)
      // Fallback to opening the default URL even if check fails
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://vercel-web-scripts.vercel.app'
      const fallback = `${baseUrl}/static/${scriptKey}/tampermonkey.js`
      window.open(fallback, '_blank', 'noopener')
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <header className="h-12 bg-[#1e1e1e] border-b border-[#3e3e3e] flex items-center justify-between px-4 sticky top-0 z-50">
      {/* Left: Exit button */}
      <button
        onClick={() => router.push('/tampermonkey')}
        disabled={isSaving}
        className="flex items-center gap-2 px-3 py-1.5 text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
        title="Exit editor"
      >
        <ArrowLeftEndOnRectangleIcon className="w-4 h-4" />
        <span className="text-sm">Exit</span>
      </button>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-2">
        {/* Editor Dev Mode toggle */}
        <button
          onClick={onToggleEditorDevMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${
            isEditorDevMode ? 'bg-[#059669] text-white hover:bg-[#047857]' : 'text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d]'
          }`}
          title={isEditorDevMode ? 'Disable editor dev mode' : 'Enable editor dev mode'}
        >
          <FeatherIcon icon={isEditorDevMode ? 'play' : 'play-circle'} className="w-4 h-4" />
          <span className="text-sm">Dev Mode</span>
        </button>

        {/* Update button */}
        <button
          onClick={handleUpdate}
          disabled={isSaving || isChecking}
          className="flex items-center gap-2 px-3 py-1.5 text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
          title="Open script update link"
        >
          {isChecking ? (
            <>
              <span className="w-4 h-4 flex items-center justify-center">
                <Spinner />
              </span>
              <span className="text-sm">Checking...</span>
            </>
          ) : (
            <>
              <ArrowPathRoundedSquareIcon className="w-4 h-4" />
              <span className="text-sm">Update</span>
            </>
          )}
        </button>

        {/* Save button */}
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-1.5 bg-[#0e639c] text-white hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
          title="Save changes"
        >
          {isSaving ? (
            <>
              <span className="w-4 h-4 flex items-center justify-center">
                <Spinner />
              </span>
              <span className="text-sm">Saving...</span>
            </>
          ) : (
            <>
              <FeatherIcon icon="save" className="w-4 h-4" />
              <span className="text-sm">Save</span>
            </>
          )}
        </button>
      </div>
    </header>
  )
}
