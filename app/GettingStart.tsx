import Link from 'next/link'
import { ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline'

export default function GettingStart() {
  return (
    <div className="flex flex-col items-center">
      <nav className="w-full p-4 bg-gray-800 text-white flex items-center">
        <h1 className="text-xl font-bold">Web Scripts</h1>

        <div className="ml-10 flex">
          <Link className="px-4 py-2" href="/editor">
            Editor
          </Link>
        </div>
      </nav>

      <div className="mx-auto p-4 py-20">
        <h2 className="text-2xl font-semibold text-gray-700 mb-2">Tampermonkey</h2>
        <p className="mb-4 text-gray-700">
          Install the Tampermonkey extension and click the install button below to install.
          <br />
          The script will automatically update, checking for updates daily by default. Refer to the Tampermonkey script settings for details.
        </p>
        <div className="flex space-x-4">
          <a href="/static/tampermonkey.user.js" target="_blank" className="flex items-center bg-green-700 text-white rounded-sm hover:bg-green-800">
            <span className="inline-block px-3 py-2 bg-green-900 rounded-l-sm">
              <ArchiveBoxArrowDownIcon className="w-5 h-5" />
            </span>
            <span className="inline-block px-3 py-2 bg-green-700 rounded-r-sm">Install Tampermonkey Script</span>
          </a>
        </div>
      </div>
    </div>
  )
}
