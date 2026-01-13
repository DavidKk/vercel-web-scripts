'use client'

import React from 'react'

import type { Script } from '@/app/actions/tampermonkey'
import ClearableSelect from '@/components/ClearableSelect'

export interface ScriptFieldProps {
  value: string
  onChange: (value: string) => void
  scripts: Script[]
  required?: boolean
}

export const ScriptField: React.FC<ScriptFieldProps> = (props) => {
  const { value, onChange, scripts, required = false } = props
  return (
    <ClearableSelect
      value={value}
      onChange={(value) => onChange(value)}
      options={scripts.map((script) => ({ label: script.name, value: script.file }))}
      placeholder="Please select a script"
      required={required}
    />
  )
}
