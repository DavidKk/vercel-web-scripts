'use client'

import React from 'react'
import ConfigManager from '@/components/ConfigManager'
import { updateRules } from '@/app/actions/tampermonkey'
import type { RuleConfig } from '@/services/tampermonkey/types'
import { WildcardField, type WildcardFieldProps } from './WildcardField'
import { ScriptField, type ScriptFieldProps } from './ScriptField'
import { useSearchParams } from 'next/navigation'

export interface FormProps {
  rules: RuleConfig[]
  scripts: string[]
}

export default function Form(props: FormProps) {
  const { rules, scripts } = props
  const url = useSearchParams().get('url') || ''
  const rule = (() => {
    if (!url) {
      return null
    }

    const id = crypto.randomUUID()
    const parsedUrl = new URL(url)
    const wildcard = `*://${parsedUrl.host}/*`
    return { id, wildcard, script: '' }
  })()

  const schema = {
    wildcard: (props: WildcardFieldProps) => <WildcardField {...props} required />,
    script: (props: Omit<ScriptFieldProps, 'scripts'>) => <ScriptField {...props} scripts={scripts} required />,
  }

  const filterSchema = {
    script: (props: Omit<ScriptFieldProps, 'scripts'>) => <ScriptField {...props} scripts={scripts} />,
  }

  const handleSubmit = async (configs: RuleConfig[]) => {
    updateRules(configs)
  }

  return <ConfigManager configs={[...(rule ? [rule] : []), ...rules]} configSchema={schema} filterSchema={filterSchema} onSubmit={handleSubmit} />
}
