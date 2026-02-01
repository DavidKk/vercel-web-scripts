// ============================================================================
// HTTP / Network Functions
// ============================================================================
// GM_xmlhttpRequest, __BASE_URL__ 等类型由 preset/tsconfig 引入的 editor-typings.d.ts 提供

export function GME_curl(content: string) {
  if (!content) {
    throw new Error('Missing content')
  }

  return new Promise<any>((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: __BASE_URL__ + '/api/curl',
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      data: JSON.stringify({ content }),
      onload: function (response: GMXMLHttpRequestResponse) {
        if (response.readyState !== 4) {
          return
        }

        if (!(200 <= response.status && response.status < 400)) {
          throw new Error('Failed to request:' + response.statusText)
        }

        resolve(response.response)
      },
      onerror: function (error: GMXMLHttpRequestError) {
        reject(new Error('Failed to request:' + error.message))
      },
    })
  })
}

/**
 * Fetch-like function using GM_xmlhttpRequest
 * Compatible with standard fetch API but uses Tampermonkey's GM_xmlhttpRequest
 * @param input Request URL or Request object
 * @param init Optional request options (method, headers, body, etc.)
 * @returns Promise that resolves to a Response-like object
 */
export async function GME_fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Convert input to URL string
  let url: string
  if (typeof input === 'string') {
    url = input
  } else if (input instanceof URL) {
    url = input.toString()
  } else if (input instanceof Request) {
    url = input.url
    // Merge Request's init with provided init
    const requestInit: RequestInit = {
      method: input.method,
      headers: input.headers,
      body: input.body,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
      ...init,
    }
    init = requestInit
  } else {
    throw new TypeError('Invalid input type for GME_fetch')
  }

  const method = (init?.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {}

  // Convert Headers object to plain object
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      Object.assign(headers, init.headers)
    }
  }

  // Determine response type based on Accept header or default to text
  let responseType: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text' = 'text'
  const acceptHeader = headers['Accept'] || headers['accept'] || ''
  if (acceptHeader.includes('application/json')) {
    responseType = 'json'
  } else if (acceptHeader.includes('application/octet-stream') || acceptHeader.includes('*/*')) {
    responseType = 'arraybuffer'
  }

  // Convert body to string
  let bodyData: string | undefined
  if (init?.body) {
    if (typeof init.body === 'string') {
      bodyData = init.body
    } else if (init.body instanceof FormData) {
      // FormData needs special handling - convert to multipart/form-data format
      // For simplicity, convert to URLSearchParams format (only works for simple key-value pairs)
      const formData = new URLSearchParams()
      init.body.forEach((value, key) => {
        if (typeof value === 'string') {
          formData.append(key, value)
        } else if (value instanceof File) {
          // For File objects, we can't easily convert, so use JSON fallback
          // In practice, FormData with files should be handled differently
          formData.append(key, value.name)
        }
      })
      bodyData = formData.toString()
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    } else if (init.body instanceof URLSearchParams) {
      bodyData = init.body.toString()
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    } else if (init.body instanceof Blob) {
      // For Blob, we need to read it as text
      bodyData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsText(init.body as Blob)
      })
    } else if (init.body instanceof ArrayBuffer) {
      // Convert ArrayBuffer to string (base64 or text)
      const uint8Array = new Uint8Array(init.body)
      bodyData = Array.from(uint8Array)
        .map((b) => String.fromCharCode(b))
        .join('')
    } else {
      // Try to stringify as JSON
      bodyData = JSON.stringify(init.body)
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json'
      }
    }
  }

  return new Promise<Response>((resolve, reject) => {
    const requestDetails: GMXMLHttpRequestDetails = {
      method,
      url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      data: bodyData,
      responseType,
      timeout: init?.signal ? undefined : undefined, // Timeout handling would need signal support
    }

    GM_xmlhttpRequest({
      ...requestDetails,
      onload: function (response: GMXMLHttpRequestResponse) {
        if (response.readyState !== 4) {
          return
        }

        // Create Response-like object
        const responseHeaders = new Headers()
        if (response.responseHeaders) {
          const headerLines = response.responseHeaders.split('\r\n')
          for (const line of headerLines) {
            const colonIndex = line.indexOf(':')
            if (colonIndex > 0) {
              const key = line.slice(0, colonIndex).trim()
              const value = line.slice(colonIndex + 1).trim()
              responseHeaders.append(key, value)
            }
          }
        }

        // Create a Response-like object
        const responseBody = response.response || response.responseText || ''
        const responseObj = {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          url: response.finalUrl || url,
          redirected: response.finalUrl !== url,
          type: 'basic' as ResponseType,
          body: null as ReadableStream | null,
          bodyUsed: false,
          clone: function () {
            throw new Error('Response.clone() is not supported in GME_fetch')
          },
          arrayBuffer: async function (): Promise<ArrayBuffer> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            if (responseType === 'arraybuffer' && response.response instanceof ArrayBuffer) {
              return response.response
            }
            // Convert text to ArrayBuffer
            const encoder = new TextEncoder()
            const text = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
            const uint8Array = encoder.encode(text)
            // Create a new ArrayBuffer to ensure correct type
            return uint8Array.buffer.slice(0) as ArrayBuffer
          },
          blob: async function (): Promise<Blob> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            const mimeType = responseHeaders.get('content-type') || 'application/octet-stream'
            if (response.response instanceof Blob) {
              return response.response
            }
            const text = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
            return new Blob([text], { type: mimeType })
          },
          text: async function (): Promise<string> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            if (typeof responseBody === 'string') {
              return responseBody
            }
            return response.responseText || JSON.stringify(responseBody)
          },
          json: async function (): Promise<any> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            if (responseType === 'json' && typeof responseBody === 'object') {
              return responseBody
            }
            const text = typeof responseBody === 'string' ? responseBody : response.responseText
            try {
              return JSON.parse(text)
            } catch (error) {
              throw new SyntaxError('Unexpected end of JSON input')
            }
          },
          formData: async function (): Promise<FormData> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            const text = typeof responseBody === 'string' ? responseBody : response.responseText
            const formData = new FormData()
            const params = new URLSearchParams(text)
            params.forEach((value, key) => {
              formData.append(key, value)
            })
            return formData
          },
        }

        // Always resolve, even for error status codes (consistent with fetch API)
        resolve(responseObj as unknown as Response)
      },
      onerror: function (error: GMXMLHttpRequestError) {
        reject(new TypeError(`Failed to fetch: ${error.message || error.error}`))
      },
      ontimeout: function () {
        reject(new TypeError('Network request timeout'))
      },
      onabort: function () {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      },
    })
  })
}

export function GME_preview(file: string, content: string) {
  if (!file || !content) {
    throw new Error('Missing file or content')
  }

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = __BASE_URL__ + '/api/preview'
  form.target = '_blank'

  const fileInput = document.createElement('input')
  fileInput.type = 'hidden'
  fileInput.name = 'file'
  fileInput.value = file
  form.appendChild(fileInput)

  const contentInput = document.createElement('input')
  contentInput.type = 'hidden'
  contentInput.name = 'content'
  contentInput.value = content
  form.appendChild(contentInput)

  document.body.appendChild(form)
  form.submit()

  document.body.removeChild(form)
}
