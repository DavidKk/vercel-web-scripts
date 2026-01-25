import { getRules } from '@/app/actions/tampermonkey'
import { fetchFiles } from '@/app/api/scripts/actions'
import { checkAccess } from '@/services/auth/access'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'

import Editor from './Editor'
import { loadTampermonkeyTypings } from './typings'

export default async function Home() {
  await checkAccess({ isApiRouter: false, redirectUrl: '/tampermonkey/editor' })

  const scriptKey = getTampermonkeyScriptKey()
  const { files, updatedAt } = await fetchFiles()
  const tampermonkeyTypings = loadTampermonkeyTypings()
  const rules = await getRules()
  return <Editor files={files} scriptKey={scriptKey} updatedAt={updatedAt} tampermonkeyTypings={tampermonkeyTypings} rules={rules} />
}
