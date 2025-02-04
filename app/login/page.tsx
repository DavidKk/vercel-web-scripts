import { checkUnAccess } from '@/services/auth/access'
import LoginForm from './Form'

export default async function LoginPage() {
  await checkUnAccess()
  return <LoginForm enable2FA={!!process.env.ACCESS_2FA_SECRET} />
}
