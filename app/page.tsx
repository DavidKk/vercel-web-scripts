import { checkUnAccess } from '@/services/auth/access'

import LoginForm from './login/Form'

export default async function Home() {
  await checkUnAccess({ redirectUrl: '/editor', isApiRouter: false })
  return <LoginForm enable2FA={!!process.env.ACCESS_2FA_SECRET} redirectUrl="/editor" />
}
