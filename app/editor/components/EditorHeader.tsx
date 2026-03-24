'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FiChevronDown, FiLogOut, FiPlay, FiPlayCircle, FiUser, FiZap } from 'react-icons/fi'
import { IoExtensionPuzzleOutline } from 'react-icons/io5'
import { LuAsterisk } from 'react-icons/lu'
import { MdOutlineCloudUpload, MdOutlineKeyboard } from 'react-icons/md'

import { Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'

import { EditorIntegrationModals } from './EditorIntegrationModals'
import { ShortcutsHelpModal } from './ShortcutsHelpModal'

const iconBtn = 'p-2 rounded text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

interface EditorHeaderProps {
  scriptKey: string
  displayUsername: string
  onSave: () => void
  isSaving: boolean
  isEditorDevMode: boolean
  onToggleEditorDevMode: () => void
  isCompiling: boolean
  onToggleAI?: () => void
  isAIOpen?: boolean
  isAIDisabled?: boolean
  onToggleRules?: () => void
  isRulesOpen?: boolean
}

/**
 * Editor header: brand left, integration + tool icons, user menu with logout on the right.
 */
export default function EditorHeader({
  scriptKey,
  displayUsername,
  onSave,
  isSaving,
  isEditorDevMode,
  onToggleEditorDevMode,
  isCompiling,
  onToggleAI,
  isAIOpen = false,
  isAIDisabled = false,
  onToggleRules,
  isRulesOpen = false,
}: EditorHeaderProps) {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userMenuOpen) return
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [userMenuOpen])

  const handleInstall = async () => {
    if (isChecking || isSaving) return
    setIsChecking(true)
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://vercel-web-scripts.vercel.app'
    const userUrl = `${baseUrl}/static/${scriptKey}/tampermonkey.user.js`
    try {
      const res = await fetch(userUrl, { method: 'HEAD' })
      if (res.ok) {
        window.open(userUrl, '_blank', 'noopener')
      } else {
        window.alert('Script is not ready. Please check compilation or try again later.')
      }
    } catch {
      window.alert('Could not validate script. Check network and try again.')
    } finally {
      setIsChecking(false)
    }
  }

  const handleLogout = async () => {
    if (isSaving) return
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Logout failed:', error)
      router.push('/')
    }
  }

  return (
    <header className="h-11 bg-[#1e1e1e] border-b border-[#2d2d2d] flex items-center gap-2 px-3 sticky top-0 z-50">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <Image src="/logo.png" alt="MagickMonkey logo" width={24} height={24} className="rounded-sm shrink-0" priority />
        <span className="text-sm text-[#e0e0e0] font-medium truncate hidden sm:inline">MagickMonkey</span>
      </div>

      <div className="flex-1 min-w-2" />

      <EditorIntegrationModals />

      <div className="flex items-center gap-0.5 shrink-0">
        <Tooltip content="Keyboard shortcuts" placement="bottom">
          <button type="button" onClick={() => setShortcutsHelpOpen(true)} className={iconBtn} aria-label="Keyboard shortcuts">
            <MdOutlineKeyboard className="w-4 h-4" />
          </button>
        </Tooltip>

        {onToggleRules && (
          <Tooltip content={isRulesOpen ? 'Close URL rules' : 'URL rules'} placement="bottom">
            <button
              type="button"
              onClick={onToggleRules}
              disabled={isSaving}
              className={`${iconBtn} ${isRulesOpen ? 'bg-[#0e639c] text-white hover:bg-[#1177bb]' : ''}`}
              aria-label="URL rules"
            >
              <LuAsterisk className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        {onToggleAI && (
          <Tooltip content={isAIOpen ? 'Close AI panel' : 'AI rewrite'} placement="bottom">
            <button
              type="button"
              onClick={onToggleAI}
              disabled={isSaving || isAIDisabled}
              className={`${iconBtn} ${isAIOpen ? 'bg-[#0e639c] text-white hover:bg-[#1177bb]' : ''}`}
              aria-label="AI rewrite"
            >
              <FiZap className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        <Tooltip content={isCompiling ? 'Compiling' : isEditorDevMode ? 'Disable dev mode' : 'Editor dev mode'} placement="bottom">
          <button
            type="button"
            onClick={onToggleEditorDevMode}
            disabled={isCompiling}
            className={`${iconBtn} ${isEditorDevMode ? 'bg-[#059669] text-white hover:bg-[#047857]' : ''}`}
            aria-label="Editor dev mode"
          >
            {isCompiling ? (
              <span className="w-4 h-4 flex items-center justify-center">
                <Spinner />
              </span>
            ) : isEditorDevMode ? (
              <FiPlay className="w-4 h-4" />
            ) : (
              <FiPlayCircle className="w-4 h-4" />
            )}
          </button>
        </Tooltip>

        <Tooltip content="Install userscript" placement="bottom">
          <button type="button" onClick={handleInstall} disabled={isSaving || isChecking} className={iconBtn} aria-label="Install userscript">
            {isChecking ? (
              <span className="w-4 h-4 flex items-center justify-center">
                <Spinner />
              </span>
            ) : (
              <IoExtensionPuzzleOutline className="w-4 h-4" />
            )}
          </button>
        </Tooltip>

        <Tooltip content="Publish to Gist" placement="bottom">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className={`${iconBtn} bg-[#0e639c] text-white hover:bg-[#1177bb] disabled:opacity-50`}
            aria-label="Publish to Gist"
          >
            {isSaving ? (
              <span className="w-4 h-4 flex items-center justify-center">
                <Spinner />
              </span>
            ) : (
              <MdOutlineCloudUpload className="w-4 h-4" />
            )}
          </button>
        </Tooltip>
      </div>

      <div className="relative shrink-0 pl-2 border-l border-[#2d2d2d] ml-1" ref={userMenuRef}>
        <Tooltip content="Account" placement="bottom">
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] disabled:opacity-50"
            aria-label="Account"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <FiUser className="w-4 h-4 shrink-0" />
            <FiChevronDown className={`w-3 h-3 shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </Tooltip>
        {userMenuOpen ? (
          <div className="absolute right-0 top-full mt-1 py-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg min-w-[180px] z-[70]" role="menu">
            <div className="px-3 py-2 text-xs text-[#a0a0a0] border-b border-[#3c3c3c] truncate" title={displayUsername}>
              {displayUsername}
            </div>
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#e0e0e0] hover:bg-[#2d2d2d] text-left"
              onClick={() => {
                setUserMenuOpen(false)
                void handleLogout()
              }}
            >
              <FiLogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        ) : null}
      </div>

      <ShortcutsHelpModal open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
    </header>
  )
}
