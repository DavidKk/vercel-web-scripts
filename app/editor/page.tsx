import { cookies } from 'next/headers'

import { getRules } from '@/app/actions/tampermonkey'
import { fetchFiles } from '@/app/api/scripts/actions'
import { checkAccess } from '@/services/auth/access'
import { AUTH_TOKEN_NAME } from '@/services/auth/constants'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { verifyToken } from '@/utils/jwt'

import Editor from './Editor'
import { loadTampermonkeyTypings } from './typings'

/** Auth reads cookies; cannot be statically generated at build time. */
export const dynamic = 'force-dynamic'

interface EditorFilesResult {
  files: Record<string, { content: string; rawUrl: string }>
  updatedAt: number
}

async function loadEditorFilesWithFallback(): Promise<EditorFilesResult> {
  try {
    return await fetchFiles()
  } catch (error) {
    // eslint-disable-next-line no-console -- keep remote/network failures visible
    console.error('[editor] fetchFiles failed, fallback to empty files:', error)
    return {
      files: {},
      updatedAt: Date.now(),
    }
  }
}

async function loadRulesWithFallback() {
  try {
    return await getRules()
  } catch (error) {
    // eslint-disable-next-line no-console -- keep remote/network failures visible
    console.error('[editor] getRules failed, fallback to empty rules:', error)
    return []
  }
}

export default async function Home() {
  try {
    await checkAccess({ isApiRouter: false, redirectUrl: '/editor' })

    const scriptKey = getTampermonkeyScriptKey()
    const { files, updatedAt } = await loadEditorFilesWithFallback()
    const tampermonkeyTypings = loadTampermonkeyTypings()
    const rules = await loadRulesWithFallback()

    const cookieStore = await cookies()
    const token = cookieStore.get(AUTH_TOKEN_NAME)?.value
    const payload = token ? await verifyToken(token) : null
    const p = payload as Record<string, unknown> | undefined
    /** Prefer readable profile claims; `sub` is an opaque id from Vercel 2FA. */
    const displayUsername =
      (p && typeof p.preferred_username === 'string' && p.preferred_username.trim()) ||
      (p && typeof p.username === 'string' && p.username.trim()) ||
      (p && typeof p.email === 'string' && p.email.trim()) ||
      (p && typeof p.sub === 'string' && p.sub.trim()) ||
      process.env.ACCESS_USERNAME ||
      'Admin'

    return <Editor displayUsername={displayUsername} files={files} scriptKey={scriptKey} updatedAt={updatedAt} tampermonkeyTypings={tampermonkeyTypings} rules={rules} />
  } catch (err) {
    // eslint-disable-next-line no-console -- editor page errors must be visible in terminal
    console.error('[editor] page failed:', err)
    throw err
  }
}
