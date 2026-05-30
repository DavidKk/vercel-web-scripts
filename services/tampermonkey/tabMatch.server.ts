import { getRules } from '@/app/actions/tampermonkey'
import { EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { fetchGist, getGistInfo } from '@/services/gist'
import { extractMeta } from '@/services/tampermonkey/meta'
import type { RuleConfig } from '@/services/tampermonkey/types'
import { matchUrl } from '@/utils/url'

export interface TabMatchSummary {
  url: string
  /** Script filenames that would run on this URL (@match or rules.json wildcard). */
  scripts: string[]
  count: number
}

function scriptMatchesUrl(file: string, headerMatch: string[], rules: RuleConfig[], url: string): boolean {
  if (headerMatch.some((pattern) => pattern && matchUrl(pattern, url))) {
    return true
  }
  return rules.some((rule) => rule.script === file && rule.wildcard && matchUrl(rule.wildcard, url))
}

/**
 * List Gist scripts that would execute on the given page URL (same logic as compiled remote bundle).
 * @param url - Full page URL (http/https)
 */
export async function getTabMatchSummary(url: string): Promise<TabMatchSummary> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { url, scripts: [], count: 0 }
  }

  const { gistId, gistToken } = getGistInfo()
  const [gist, rules] = await Promise.all([fetchGist({ gistId, gistToken }), getRules()])

  const scripts: string[] = []
  for (const [file, { content }] of Object.entries(gist.files)) {
    if (!SCRIPTS_FILE_EXTENSION.some((ext) => file.endsWith(ext)) || EXCLUDED_FILES.includes(file)) {
      continue
    }
    const meta = extractMeta(content)
    const headerMatch = !meta.match ? [] : Array.isArray(meta.match) ? meta.match : [meta.match]
    const patterns = headerMatch.filter((m): m is string => typeof m === 'string' && Boolean(m))
    if (scriptMatchesUrl(file, patterns, rules, url)) {
      scripts.push(file)
    }
  }

  scripts.sort()
  return { url, scripts, count: scripts.length }
}
