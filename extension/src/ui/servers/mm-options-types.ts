import type { ScriptPermissionMode } from '@shared/script-permission'

export const STATUS_BASE = 'mm-servers-status'

export type DetailMode = 'empty' | 'edit' | 'create'
export type ServiceTestState = 'idle' | 'loading' | 'ok' | 'error'

export type DetailFieldRef = 'base-url' | 'script-key'

export type DetailFormInput = {
  label: string
  baseUrl: string
  scriptKey: string
  gmScope: string
  permissionMode: ScriptPermissionMode
  enabled: boolean
  developMode: boolean
}

export type DetailFormBaseline = {
  mode: DetailMode
  serviceId: string | null
} & DetailFormInput

export const SERVICE_TEST_OK_DISPLAY_MS = 3000
export const SERVICE_TEST_RESULT_FADE_MS = 200

export const DETAIL_TEST_TOOLTIPS: Record<ServiceTestState, string> = {
  idle: 'Test connection (optional)',
  loading: 'Testing connection…',
  ok: 'Connection OK',
  error: 'Connection failed',
}
