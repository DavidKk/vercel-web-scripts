'use server'

import { ENTRY_SCRIPT_RULES_FILE, EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { fetchGist, getGistInfo, readGistFile, writeGistFile } from '@/services/gist'
import { extractMeta } from '@/services/tampermonkey/meta'
import { isRuleConfig, type RuleConfig } from '@/services/tampermonkey/types'

export interface Script {
  name: string
  file: string
}

export async function getScripts() {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })

  return Array.from<Script>(
    (function* () {
      for (const [file, info] of Object.entries(gist.files)) {
        if (SCRIPTS_FILE_EXTENSION.some((ext) => !file.endsWith(ext)) || EXCLUDED_FILES.includes(file)) {
          continue
        }

        const metas = extractMeta(info.content)
        const name = metas?.name ? (Array.isArray(metas.name) ? metas.name[0] : metas?.name) : file
        yield { file, name } satisfies Script
      }
    })()
  )
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
