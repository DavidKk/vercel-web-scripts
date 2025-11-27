'use client'

import { type ComponentType, createContext, useContext } from 'react'

import type { UseOAuthLoginResult } from './useOAuthLogin'
import { useOAuthLogin } from './useOAuthLogin'

interface OAuthLoginContextValue extends UseOAuthLoginResult {}

const OAuthLoginContext = createContext<OAuthLoginContextValue | null>(null)

export function useOAuthLoginContext() {
  const context = useContext(OAuthLoginContext)
  if (!context) {
    throw new Error('useOAuthLoginContext must be used within a withOAuthLogin-wrapped component.')
  }
  return context
}

type WithOAuthLoginProps = {
  redirectUrl?: string
}

export function withOAuthLogin<T extends WithOAuthLoginProps>(Component: ComponentType<T>) {
  function WrappedComponent(props: T) {
    const { redirectUrl } = props
    const value = useOAuthLogin({ redirectUrl })
    return (
      <OAuthLoginContext.Provider value={value}>
        <Component {...props} />
      </OAuthLoginContext.Provider>
    )
  }

  WrappedComponent.displayName = `withOAuthLogin(${Component.displayName || Component.name || 'Component'})`

  return WrappedComponent
}
