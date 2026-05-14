export interface CurlParsedData {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  contentType?: string
}

/**
 * Parse a curl CLI string into request fields.
 * @param curlCommand Raw curl command
 */
export function parseCurlCommand(curlCommand: string): CurlParsedData {
  // Strip leading "curl"
  let command = curlCommand.trim()
  if (command.startsWith('curl')) {
    command = command.substring(4).trim()
  }

  const result: CurlParsedData = {
    method: 'GET',
    url: '',
    headers: {},
  }

  const args = parseCurlArgs(command)

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    switch (arg) {
      case '-X':
      case '--request':
        if (nextArg) {
          result.method = nextArg.toUpperCase()
          i++ // consume value
        }
        break

      case '-H':
      case '--header':
        if (nextArg) {
          const headerMatch = nextArg.match(/^([^:]+):\s*(.+)$/)
          if (headerMatch) {
            const [, name, value] = headerMatch
            result.headers[name.trim()] = value.trim()
          }
        }
        i++ // consume value
        break

      case '-d':
      case '--data':
      case '--data-raw':
        if (nextArg) {
          result.body = nextArg
          if (!result.headers['Content-Type'] && !result.headers['content-type']) {
            result.headers['Content-Type'] = 'application/x-www-form-urlencoded'
          }
        }
        i++ // consume value
        break

      case '--data-binary':
        if (nextArg) {
          result.body = nextArg
          if (!result.headers['Content-Type'] && !result.headers['content-type']) {
            result.headers['Content-Type'] = 'application/octet-stream'
          }
        }
        i++ // consume value
        break

      case '--json':
        if (nextArg) {
          result.body = nextArg
          result.headers['Content-Type'] = 'application/json'
        }
        i++ // consume value
        break

      case '-F':
      case '--form':
        if (nextArg) {
          const formMatch = nextArg.match(/^([^=]+)=(.*)$/)
          if (formMatch) {
            const [, name, value] = formMatch
            if (!result.body) {
              result.body = ''
            }
            if (result.body) {
              result.body += '&'
            }
            result.body += `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
          }
          if (!result.headers['Content-Type'] && !result.headers['content-type']) {
            result.headers['Content-Type'] = 'application/x-www-form-urlencoded'
          }
        }
        i++ // consume value
        break

      case '-u':
      case '--user':
        if (nextArg) {
          const [username, password] = nextArg.split(':')
          const credentials = btoa(`${username}:${password || ''}`)
          result.headers['Authorization'] = `Basic ${credentials}`
        }
        i++ // consume value
        break

      case '-b':
      case '--cookie':
        if (nextArg) {
          result.headers['Cookie'] = nextArg
        }
        i++ // consume value
        break

      default:
        if (!arg.startsWith('-') && !result.url) {
          result.url = arg.replace(/^["']|["']$/g, '')
        }
        break
    }
  }

  return result
}

/**
 * Tokenize curl arguments with quote / escape handling.
 * @param command Body after "curl"
 */
function parseCurlArgs(command: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''
  let i = 0

  while (i < command.length) {
    const char = command[i]

    if (char === '"' || char === "'") {
      if (!inQuotes) {
        inQuotes = true
        quoteChar = char
      } else if (char === quoteChar) {
        inQuotes = false
        quoteChar = ''
      } else {
        current += char
      }
    } else if (char === ' ' && !inQuotes) {
      if (current.trim()) {
        args.push(current.trim())
        current = ''
      }
    } else if (char === '\\' && i + 1 < command.length) {
      current += command[i + 1]
      i++
    } else {
      current += char
    }

    i++
  }

  if (current.trim()) {
    args.push(current.trim())
  }

  return args
}

/**
 * Map parsed curl data to `fetch` options.
 * @param parsedData Output of {@link parseCurlCommand}
 */
export function curlToFetch(parsedData: CurlParsedData): RequestInit {
  const fetchConfig: RequestInit = {
    method: parsedData.method,
    headers: parsedData.headers,
  }

  if (parsedData.body) {
    const contentType = parsedData.headers['Content-Type'] || parsedData.headers['content-type']

    if (contentType?.includes('application/json')) {
      try {
        fetchConfig.body = JSON.parse(parsedData.body)
      } catch {
        fetchConfig.body = parsedData.body
      }
    } else if (contentType?.includes('application/x-www-form-urlencoded')) {
      fetchConfig.body = parsedData.body
    } else {
      fetchConfig.body = parsedData.body
    }
  }

  return fetchConfig
}

/**
 * Run `fetch` from a curl command string.
 * @param curlCommand Full curl CLI string
 */
export async function executeCurlAsFetch(curlCommand: string): Promise<Response> {
  if (!curlCommand) {
    throw new Error('CURL command is required')
  }

  if (typeof curlCommand !== 'string') {
    throw new Error('CURL command must be a string')
  }

  if (curlCommand.trim() === '') {
    throw new Error('CURL command cannot be empty')
  }

  if (!curlCommand.trim().startsWith('curl')) {
    throw new Error('Invalid CURL command')
  }

  const parsedData = parseCurlCommand(curlCommand)
  const fetchConfig = curlToFetch(parsedData)
  const url = parsedData.url

  if (!url) {
    throw new Error('URL is required')
  }

  if (!/https?:\/\//.test(url)) {
    throw new Error('Invalid URL format')
  }

  if (!fetchConfig.method) {
    fetchConfig.method = 'GET'
  }

  return fetch(url, fetchConfig)
}

/**
 * Lightweight syntax check for a curl string.
 * @param curlCommand Full curl CLI string
 */
export function validateCurlCommand(curlCommand: string): { isValid: boolean; error?: string } {
  try {
    const parsed = parseCurlCommand(curlCommand)

    if (!parsed.url) {
      return { isValid: false, error: 'URL is required' }
    }

    try {
      new URL(parsed.url)
    } catch {
      return { isValid: false, error: 'Invalid URL format' }
    }

    return { isValid: true }
  } catch (error) {
    return { isValid: false, error: `Failed to parse CURL command: ${error}` }
  }
}
