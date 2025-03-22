import { plainText } from '@/initializer/controller'
import { fetchGist, getGistInfo } from '@/services/gist'
import { createUserScript, extractMeta } from '@/services/tampermonkey'
import type { RuleConfig } from '@/services/tampermonkey/types'
import { ENTRY_SCRIPT_RULES_FILE, EXCLUDED_FILES } from '@/constants/file'

export const GET = plainText(async (req) => {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const files = Object.fromEntries(
    (function* () {
      for (const [file, { content }] of Object.entries(gist.files)) {
        if (!file.endsWith('.js')) {
          continue
        }

        if (EXCLUDED_FILES.includes(file)) {
          continue
        }

        const meta = extractMeta(content)
        if (!meta.match) {
          continue
        }

        yield [file, content]
      }
    })()
  )

  let configs: RuleConfig[] = []
  const ruleFile = gist.files[ENTRY_SCRIPT_RULES_FILE]
  if (ruleFile) {
    try {
      configs = JSON.parse(ruleFile.content)
    } catch {
      // ignore
    }
  }

  const rules = configs.map(({ wildcard, script }) => [wildcard, script]) satisfies [string, string][]
  const scriptUrl = req.url
  const version = `0.${(new Date(gist.updated_at).getTime() / 1e3).toString()}`
  return createUserScript({ scriptUrl, version, files, rules }).replace(/\r\n/g, '\n')
})
