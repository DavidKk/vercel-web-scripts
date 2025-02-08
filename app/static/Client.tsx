'use client'

import { useEffect, useState } from 'react'

export default function Client() {
  const [isClient, setClient] = useState(false)

  useEffect(() => {
    setClient(true)
  }, [])

  if (!isClient) {
    return null
  }

  return <></>
}
