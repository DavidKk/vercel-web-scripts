import { createHash } from 'crypto'

import { EXCLUDED_FILES } from '@/constants/file'
import { fetchGist, getGistInfo } from '@/services/gist'

import { getRemoteScriptContent } from './createUserScript.server'

/**
 * Compiled remote script body plus SHA-1 (same bytes as GET tampermonkey-remote.js).
 */
export interface RemoteScriptBundlePayload {
  /** Normalized LF script body */
  content: string
  /** SHA-1 hex of content */
  hash: string
}

/**
 * Fetch Gist, compile script files, return body + content hash for manifest and versioned routes.
 * @returns Payload or null when Gist/config unavailable or compile yields empty
 */
export async function buildRemoteScriptBundleFromGist(): Promise<RemoteScriptBundlePayload | null> {
  try {
    const { gistId, gistToken } = getGistInfo()
    const gist = await fetchGist({ gistId, gistToken })
    const files = Object.fromEntries(
      (function* () {
        for (const [file, { content }] of Object.entries(gist.files)) {
          if (!(file.endsWith('.js') || (file.endsWith('.ts') && !file.endsWith('.d.ts')))) {
            continue
          }
          if (EXCLUDED_FILES.includes(file)) {
            continue
          }
          yield [file, content]
        }
      })()
    )
    const gistUpdatedAtMs = new Date(gist.updated_at).getTime()
    const raw = await getRemoteScriptContent(files, { strictCompile: true, scriptBuiltAt: gistUpdatedAtMs })
    const content = raw.replace(/\r\n/g, '\n')
    if (!content.trim()) {
      return null
    }
    const hash = createHash('sha1').update(content, 'utf8').digest('hex')
    return { content, hash }
  } catch {
    return null
  }
}
