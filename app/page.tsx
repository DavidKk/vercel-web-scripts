import { getSignetAuthCenterOrigin, getSignetSdkModuleUrl } from '@/lib/signet-sdk-url'
import { checkUnAccess } from '@/services/auth/access'

import LoginForm from './login/Form'

export default async function Home() {
  await checkUnAccess({ redirectUrl: '/editor', isApiRouter: false })
  const vercel2FAOrigin = getSignetAuthCenterOrigin()
  const signetSdkModuleUrl = getSignetSdkModuleUrl()

  return <LoginForm enable2FA={!!process.env.ACCESS_2FA_SECRET} redirectUrl="/editor" vercel2FAOrigin={vercel2FAOrigin} signetSdkModuleUrl={signetSdkModuleUrl} />
}
