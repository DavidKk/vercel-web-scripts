import { getRules } from '@/app/actions/tampermonkey'
import { fetchFiles } from '@/app/api/scripts/actions'
import { checkAccess } from '@/services/auth/access'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'

import Editor from './Editor'
import { loadTampermonkeyTypings } from './typings'

export default async function Home() {
  try {
    await checkAccess({ isApiRouter: false, redirectUrl: '/editor' })

    const scriptKey = getTampermonkeyScriptKey()
    const { files, updatedAt } = await fetchFiles()
    const tampermonkeyTypings = loadTampermonkeyTypings()
    const rules = await getRules()
    return <Editor files={files} scriptKey={scriptKey} updatedAt={updatedAt} tampermonkeyTypings={tampermonkeyTypings} rules={rules} />
  } catch (err) {
    // eslint-disable-next-line no-console -- editor page errors must be visible in terminal
    console.error('[editor] page failed:', err)
    throw err
  }
}
