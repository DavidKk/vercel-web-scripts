/**
 * Vite raw import types for preset UI HTML/CSS
 */
declare module '*.html?raw' {
  const src: string
  export default src
}
declare module '*.css?raw' {
  const src: string
  export default src
}
