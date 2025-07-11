export interface CurlParsedData {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  contentType?: string
}

/**
 * 解析 CURL 命令，提取其中的请求信息
 * @param curlCommand CURL 命令字符串
 * @returns 解析后的请求数据
 */
export function parseCurlCommand(curlCommand: string): CurlParsedData {
  // 移除开头的 curl 和引号
  let command = curlCommand.trim()
  if (command.startsWith('curl')) {
    command = command.substring(4).trim()
  }

  const result: CurlParsedData = {
    method: 'GET',
    url: '',
    headers: {},
  }

  // 分割命令参数
  const args = parseCurlArgs(command)

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    switch (arg) {
      case '-X':
      case '--request':
        if (nextArg) {
          result.method = nextArg.toUpperCase()
          i++ // 跳过下一个参数
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
        i++ // 跳过下一个参数
        break

      case '-d':
      case '--data':
      case '--data-raw':
        if (nextArg) {
          result.body = nextArg
          // 如果没有设置 Content-Type，默认为 application/x-www-form-urlencoded
          if (!result.headers['Content-Type'] && !result.headers['content-type']) {
            result.headers['Content-Type'] = 'application/x-www-form-urlencoded'
          }
        }
        i++ // 跳过下一个参数
        break

      case '--data-binary':
        if (nextArg) {
          result.body = nextArg
          if (!result.headers['Content-Type'] && !result.headers['content-type']) {
            result.headers['Content-Type'] = 'application/octet-stream'
          }
        }
        i++ // 跳过下一个参数
        break

      case '--json':
        if (nextArg) {
          result.body = nextArg
          result.headers['Content-Type'] = 'application/json'
        }
        i++ // 跳过下一个参数
        break

      case '-F':
      case '--form':
        if (nextArg) {
          // 处理表单数据
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
        i++ // 跳过下一个参数
        break

      case '-u':
      case '--user':
        if (nextArg) {
          const [username, password] = nextArg.split(':')
          const credentials = btoa(`${username}:${password || ''}`)
          result.headers['Authorization'] = `Basic ${credentials}`
        }
        i++ // 跳过下一个参数
        break

      case '-b':
      case '--cookie':
        if (nextArg) {
          result.headers['Cookie'] = nextArg
        }
        i++ // 跳过下一个参数
        break

      default:
        // 如果不是已知参数，可能是 URL
        if (!arg.startsWith('-') && !result.url) {
          result.url = arg.replace(/^["']|["']$/g, '')
        }
        break
    }
  }

  return result
}

/**
 * 解析 CURL 命令参数，处理引号和转义字符
 * @param command CURL 命令字符串
 * @returns 解析后的参数数组
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
      // 处理转义字符
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
 * 将解析后的 CURL 数据转换为 fetch 请求
 * @param parsedData 解析后的 CURL 数据
 * @returns fetch 请求的配置对象
 */
export function curlToFetch(parsedData: CurlParsedData): RequestInit {
  const fetchConfig: RequestInit = {
    method: parsedData.method,
    headers: parsedData.headers,
  }

  // 处理请求体
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
 * 执行 CURL 命令转换的 fetch 请求
 * @param curlCommand CURL 命令字符串
 * @returns fetch 响应
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
 * 验证 CURL 命令是否有效
 * @param curlCommand CURL 命令字符串
 * @returns 验证结果
 */
export function validateCurlCommand(curlCommand: string): { isValid: boolean; error?: string } {
  try {
    const parsed = parseCurlCommand(curlCommand)

    if (!parsed.url) {
      return { isValid: false, error: 'URL is required' }
    }

    // 验证 URL 格式
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
