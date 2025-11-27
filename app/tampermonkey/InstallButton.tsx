'use client'

import { ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline'
import React, { useState } from 'react'

import { Spinner } from '@/components/Spinner'

export interface InstallTampermonkeyButtonProps {
  scriptKey: string
}

export default function InstallTampermonkeyButton(props: InstallTampermonkeyButtonProps) {
  const { scriptKey } = props
  const [loading, setLoading] = useState(false)

  const handleClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()

    if (loading) {
      return
    }

    setLoading(true)

    const userUrl = `/static/${scriptKey}/tampermonkey.user.js`
    const fallback = `/static/${scriptKey}/tampermonkey.js`
    const response = await fetch(userUrl, { method: 'HEAD' })
    window.open(response.ok ? userUrl : fallback, '_blank', 'noopener')

    setLoading(false)
  }

  return (
    <a
      href={`/static/${scriptKey}/tampermonkey.js`}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center rounded-sm ${loading ? 'bg-green-500 cursor-wait opacity-80' : 'bg-green-700 hover:bg-green-800'} text-white`}
      aria-busy={loading}
    >
      <span className="inline-block px-3 py-2 bg-green-900 rounded-l-sm">
        <ArchiveBoxArrowDownIcon className="w-5 h-5" />
      </span>

      <span className="inline-block px-3 py-2 bg-green-700 rounded-r-sm">
        {loading ? (
          <span className="flex items-center gap-2">
            <Spinner color="text-white" />
            Checking...
          </span>
        ) : (
          'Install Tampermonkey Script'
        )}
      </span>
    </a>
  )
}
