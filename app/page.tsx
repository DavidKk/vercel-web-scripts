import { checkAccess } from '@/services/auth/access'
import GettingStart from './GettingStart'

export default async function Home() {
  await checkAccess()

  return <GettingStart />
}
