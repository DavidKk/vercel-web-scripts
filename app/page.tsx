import { fetchFiles } from '@/app/api/scripts/actions'
import Editor from './Editor'

export default async function Home() {
  const files = await fetchFiles()
  return <Editor files={files} />
}
