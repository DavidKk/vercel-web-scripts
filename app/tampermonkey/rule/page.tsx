import { getRules, getScripts } from '@/app/actions/tampermonkey'
import { checkAccess } from '@/services/auth/access'

import Form from './components/Form'

export default async function RulePage() {
  await checkAccess({ isApiRouter: false, redirectUrl: '/tampermonkey/rule' })

  const rules = await getRules()
  const scripts = await getScripts()

  return (
    <div className="p-2 md:p-4 max-w-6xl w-full mx-auto mt-12">
      <h1 className="text-2xl text-center font-bold mb-8">Tampermonkey Rules</h1>

      <div className="mb-4">
        <Form rules={rules} scripts={scripts} />
      </div>
    </div>
  )
}
