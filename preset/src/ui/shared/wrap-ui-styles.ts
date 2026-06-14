import vwsScrollCss from './vws-scroll.css?raw'
import vwsUiTokensCss from './vws-ui-tokens.css?raw'

/** Prepend shared VWS design tokens and scroll styles before component-scoped CSS. */
export function wrapUiStyles(componentCss: string): string {
  return `${vwsUiTokensCss}\n${vwsScrollCss}\n${componentCss}`
}
