'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { FiChevronDown, FiCopy, FiExternalLink, FiEye, FiEyeOff, FiX } from 'react-icons/fi'
import { TbApi, TbCode, TbRobot } from 'react-icons/tb'

import { useNotification } from '@/components/Notification'
import { Tooltip } from '@/components/Tooltip'

type ModalId = 'mcp' | 'api' | 'tools' | null

interface MCPHeadersResponse {
  code: number
  message: string
  data: {
    endpoint: string
    headers: Record<string, string>
  } | null
}

interface MCPResolvedHeaders {
  endpoint: string
  headers: Record<string, string>
}

const btnClass = 'p-2 rounded text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const inputClass = 'flex-1 h-7 px-2 rounded bg-[#1a1a1a] border border-[#3c3c3c] text-[#d4d4d4] text-[11px] font-mono focus:outline-none focus:border-[#0e639c]'
const rowIconBtnClass = 'h-7 w-7 inline-flex items-center justify-center rounded bg-[#2d2d2d] text-[#d4d4d4] hover:bg-[#0e639c] hover:text-white transition-colors'

/**
 * Icon buttons that open read-only docs for MCP URLs, OpenAPI, and function-calling JSON.
 */
export function EditorIntegrationModals() {
  const [open, setOpen] = useState<ModalId>(null)
  const [apiExpanded, setApiExpanded] = useState<Record<string, boolean>>({})
  const [mcpHeaders, setMcpHeaders] = useState<MCPResolvedHeaders | null>(null)
  const [mcpLoading, setMcpLoading] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const notification = useNotification()
  const notificationRef = useRef(notification)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const copyText = useCallback(
    async (text: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          const ta = document.createElement('textarea')
          ta.value = text
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          ta.remove()
        }
        notification.success('Copied')
      } catch {
        notification.error('Copy failed')
      }
    },
    [notification]
  )

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    notificationRef.current = notification
  }, [notification])

  useEffect(() => {
    if (open !== 'mcp') return

    let cancelled = false
    setMcpLoading(true)
    setShowSecret(false)

    void fetch('/api/mcp/headers', { method: 'GET' })
      .then(async (res) => {
        const data = (await res.json()) as MCPHeadersResponse
        if (cancelled) return
        if (!res.ok || data.code !== 0 || !data.data) {
          throw new Error(data.message || 'Load MCP headers failed')
        }
        setMcpHeaders(data.data)
      })
      .catch(() => {
        if (cancelled) return
        setMcpHeaders(null)
        notificationRef.current.error('Failed to load MCP headers')
      })
      .finally(() => {
        if (!cancelled) {
          setMcpLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open])

  function maskSecret(value: string) {
    if (!value) return ''
    if (value.length <= 8) return '*'.repeat(value.length)
    return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 8, 4))}${value.slice(-4)}`
  }

  function getVisibleHeaders(headers?: MCPResolvedHeaders['headers']) {
    if (!headers) {
      return null
    }
    const entries = Object.entries(headers).filter(([, value]) => value.trim().length > 0)
    if (entries.length === 0) {
      return null
    }
    return Object.fromEntries(entries)
  }

  function renderModal(title: string, body: ReactNode) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpen(null)}>
        <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-xl max-w-3xl w-full max-h-[min(80vh,720px)] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#3c3c3c]">
            <h2 className="text-sm font-medium text-[#e0e0e0]">{title}</h2>
            <button type="button" className={btnClass} title="Close" onClick={() => setOpen(null)} aria-label="Close">
              <FiX className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3 text-xs text-[#cccccc] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {body}
          </div>
        </div>
      </div>
    )
  }

  function renderCommandRow(label: string, value: string, actions: { id: string; title: string; onClick: () => void; icon: ReactNode }[]) {
    return (
      <div className="space-y-1">
        <div className="text-[#8fb9ff] text-[11px]">{label}</div>
        <div className="flex items-center gap-1.5">
          <input className={inputClass} value={value} readOnly />
          <div className="flex items-center gap-1 self-center">
            {actions.map((action) => (
              <Tooltip key={action.id} content={action.title} placement="top">
                <button type="button" className={rowIconBtnClass} aria-label={action.title} onClick={action.onClick}>
                  {action.icon}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function toggleApiSection(id: string) {
    setApiExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <>
      <div className="flex items-center gap-0.5 border-r border-[#2d2d2d] pr-2 mr-1">
        <Tooltip content="API" placement="bottom">
          <button type="button" className={btnClass} aria-label="API" onClick={() => setOpen('api')}>
            <TbApi className="w-4 h-4" />
          </button>
        </Tooltip>
        <Tooltip content="MCP" placement="bottom">
          <button type="button" className={btnClass} aria-label="MCP" onClick={() => setOpen('mcp')}>
            <TbRobot className="w-4 h-4" />
          </button>
        </Tooltip>
        <Tooltip content="Function Calling" placement="bottom">
          <button type="button" className={btnClass} aria-label="Function Calling" onClick={() => setOpen('tools')}>
            <TbCode className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      {open === 'mcp' &&
        renderModal(
          'MCP',
          <div className="space-y-3">
            {renderCommandRow('MCP URL (GET manifest · POST execute)', mcpHeaders?.endpoint ?? `${origin}/api/mcp`, [
              {
                id: 'copy-mcp',
                title: 'Copy',
                onClick: () => void copyText(mcpHeaders?.endpoint ?? `${origin}/api/mcp`),
                icon: <FiCopy className="w-3.5 h-3.5" />,
              },
              {
                id: 'open-mcp',
                title: 'Open',
                onClick: () => window.open('/api/mcp', '_blank', 'noopener,noreferrer'),
                icon: <FiExternalLink className="w-3.5 h-3.5" />,
              },
            ])}
            {(() => {
              const visibleHeaders = getVisibleHeaders(mcpHeaders?.headers)
              const maskedHeaders = visibleHeaders ? Object.fromEntries(Object.entries(visibleHeaders).map(([key, value]) => [key, showSecret ? value : maskSecret(value)])) : null

              if (!mcpLoading && !maskedHeaders) {
                return null
              }

              return (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[#8fb9ff] text-[11px]">MCP Auth Key</div>
                    <div className="flex items-center gap-1">
                      {maskedHeaders ? (
                        <>
                          <Tooltip content="Copy" placement="top">
                            <button type="button" className={rowIconBtnClass} aria-label="Copy" onClick={() => void copyText(JSON.stringify(visibleHeaders, null, 2))}>
                              <FiCopy className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                          <Tooltip content={showSecret ? 'Hide secrets' : 'Show secrets'} placement="top">
                            <button
                              type="button"
                              className={rowIconBtnClass}
                              aria-label={showSecret ? 'Hide secrets' : 'Show secrets'}
                              onClick={() => setShowSecret((prev) => !prev)}
                            >
                              {showSecret ? <FiEyeOff className="w-3.5 h-3.5" /> : <FiEye className="w-3.5 h-3.5" />}
                            </button>
                          </Tooltip>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-[#1a1a1a] border border-[#333] rounded p-2">
                    {mcpLoading ? 'Loading...' : JSON.stringify(maskedHeaders, null, 2)}
                  </pre>
                </div>
              )
            })()}
          </div>
        )}

      {open === 'api' &&
        renderModal(
          'API (OpenAPI)',
          <div className="space-y-3">
            <div className="border border-[#3c3c3c] rounded-md p-2 bg-[#1f1f1f]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-[#0e639c] text-white font-semibold">GET</span>
                    <code className="text-[#d7d7d7] truncate">/api/v1/scripts</code>
                  </div>
                  <div className="mt-1 text-[11px] text-[#c8c8c8]">List script files (200 example only)</div>
                </div>
                <div className="flex items-center gap-1 self-center shrink-0">
                  <button type="button" className={rowIconBtnClass} title="Copy full URL" aria-label="Copy full URL" onClick={() => void copyText(`${origin}/api/v1/scripts`)}>
                    <FiCopy className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className={rowIconBtnClass} title="Toggle details" aria-label="Toggle details" onClick={() => toggleApiSection('list')}>
                    <FiChevronDown className={`w-3.5 h-3.5 transition-transform ${apiExpanded.list ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              {apiExpanded.list ? (
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-[#1a1a1a] border border-[#333] rounded p-2">{`{
  "code": 0,
  "message": "ok",
  "data": {
    "files": [
      {
        "filename": "demo.ts",
        "byteLength": 128
      }
    ],
    "gistUpdatedAt": 1761481200000
  }
}`}</pre>
              ) : null}
            </div>
            <div className="border border-[#3c3c3c] rounded-md p-2 bg-[#1f1f1f]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-[#0e639c] text-white font-semibold">GET</span>
                    <code className="text-[#d7d7d7] truncate">/api/v1/scripts/{`{filename}`}</code>
                  </div>
                  <div className="mt-1 text-[11px] text-[#c8c8c8]">Get script content (200 example only)</div>
                </div>
                <div className="flex items-center gap-1 self-center shrink-0">
                  <button
                    type="button"
                    className={rowIconBtnClass}
                    title="Copy full URL"
                    aria-label="Copy full URL"
                    onClick={() => void copyText(`${origin}/api/v1/scripts/{filename}`)}
                  >
                    <FiCopy className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className={rowIconBtnClass} title="Toggle details" aria-label="Toggle details" onClick={() => toggleApiSection('get')}>
                    <FiChevronDown className={`w-3.5 h-3.5 transition-transform ${apiExpanded.get ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              {apiExpanded.get ? (
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-[#1a1a1a] border border-[#333] rounded p-2">{`{
  "code": 0,
  "message": "ok",
  "data": {
    "filename": "demo.ts",
    "content": "console.log('hello')"
  }
}`}</pre>
              ) : null}
            </div>
            <div className="border border-[#3c3c3c] rounded-md p-2 bg-[#1f1f1f]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-[#0e639c] text-white font-semibold">PUT/DELETE</span>
                    <code className="text-[#d7d7d7] truncate">/api/v1/scripts/{`{filename}`}</code>
                  </div>
                  <div className="mt-1 text-[11px] text-[#c8c8c8]">Mutation result (200 example only)</div>
                </div>
                <div className="flex items-center gap-1 self-center shrink-0">
                  <button
                    type="button"
                    className={rowIconBtnClass}
                    title="Copy full URL"
                    aria-label="Copy full URL"
                    onClick={() => void copyText(`${origin}/api/v1/scripts/{filename}`)}
                  >
                    <FiCopy className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className={rowIconBtnClass} title="Toggle details" aria-label="Toggle details" onClick={() => toggleApiSection('mutate')}>
                    <FiChevronDown className={`w-3.5 h-3.5 transition-transform ${apiExpanded.mutate ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              {apiExpanded.mutate ? (
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-[#1a1a1a] border border-[#333] rounded p-2">{`{
  "code": 0,
  "message": "ok",
  "data": {
    "filename": "demo.ts",
    "ok": true
  }
}`}</pre>
              ) : null}
            </div>
          </div>
        )}

      {open === 'tools' &&
        renderModal(
          'Function Calling',
          <div className="space-y-3">
            {renderCommandRow('Tools Schema URL', `${origin}/docs/scripts-function-tools.json`, [
              {
                id: 'copy-tools-url',
                title: 'Copy',
                onClick: () => void copyText(`${origin}/docs/scripts-function-tools.json`),
                icon: <FiCopy className="w-3.5 h-3.5" />,
              },
              {
                id: 'open-tools-url',
                title: 'Open',
                onClick: () => window.open('/docs/scripts-function-tools.json', '_blank', 'noopener,noreferrer'),
                icon: <FiExternalLink className="w-3.5 h-3.5" />,
              },
            ])}
            {renderCommandRow('API Base URL', `${origin}/api/v1/scripts`, [
              {
                id: 'copy-api-base',
                title: 'Copy',
                onClick: () => void copyText(`${origin}/api/v1/scripts`),
                icon: <FiCopy className="w-3.5 h-3.5" />,
              },
              {
                id: 'open-api-base',
                title: 'Open',
                onClick: () => window.open('/api/v1/scripts', '_blank', 'noopener,noreferrer'),
                icon: <FiExternalLink className="w-3.5 h-3.5" />,
              },
            ])}
          </div>
        )}
    </>
  )
}
