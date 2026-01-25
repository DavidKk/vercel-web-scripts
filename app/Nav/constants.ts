/**
 * Route prefixes that should hide global Nav
 * If the current path starts with these prefixes, Nav will not be displayed
 */
export const HIDDEN_ROUTES: string[] = ['/editor', '/tampermonkey/editor', '/login', '/']

export const DEFAULT_NAV = {
  tampermonkey: [
    { name: 'Install', href: '/tampermonkey' },
    { name: 'Rule', href: '/tampermonkey/rule' },
    { name: 'Editor', href: '/tampermonkey/editor' },
  ],
}
