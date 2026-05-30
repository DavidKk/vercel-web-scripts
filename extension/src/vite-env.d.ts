/// <reference types="vite/client" />

/** Set by Vite watch build; empty in production `pnpm build:extension`. */
declare const __EXTENSION_DEV_RELOAD_SSE__: string

/** unplugin-icons ?raw: import icon as raw SVG string */
declare module '~icons/*?raw' {
  const src: string
  export default src
}
