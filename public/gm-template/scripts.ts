async function fetchScript(scriptUrl: string) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: scriptUrl,
      onload: function (response) {
        try {
          if (!(200 <= response.status && response.status < 400)) {
            throw new Error('Failed to load remote script: ' + response.statusText)
          }

          const headers = new Headers()
          response.responseHeaders.split('\n').forEach((header) => {
            const parts = header.split(':')
            const [key, value] = parts || []
            headers.set(key.trim(), value.trim())
          })

          const etag = headers.get('etag')
          const content = response.responseText
          resolve({ etag, content })
        } catch (error) {
          const finalError = error instanceof Error ? error : typeof error === 'string' ? new Error(error) : new Error('Unknown error')
          reject(new Error('Error executing remote script: ' + finalError.message))
        }
      },
      onerror: function (error) {
        reject(new Error('Failed to load remote script:' + error.message))
      },
    })
  })
}
