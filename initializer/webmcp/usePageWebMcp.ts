'use client'

import { useEffect, useRef } from 'react'

import type { WebMcpToolDefinition } from './modelContext'
import { getDocumentModelContext, getWebMcpSupportReport, isWebMcpSupported } from './modelContext'
import { assertPageLevelWebMcpRegistration, registerPageTools, releasePageLevelWebMcpRegistration } from './registerPageTool'

const DEV_LOG_PREFIX = '[WebMCP]'

/**
 * Register WebMCP tools once per page mount (single registrar per page id).
 * @param pageId Stable page id
 * @param buildTools Factory that returns tool definitions for this page
 */
export function usePageWebMcp(pageId: string, buildTools: () => WebMcpToolDefinition[]): void {
  const buildToolsRef = useRef(buildTools)
  buildToolsRef.current = buildTools

  useEffect(() => {
    const controller = new AbortController()
    let hasRegistered = false
    let isRegistering = false
    let hasLoggedUnsupported = false
    let attemptCount = 0

    const logUnsupported = () => {
      if (hasLoggedUnsupported || process.env.NODE_ENV !== 'development') {
        return
      }
      hasLoggedUnsupported = true
      const report = getWebMcpSupportReport()
      // eslint-disable-next-line no-console -- dev-only environment diagnostics
      console.warn(`${DEV_LOG_PREFIX} page "${pageId}" skipped tool registration`, report)
    }

    const tryRegister = async () => {
      if (controller.signal.aborted || hasRegistered || isRegistering) {
        return
      }

      attemptCount += 1
      if (!isWebMcpSupported()) {
        if (attemptCount >= 3) {
          logUnsupported()
        }
        return
      }

      isRegistering = true
      try {
        assertPageLevelWebMcpRegistration(pageId)
        const tools = buildToolsRef.current()
        await registerPageTools(pageId, tools, controller.signal)
        hasRegistered = true

        if (process.env.NODE_ENV === 'development') {
          const modelContext = getDocumentModelContext()
          const registeredNames = tools.map((tool) => tool.name)
          let discoveredNames: string[] | null = null
          if (modelContext?.getTools) {
            try {
              const discovered = await modelContext.getTools()
              discoveredNames = discovered.map((tool) => tool.name)
            } catch {
              discoveredNames = null
            }
          }

          // eslint-disable-next-line no-console -- dev-only registration confirmation
          console.info(`${DEV_LOG_PREFIX} registered ${registeredNames.length} tool(s) for page "${pageId}"`, {
            registered: registeredNames,
            discovered: discoveredNames,
          })
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console -- dev-only registrar failure
          console.error(`${DEV_LOG_PREFIX} failed to register page tools (${pageId})`, error)
        }
      } finally {
        isRegistering = false
      }
    }

    void tryRegister()
    const timer = window.setInterval(() => {
      void tryRegister()
    }, 1000)

    return () => {
      window.clearInterval(timer)
      controller.abort()
      releasePageLevelWebMcpRegistration(pageId)
    }
  }, [pageId])
}
