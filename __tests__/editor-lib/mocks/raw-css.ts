import fs from 'fs'
import path from 'path'

/** Jest stub for Vite `?raw` CSS imports — loads real editor-base.css for DOM tests. */
const cssPath = path.join(__dirname, '../../../editor-lib/src/styles/editor-base.css')
export default fs.readFileSync(cssPath, 'utf-8')
