/// <reference path="./stackblitz/typings.d.ts" />

// Type declarations for this file (types from stackblitz/typings.d.ts)
// __BASE_URL__ is declared in stackblitz/typings.d.ts
declare interface GMXMLHttpRequestResponse {
  finalUrl: string
  readyState: number
  responseHeaders: string
  response: any
  responseText: string
  responseXML: Document | null
  status: number
  statusText: string
}
declare interface GMXMLHttpRequestError {
  error: string
  message?: string
}
declare interface GMXMLHttpRequestDetails {
  method: string
  url: string
  headers?: Record<string, string>
  data?: string | Document | Blob | FormData | ArrayBuffer | URLSearchParams
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  body?: any
  timeout?: number
  onload?: (response: GMXMLHttpRequestResponse) => void
  onerror?: (error: GMXMLHttpRequestError) => void
  onabort?: (error: GMXMLHttpRequestError) => void
  ontimeout?: (error: GMXMLHttpRequestError) => void
  onprogress?: (event: ProgressEvent) => void
}
declare function GM_xmlhttpRequest(details: GMXMLHttpRequestDetails): void

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_curl(content: string) {
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_preview(file: string, content: string) {
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

interface WaitForOptions {
  timeout?: boolean
}

type AsyncQuery =
  | (() => HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null)
  | (() => Promise<HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null>)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_waitFor<T extends AsyncQuery>(query: T, options?: WaitForOptions) {
  const { timeout: openTimeout } = options || {}
  return new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
    const timerId =
      openTimeout &&
      setTimeout(() => {
        observer?.disconnect()
        reject(new Error('Timeout'))
      }, 3e3)

    let observer: MutationObserver | null = null

    const checkAndResolve = async () => {
      try {
        const result = query()
        const node = result instanceof Promise ? await result : result
        if (node) {
          timerId && clearTimeout(timerId)
          observer?.disconnect()
          resolve(node as Awaited<ReturnType<T>>)
          return true
        }
      } catch (error) {
        // Silently handle errors in query to prevent breaking the watcher
        // eslint-disable-next-line no-console
        console.error('Error in GME_waitFor query:', error)
      }
      return false
    }

    // Check immediately once
    checkAndResolve().then((found) => {
      if (found) {
        return
      }

      observer = new MutationObserver(() => {
        checkAndResolve()
      })

      observer.observe(document.body, {
        subtree: true,
        childList: true,
      })
    })
  })
}

interface WatchForOptions {
  interval?: number
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_watchFor<T extends AsyncQuery>(query: T, callback: (node: NonNullable<Awaited<ReturnType<T>>>) => void, options?: WatchForOptions) {
  const { interval = 100 } = options || {}
  let observer: MutationObserver | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null
  let isActive = true

  const checkAndCallback = async () => {
    if (!isActive) {
      return
    }

    try {
      const result = query()
      const node = result instanceof Promise ? await result : result
      if (node) {
        callback(node as NonNullable<Awaited<ReturnType<T>>>)
      }
    } catch (error) {
      // Silently handle errors in callback to prevent breaking the watcher
      // eslint-disable-next-line no-console
      console.error('Error in GME_watchFor callback:', error)
    }
  }

  // Check immediately once
  checkAndCallback()

  // Use MutationObserver to watch DOM changes
  observer = new MutationObserver(() => {
    checkAndCallback()
  })

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })

  // Use interval timer as a fallback to ensure nothing is missed
  intervalId = setInterval(() => {
    checkAndCallback()
  }, interval)

  // Return cleanup function
  return () => {
    if (!isActive) {
      return
    }
    isActive = false
    observer?.disconnect()
    observer = null
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_ok(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%c✔ [OK]', 'color:#28a745;font-weight:700;', ...contents)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_info(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%cℹ [INFO]', 'color:#17a2b8;font-weight:700;', ...contents)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_fail(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%c✘ [FAIL]', 'color:#dc3545;font-weight:700;', ...contents)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_warn(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%c⚠ [WARN]', 'color:#ffc107;font-weight:700;', ...contents)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_uuid() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function GME_sha1(str: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
