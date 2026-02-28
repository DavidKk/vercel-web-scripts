module.exports = {
  '**/*.{js,jsx,ts,tsx,d.tsx,md,yml,yaml,json,css,less,scss,sass,html,ejs,mjs}':
    'prettier --config .prettierrc.js --write',
  '**/*.{ts,tsx,d.ts,mjs}': (files) => {
    const filteredFiles = files.filter((file) => !file.includes('editor-typings.d.ts'))
    if (filteredFiles.length === 0) return null
    return `eslint --config eslint.config.mjs --max-warnings 0 ${filteredFiles.join(' ')}`
  },
}
