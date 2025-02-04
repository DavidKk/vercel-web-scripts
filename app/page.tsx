import { fetchFiles } from '@/app/api/scripts/actions'
import Editor from '@/components/Editor'

export default async function Home() {
  const files = await fetchFiles()
  return <Editor files={files} />
}
