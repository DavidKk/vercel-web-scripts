'use client'

import { useClient } from '@/hooks/useClient'

export default function BuildTime() {
  const isClient = useClient()

  if (!isClient) return null

  return (
    <div className="text-xs font-medium text-gray-600 tracking-wide">
      Build Time: <span className="font-mono text-gray-700">{process.env.NEXT_PUBLIC_BUILD_TIME}</span>
    </div>
  )
}
