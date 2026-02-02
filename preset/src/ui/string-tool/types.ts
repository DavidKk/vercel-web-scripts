/** Hash algorithm IDs supported by the string tool */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512'

/** String tool operation IDs */
export type StringToolType =
  | HashAlgorithm
  | 'uuid'
  | 'json-format'
  | 'json-minify'
  | 'base64-encode'
  | 'base64-decode'
  | 'url-encode'
  | 'url-decode'
  | 'html-escape'
  | 'html-unescape'

/** Command palette entry for a string tool operation */
export interface StringToolCommand {
  id: StringToolType
  title: string
  keywords: string[]
  hint: string
}
