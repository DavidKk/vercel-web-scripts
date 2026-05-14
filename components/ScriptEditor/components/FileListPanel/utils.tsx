import { TbBrandTypescript } from 'react-icons/tb'
import { VscFile, VscFileCode, VscJson, VscMarkdown } from 'react-icons/vsc'

import { FileStatus } from '@/components/ScriptEditor/types'

/**
 * Get file icon based on extension
 * @param fileName File name
 * @returns React icon component
 */
export function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, React.ReactNode> = {
    ts: <TbBrandTypescript className="w-4 h-4 text-[#3178c6]" />,
    tsx: <VscFileCode className="w-4 h-4 text-[#3178c6]" />,
    js: <VscFileCode className="w-4 h-4 text-[#f7df1e]" />,
    jsx: <VscFileCode className="w-4 h-4 text-[#61dafb]" />,
    json: <VscJson className="w-4 h-4 text-[#cbcb41]" />,
    css: <VscFileCode className="w-4 h-4 text-[#1572b6]" />,
    html: <VscFileCode className="w-4 h-4 text-[#e34c26]" />,
    md: <VscMarkdown className="w-4 h-4 text-[#cbd5e1]" />,
  }
  return iconMap[ext || ''] || <VscFile className="w-4 h-4 text-[#cbd5e1]" />
}

/**
 * Get file status indicator
 * @param status File status
 * @returns React node for status indicator
 */
export function getFileStatusIndicator(status: FileStatus): React.ReactNode {
  switch (status) {
    case FileStatus.ModifiedUnsaved:
    case FileStatus.NewUnsaved:
      return <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" title="Unsaved changes" />
    case FileStatus.ModifiedSaved:
    case FileStatus.NewSaved:
      return <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" title="Saved locally" />
    case FileStatus.Deleted:
      return <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" title="Deleted" />
    case FileStatus.Unchanged:
    default:
      return null
  }
}

/**
 * Detect if running on macOS
 * @returns True if running on macOS
 */
export function isMacOS(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
}
