'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { FiChevronDown, FiCopy, FiDownload, FiExternalLink, FiX } from 'react-icons/fi'
import { TbApi, TbCode, TbFileText, TbRobot } from 'react-icons/tb'

import { useNotification } from '@/components/Notification'
import { Tooltip } from '@/components/Tooltip'

type ModalId = 'mcp' | 'api' | 'skill' | 'tools' | null

const btnClass = 'p-2 rounded text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const inputClass = 'flex-1 h-7 px-2 rounded bg-[#1a1a1a] border border-[#3c3c3c] text-[#d4d4d4] text-[11px] font-mono focus:outline-none focus:border-[#0e639c]'
const rowIconBtnClass = 'h-7 w-7 inline-flex items-center justify-center rounded bg-[#2d2d2d] text-[#d4d4d4] hover:bg-[#0e639c] hover:text-white transition-colors'

/**
 * Icon buttons that open read-only docs for MCP URLs, OpenAPI, skill markdown, and function-calling JSON.
 */
export function EditorIntegrationModals() {
  const [open, setOpen] = useState<ModalId>(null)
  const [apiExpanded, setApiExpanded] = useState<Record<string, boolean>>({})
  const notification = useNotification()

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
        <Tooltip content="Skill" placement="bottom">
          <button type="button" className={btnClass} aria-label="Skill" onClick={() => setOpen('skill')}>
            <TbFileText className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      {open === 'mcp' &&
        renderModal(
          'MCP',
          <div className="space-y-3">
            {renderCommandRow('Manifest URL', `${origin}/api/mcp/scripts/manifest`, [
              {
                id: 'copy-manifest',
                title: 'Copy',
                onClick: () => void copyText(`${origin}/api/mcp/scripts/manifest`),
                icon: <FiCopy className="w-3.5 h-3.5" />,
              },
              {
                id: 'open-manifest',
                title: 'Open',
                onClick: () => window.open('/api/mcp/scripts/manifest', '_blank', 'noopener,noreferrer'),
                icon: <FiExternalLink className="w-3.5 h-3.5" />,
              },
            ])}
            {renderCommandRow('Execute URL', `${origin}/api/mcp/scripts/execute`, [
              {
                id: 'copy-execute',
                title: 'Copy',
                onClick: () => void copyText(`${origin}/api/mcp/scripts/execute`),
                icon: <FiCopy className="w-3.5 h-3.5" />,
              },
              {
                id: 'open-execute',
                title: 'Open',
                onClick: () => window.open('/api/mcp/scripts/execute', '_blank', 'noopener,noreferrer'),
                icon: <FiExternalLink className="w-3.5 h-3.5" />,
              },
            ])}
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

      {open === 'skill' &&
        renderModal(
          'Skill',
          <div className="space-y-2">
            {renderCommandRow('Bash', `curl -fsSL "${origin}/docs/scripts-ai-skill.md" -o scripts-ai-skill.md`, [
              {
                id: 'copy-skill-bash',
                title: 'Copy',
                onClick: () => void copyText(`curl -fsSL "${origin}/docs/scripts-ai-skill.md" -o scripts-ai-skill.md`),
                icon: <FiCopy className="w-3.5 h-3.5" />,
              },
              {
                id: 'download-skill',
                title: 'Download',
                onClick: () => {
                  const anchor = document.createElement('a')
                  anchor.href = '/docs/scripts-ai-skill.md'
                  anchor.download = 'scripts-ai-skill.md'
                  document.body.appendChild(anchor)
                  anchor.click()
                  anchor.remove()
                },
                icon: <FiDownload className="w-3.5 h-3.5" />,
              },
            ])}
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
