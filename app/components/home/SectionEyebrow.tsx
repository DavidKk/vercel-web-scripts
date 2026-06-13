import type { ReactNode } from 'react'

import { homeUi } from '@/app/components/home/palette'

interface SectionEyebrowProps {
  children: ReactNode
  className?: string
}

export default function SectionEyebrow(props: SectionEyebrowProps) {
  const { children, className = '' } = props
  return <p className={`${homeUi.eyebrow} ${className}`}>{children}</p>
}
