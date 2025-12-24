/**
 * Route prefixes that should hide global Nav and Footer
 * If the current path starts with these prefixes, Nav and Footer will not be displayed
 */
export const HIDDEN_ROUTES: string[] = ['/tampermonkey/editor']

export const DEFAULT_NAV = {
  tampermonkey: [
    { name: 'Install', href: '/tampermonkey' },
    { name: 'Rule', href: '/tampermonkey/rule' },
    { name: 'Editor', href: '/tampermonkey/editor' },
  ],
}
