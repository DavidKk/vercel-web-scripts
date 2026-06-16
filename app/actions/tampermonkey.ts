'use server'

import { ENTRY_SCRIPT_RULES_FILE, EXCLUDED_FILES, SCRIPT_INDEX_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { fetchGist, getGistInfo, readGistFile, writeGistFile } from '@/services/gist'
import { buildScriptDisplayMetaByFilenameFromIndexContent, buildScriptUpdatedAtMapFromIndexContent } from '@/services/scripts/gistScripts'
import { extractMeta } from '@/services/tampermonkey/meta'
import { isRuleConfig, type RuleConfig } from '@/services/tampermonkey/types'

export interface Script {
  name: string
  file: string
  /** Last known content change time (epoch ms); falls back to gist `updated_at` when index has no per-file timestamp */
  updatedAt: number
  /** Userscript @description when available */
  description?: string
  /** Userscript @icon URL when available */
  icon?: string
  /** Userscript @version when available */
  version?: string
  /** Userscript @author when available */
  author?: string
  /** SHA-256 from script index when available */
  contentHash?: string
}

export async function getScriptsGistUpdatedAt(): Promise<number> {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  return new Date(gist.updated_at).getTime()
}

export async function getScriptsWithMeta(): Promise<{ scripts: Script[]; gistUpdatedAt: number }> {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const gistUpdatedAt = new Date(gist.updated_at).getTime()
  const updatedAtByFile = buildScriptUpdatedAtMapFromIndexContent(gist.files[SCRIPT_INDEX_FILE]?.content, gistUpdatedAt)
  const displayMetaByFile = buildScriptDisplayMetaByFilenameFromIndexContent(gist.files[SCRIPT_INDEX_FILE]?.content)

  const scripts = Array.from<Script>(
    (function* () {
      for (const [file, info] of Object.entries(gist.files)) {
        if (!SCRIPTS_FILE_EXTENSION.some((ext) => file.endsWith(ext)) || EXCLUDED_FILES.includes(file)) {
          continue
        }

        const metas = extractMeta(info.content)
        const headerName = metas?.name ? (Array.isArray(metas.name) ? metas.name[0] : metas?.name) : file
        const indexMeta = displayMetaByFile.get(file)
        const headerDescription = metas?.description ? (Array.isArray(metas.description) ? metas.description[0] : metas.description) : undefined
        const headerIcon = metas?.icon ? (Array.isArray(metas.icon) ? metas.icon[0] : metas.icon) : undefined
        const headerVersion = metas?.version ? (Array.isArray(metas.version) ? metas.version[0] : metas.version) : undefined
        const headerAuthor = metas?.author ? (Array.isArray(metas.author) ? metas.author[0] : metas.author) : undefined
        const description = indexMeta?.description ?? (typeof headerDescription === 'string' ? headerDescription : undefined)
        const icon = indexMeta?.icon ?? (typeof headerIcon === 'string' ? headerIcon : undefined)
        const version = indexMeta?.version ?? (typeof headerVersion === 'string' ? headerVersion : undefined)
        const author = indexMeta?.author ?? (typeof headerAuthor === 'string' ? headerAuthor : undefined)
        const contentHash = indexMeta?.contentHash

        yield {
          file,
          name: indexMeta?.name ?? headerName,
          updatedAt: updatedAtByFile.get(file) ?? gistUpdatedAt,
          ...(description ? { description } : {}),
          ...(icon ? { icon } : {}),
          ...(version ? { version } : {}),
          ...(author ? { author } : {}),
          ...(contentHash ? { contentHash } : {}),
        } satisfies Script
      }
    })()
  )

  return { scripts, gistUpdatedAt }
}

/** @deprecated Prefer {@link getScriptsWithMeta} */
export async function getScripts(): Promise<Script[]> {
  const { scripts } = await getScriptsWithMeta()
  return scripts
}

export async function getRules(): Promise<RuleConfig[]> {
  const { gistId, gistToken } = getGistInfo()
  const content = await readGistFile({ fileName: ENTRY_SCRIPT_RULES_FILE, gistId, gistToken })
  const rules = JSON.parse(content)
  return rules.filter(isRuleConfig)
}

export async function updateRules(rules: RuleConfig[]) {
  const { gistId, gistToken } = getGistInfo()
  const content = JSON.stringify(rules, null, 2)
  await writeGistFile({ gistId, gistToken, fileName: ENTRY_SCRIPT_RULES_FILE, content: content })
}
