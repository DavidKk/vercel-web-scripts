module.exports = {
  '**/*.{js,jsx,ts,tsx,d.tsx,md,yml,yaml,json,css,less,scss,sass,html,ejs,mjs}': (files) => {
    return ['prettier', '--config .prettierrc.js', '--write', ...files].join(' ')
  },
  '**/*.{ts,tsx,d.ts,mjs}': async (files) => {
    // Filter out editor-typings.d.ts as it's only for editor type hints
    const filteredFiles = files.filter((file) => !file.includes('editor-typings.d.ts'))
    if (filteredFiles.length === 0) {
      return null
    }
    return ['eslint', '--config eslint.config.mjs', '--max-warnings 0', ...filteredFiles].join(' ')
  },
}
