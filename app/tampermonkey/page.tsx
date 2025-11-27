import { checkAccess } from '@/services/auth/access'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey'

import InstallTampermonkeyButton from './InstallButton'

export default async function Home() {
  await checkAccess({ isApiRouter: false, redirectUrl: '/tampermonkey' })
  const key = getTampermonkeyScriptKey()

  return (
    <div className="min-h-[calc(100vh-60px-64px)] flex flex-col items-center bg-gray-100 p-10 py-16 text-black">
      <div className="mx-auto p-4 py-20">
        <h2 className="text-2xl font-semibold text-gray-700 mb-2">Tampermonkey</h2>
        <p className="mb-4 text-gray-700">
          Install the Tampermonkey extension and click the install button below to install.
          <br />
          The script will automatically update, checking for updates daily by default. Refer to the Tampermonkey script settings for details.
        </p>
        <div className="flex space-x-4">
          <InstallTampermonkeyButton scriptKey={key} />
        </div>
      </div>
    </div>
  )
}
