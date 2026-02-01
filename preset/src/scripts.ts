interface LoadScriptOptions {
  method?: string
  body?: any
  headers?: Record<string, string>
}

export async function loadScript(url: string, options?: LoadScriptOptions) {
  const { method = 'GET', body: data, headers } = options || {}

  return new Promise<string>((resolve, reject) => {
    const onload = (response: GMXMLHttpRequestResponse) => {
      if (!(200 <= response.status && response.status < 400)) {
        throw new Error(`Failed to load script in ${url}, status code ${response.status}: ${response.statusText}`)
      }

      resolve(response.responseText)
    }

    const onerror = (error: GMXMLHttpRequestError) => {
      reject(new Error(`Failed to load script in ${url}: ${error.message}`))
    }

    GM_xmlhttpRequest({ method, url, data, headers, onload, onerror })
  })
}

export async function fetchScript(scriptUrl: string) {
  return loadScript(scriptUrl)
}

export async function fetchCompileScript(host: string, files: Record<string, string>) {
  return loadScript(`${host}/tampermonkey/compile`, {
    method: 'POST',
    body: JSON.stringify({ files }),
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
