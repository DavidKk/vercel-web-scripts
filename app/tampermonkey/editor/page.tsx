import { fetchFiles } from '@/app/api/scripts/actions'
import { checkAccess } from '@/services/auth/access'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey'

import Editor from './Editor'
import { loadTampermonkeyTypings } from './typings'

export default async function Home() {
  await checkAccess({ isApiRouter: false, redirectUrl: '/tampermonkey/editor' })

  const scriptKey = getTampermonkeyScriptKey()
  const { files, updatedAt } = await fetchFiles()
  const tampermonkeyTypings = loadTampermonkeyTypings()
  return <Editor files={files} scriptKey={scriptKey} updatedAt={updatedAt} tampermonkeyTypings={tampermonkeyTypings} />
}
