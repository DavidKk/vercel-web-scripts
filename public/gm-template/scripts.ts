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

          const content = response.responseText
          resolve(content)
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
