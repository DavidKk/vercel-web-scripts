/**
 * String Tool layout configuration.
 * Layout: UI structure per tool type. Single compact style.
 */

import type { StringToolType } from './types'

/** Layout type: determines which slots and controls are shown */
export type StringToolLayout = 'uuid' | 'transform' | 'json-editor'

const LAYOUT_BY_TYPE: Record<StringToolType, StringToolLayout> = {
  uuid: 'uuid',
  'json-format': 'json-editor',
  'json-minify': 'json-editor',
  md5: 'transform',
  sha1: 'transform',
  sha256: 'transform',
  sha384: 'transform',
  sha512: 'transform',
  'base64-encode': 'transform',
  'base64-decode': 'transform',
  'url-encode': 'transform',
  'url-decode': 'transform',
  'html-escape': 'transform',
  'html-unescape': 'transform',
}

export function getLayoutForType(type: StringToolType): StringToolLayout {
  return LAYOUT_BY_TYPE[type]
}

export function isJsonEditorLayout(type: StringToolType): boolean {
  return getLayoutForType(type) === 'json-editor'
}
