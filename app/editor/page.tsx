import { fetchFiles } from '@/app/api/scripts/actions'
import { checkAccess } from '@/services/auth/access'
import Editor from './Editor'

export default async function Home() {
  await checkAccess()

  const files = await fetchFiles()
  return <Editor files={files} />
}
