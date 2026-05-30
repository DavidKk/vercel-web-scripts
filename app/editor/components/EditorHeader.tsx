'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FiChevronDown, FiLogOut, FiPlay, FiPlayCircle, FiUser, FiZap } from 'react-icons/fi'
import { IoExtensionPuzzleOutline } from 'react-icons/io5'
import { LuAsterisk } from 'react-icons/lu'
import { MdOutlineCloudUpload, MdOutlineKeyboard } from 'react-icons/md'
import { SiTampermonkey } from 'react-icons/si'

import { Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { CHROME_EXTENSION_ZIP_FILENAME, CHROME_EXTENSION_ZIP_PATH } from '@/shared/chrome-extension-download'

import { EditorIntegrationModals } from './EditorIntegrationModals'
import { ShortcutsHelpModal } from './ShortcutsHelpModal'

const iconBtnBase = 'p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
const iconBtn = `${iconBtnBase} text-[#e6eaf0] hover:text-white hover:bg-[#2a303a]`
/** Logo blue gradient — used for Push to Cloud */
const iconBtnActiveBrand = `${iconBtnBase} bg-gradient-to-br from-[#1769fb] to-[#52acff] text-white hover:from-[#0f59e3] hover:to-[#3385fa] hover:text-white`
const iconBtnActiveGreen = `${iconBtnBase} bg-[#22c55e] text-white hover:bg-[#16a34a] hover:text-white`
const iconBtnActiveBlue = `${iconBtnBase} bg-[#3b82f6] text-white hover:bg-[#2563eb] hover:text-white`
/** Connected extension — blue to purple gradient */
const iconBtnActiveExtension = `${iconBtnBase} bg-gradient-to-br from-[#2563eb] to-[#8b5cf6] text-white hover:from-[#1d4ed8] hover:to-[#7c3aed] hover:text-white`
const EXTENSION_WEB_SOURCE = 'magickmonkey-web'
const EXTENSION_RESPONSE_SOURCE = 'magickmonkey-extension'

type ExtensionConnectState = 'checking' | 'not_installed' | 'available' | 'connected' | 'connecting' | 'error'

interface ExtensionBridgeResponse {
  ok?: boolean
  installed?: boolean
  connected?: boolean
  error?: string
  extensionVersion?: string
}

function requestExtensionBridge(
  type: 'MAGICKMONKEY_EXTENSION_PING' | 'MAGICKMONKEY_CONNECT_EXTENSION',
  payload: { baseUrl: string; scriptKey: string; developMode?: boolean },
  timeoutMs = 1200
) {
  return new Promise<ExtensionBridgeResponse>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Browser window is unavailable.'))
      return
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const expectedType = type === 'MAGICKMONKEY_EXTENSION_PING' ? 'MAGICKMONKEY_EXTENSION_PONG' : 'MAGICKMONKEY_CONNECT_EXTENSION_RESULT'
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('MagickMonkey extension is not installed or not active on this page.'))
    }, timeoutMs)

    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') {
        return
      }
      const data = event.data as { source?: unknown; type?: unknown; requestId?: unknown; payload?: unknown }
      if (data.source !== EXTENSION_RESPONSE_SOURCE || data.type !== expectedType || data.requestId !== requestId) {
        return
      }
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve((data.payload ?? {}) as ExtensionBridgeResponse)
    }

    window.addEventListener('message', onMessage)
    window.postMessage({ source: EXTENSION_WEB_SOURCE, type, requestId, payload }, window.location.origin)
  })
}

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
  const [extensionState, setExtensionState] = useState<ExtensionConnectState>('checking')
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

  const pingExtension = useCallback(() => {
    setExtensionState((prev) => (prev === 'connecting' ? prev : 'checking'))
    const baseUrl = window.location.origin
    void requestExtensionBridge('MAGICKMONKEY_EXTENSION_PING', { baseUrl, scriptKey }, 900)
      .then((result) => {
        if (result.connected) {
          setExtensionState('connected')
        } else if (result.installed) {
          setExtensionState('available')
        } else {
          setExtensionState('not_installed')
        }
      })
      .catch(() => {
        setExtensionState((prev) => (prev === 'connecting' ? prev : 'not_installed'))
      })
  }, [scriptKey])

  useEffect(() => {
    let pingTimer: ReturnType<typeof setTimeout> | undefined

    function scheduleExtensionPing() {
      clearTimeout(pingTimer)
      pingTimer = setTimeout(pingExtension, 80)
    }

    function onVisible() {
      if (document.visibilityState === 'visible') {
        scheduleExtensionPing()
      }
    }

    scheduleExtensionPing()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', scheduleExtensionPing)
    window.addEventListener('pageshow', scheduleExtensionPing)

    return () => {
      clearTimeout(pingTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', scheduleExtensionPing)
      window.removeEventListener('pageshow', scheduleExtensionPing)
    }
  }, [pingExtension])

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

  const handleConnectExtension = async () => {
    if (isSaving || extensionState === 'checking' || extensionState === 'connecting') {
      return
    }

    if (extensionState === 'connected') {
      pingExtension()
      return
    }

    if (extensionState === 'not_installed') {
      const confirmed = window.confirm(
        'MagickMonkey Chrome extension was not detected on this page.\n\nDownload the extension ZIP and install it manually (Load unpacked in chrome://extensions)?'
      )
      if (!confirmed) {
        return
      }
      const link = document.createElement('a')
      link.href = CHROME_EXTENSION_ZIP_PATH
      link.download = CHROME_EXTENSION_ZIP_FILENAME
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      return
    }

    setExtensionState('connecting')
    const baseUrl = window.location.origin
    try {
      const result = await requestExtensionBridge('MAGICKMONKEY_CONNECT_EXTENSION', { baseUrl, scriptKey, developMode: true }, 3000)
      if (!result.ok) {
        setExtensionState('error')
        window.alert(result.error || 'Could not connect the Chrome extension.')
        return
      }
      setExtensionState('connected')
    } catch (error) {
      setExtensionState('error')
      window.alert(error instanceof Error ? error.message : 'Could not connect the Chrome extension.')
    }
  }

  const extensionTooltip =
    extensionState === 'connected'
      ? 'Chrome extension connected — click to recheck'
      : extensionState === 'checking'
        ? 'Checking Chrome extension'
        : extensionState === 'connecting'
          ? 'Connecting Chrome extension'
          : extensionState === 'not_installed'
            ? 'Download Chrome extension (ZIP)'
            : extensionState === 'error'
              ? 'Connection failed — click to retry'
              : 'Connect Chrome extension'

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
    <header className="h-11 bg-[#111318] border-b border-[#2a303a] flex items-center gap-2 px-3 sticky top-0 z-50">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <Image src="/logo.png" alt="MagickMonkey logo" width={24} height={24} className="rounded-sm shrink-0" priority />
        <span className="text-sm text-[#e6eaf0] font-medium truncate hidden sm:inline">MagickMonkey</span>
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
            <button type="button" onClick={onToggleRules} disabled={isSaving} className={isRulesOpen ? iconBtnActiveBlue : iconBtn} aria-label="URL rules">
              <LuAsterisk className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        {onToggleAI && (
          <Tooltip content={isAIOpen ? 'Close AI panel' : 'AI rewrite'} placement="bottom">
            <button type="button" onClick={onToggleAI} disabled={isSaving || isAIDisabled} className={isAIOpen ? iconBtnActiveBlue : iconBtn} aria-label="AI rewrite">
              <FiZap className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        <Tooltip content={isCompiling ? 'Compiling' : isEditorDevMode ? 'Disable dev mode' : 'Editor dev mode'} placement="bottom">
          <button type="button" onClick={onToggleEditorDevMode} disabled={isCompiling} className={isEditorDevMode ? iconBtnActiveGreen : iconBtn} aria-label="Editor dev mode">
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

        <Tooltip content={extensionTooltip} placement="bottom">
          <button
            type="button"
            onClick={handleConnectExtension}
            disabled={isSaving || extensionState === 'checking' || extensionState === 'connecting'}
            className={extensionState === 'connected' ? iconBtnActiveExtension : iconBtn}
            aria-label={
              extensionState === 'connected'
                ? 'Chrome extension connected — click to recheck'
                : extensionState === 'not_installed'
                  ? 'Download Chrome extension'
                  : 'Connect Chrome extension'
            }
          >
            {extensionState === 'checking' || extensionState === 'connecting' ? (
              <span className="w-4 h-4 flex items-center justify-center">
                <Spinner />
              </span>
            ) : (
              <IoExtensionPuzzleOutline className="w-4 h-4" />
            )}
          </button>
        </Tooltip>

        <Tooltip content={isChecking ? 'Checking Tampermonkey userscript' : 'Install Tampermonkey userscript'} placement="bottom">
          <button
            type="button"
            onClick={handleInstall}
            disabled={isSaving || isChecking}
            className={iconBtn}
            aria-label={isChecking ? 'Checking Tampermonkey userscript' : 'Install Tampermonkey userscript'}
          >
            {isChecking ? (
              <span className="w-4 h-4 flex items-center justify-center">
                <Spinner />
              </span>
            ) : (
              <SiTampermonkey className="w-4 h-4" />
            )}
          </button>
        </Tooltip>

        <Tooltip content="Push to Cloud" placement="bottom">
          <button type="button" onClick={onSave} disabled={isSaving} className={`${iconBtnActiveBrand} disabled:opacity-50`} aria-label="Push to Cloud">
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

      <div className="relative shrink-0 pl-2 border-l border-[#2a303a] ml-1" ref={userMenuRef}>
        <Tooltip content="Account" placement="bottom">
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[#e6eaf0] hover:text-white hover:bg-[#2a303a] disabled:opacity-50"
            aria-label="Account"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <FiUser className="w-4 h-4 shrink-0" />
            <FiChevronDown className={`w-3 h-3 shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </Tooltip>
        {userMenuOpen ? (
          <div className="absolute right-0 top-full mt-1 py-1 bg-[#171a21] border border-[#2a303a] rounded-md shadow-lg min-w-[180px] z-[70]" role="menu">
            <div className="px-3 py-2 text-xs text-[#9aa4b2] border-b border-[#2a303a] truncate" title={displayUsername}>
              {displayUsername}
            </div>
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#e6eaf0] hover:bg-[#2a303a] text-left"
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
