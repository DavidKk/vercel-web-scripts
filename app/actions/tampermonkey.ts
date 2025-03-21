'use server'

import { ENTRY_SCRIPT_RULES_FILE, EXCLUDED_FILES } from '@/constants/file'
import { fetchGist, getGistInfo, readGistFile, writeGistFile } from '@/services/gist'
import { isRuleConfig, type RuleConfig } from '@/services/tampermonkey/types'

export async function getScripts() {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  return Object.keys(gist.files).filter(([file]) => !EXCLUDED_FILES.includes(file))
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
