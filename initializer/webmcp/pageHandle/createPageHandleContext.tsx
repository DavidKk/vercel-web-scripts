'use client'

import { createContext, type MutableRefObject, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react'

export interface PageHandleBuildArgs<Slot extends string, Handle extends Record<Slot, unknown>> {
  /** Stable page id from the provider. */
  pageId: string
  /**
   * List slot namespaces currently mounted.
   * @returns Mounted slot keys
   */
  listMountedSlots: () => Slot[]
  /**
   * Read a slot implementation or an unavailable stub.
   * @param key Slot namespace
   * @returns Slot implementation
   */
  readSlot: <K extends Slot>(key: K) => Handle[K]
}

export interface CreatePageHandleContextOptions<Slot extends string, Handle extends Record<Slot, unknown>> {
  /** Label for dev warnings (e.g. `EditorPageHandle`). */
  displayName: string
  /**
   * Build the aggregated page handle.
   * @param args Page id, mounted slots, and slot reader
   * @returns Full handle
   */
  buildHandle: (args: PageHandleBuildArgs<Slot, Handle>) => Handle
  /**
   * Stub when a slot is not mounted.
   * @param slot Slot key
   * @returns Unavailable slot implementation
   */
  createUnavailableSlot: <K extends Slot>(key: K) => Handle[K]
}

export interface PageHandleContextValue<Slot extends string, Handle extends Record<Slot, unknown>> {
  /**
   * Mount a slot implementation (one registration per slot name; duplicates are rejected).
   * @param key Slot namespace
   * @param implRef Ref to the live implementation
   * @param owner Debug label
   * @returns Cleanup that unmounts the slot, or a no-op when registration was rejected
   */
  registerSlot: <K extends Slot>(key: K, implRef: MutableRefObject<Handle[K]>, owner: string) => () => void
  /**
   * Resolve the aggregated page handle.
   * @returns Full handle
   */
  getHandle: () => Handle
}

/**
 * Create a page-level handle provider and hooks (imperative-handle style slot registry).
 * @param options Factory configuration
 * @returns Provider component and hooks
 */
export function createPageHandleContext<Slot extends string, Handle extends Record<Slot, unknown>>(options: CreatePageHandleContextOptions<Slot, Handle>) {
  const Context = createContext<PageHandleContextValue<Slot, Handle> | null>(null)

  interface SlotEntry {
    owner: string
    implRef: MutableRefObject<Handle[Slot]>
  }

  type SlotStore = Partial<Record<Slot, SlotEntry>>

  interface ProviderProps {
    pageId: string
    children: ReactNode
  }

  /**
   * Aggregates slot implementations for a single page instance.
   * @param props Provider props
   * @returns Context provider
   */
  function PageHandleProvider({ pageId, children }: ProviderProps) {
    const slotsRef = useRef<SlotStore>({})

    const registerSlot = useCallback(<K extends Slot>(key: K, implRef: MutableRefObject<Handle[K]>, owner: string) => {
      const previous = slotsRef.current[key]
      if (previous) {
        if (previous.implRef === implRef) {
          return () => {
            const current = slotsRef.current[key]
            if (current?.implRef === implRef) {
              delete slotsRef.current[key]
            }
          }
        }

        // eslint-disable-next-line no-console -- duplicate slot registration must be visible
        console.warn(
          `[${options.displayName}] slot "${String(key)}" is already registered by "${previous.owner}"; ` +
            `rejected registration from "${owner}". Use a distinct slot name or remove the existing owner.`
        )
        return () => {}
      }

      slotsRef.current[key] = { owner, implRef: implRef as MutableRefObject<Handle[Slot]> }

      return () => {
        const current = slotsRef.current[key]
        if (current?.implRef === implRef) {
          delete slotsRef.current[key]
        }
      }
    }, [])

    const getHandle = useCallback((): Handle => {
      const store = slotsRef.current

      const listMountedSlots = () => Object.keys(store) as Slot[]

      const readSlot = <K extends Slot>(key: K): Handle[K] => {
        const entry = store[key]
        const impl = entry?.implRef.current as Handle[K] | undefined
        return impl ?? options.createUnavailableSlot(key)
      }

      return options.buildHandle({ pageId, listMountedSlots, readSlot })
    }, [pageId])

    const value = useMemo(() => ({ registerSlot, getHandle }), [registerSlot, getHandle])

    return <Context.Provider value={value}>{children}</Context.Provider>
  }

  /**
   * Access the page handle context.
   * @returns Context value
   */
  function usePageHandleContext(): PageHandleContextValue<Slot, Handle> {
    const ctx = useContext(Context)
    if (!ctx) {
      throw new Error(`${options.displayName} provider is missing`)
    }
    return ctx
  }

  /**
   * Access the page handle context when a provider is present (otherwise null).
   * @returns Context value or null
   */
  function useOptionalPageHandleContext(): PageHandleContextValue<Slot, Handle> | null {
    return useContext(Context)
  }

  /**
   * Mount a slot implementation on the page handle.
   * @param key Slot namespace
   * @param impl Live implementation (kept fresh via an internal ref)
   * @param owner Component label for overwrite diagnostics
   */
  function usePageSlot<K extends Slot>(key: K, impl: Handle[K], owner: string): void {
    const { registerSlot } = usePageHandleContext()
    const implRef = useRef(impl)
    implRef.current = impl

    useEffect(() => {
      return registerSlot(key, implRef, owner)
    }, [key, owner, registerSlot])
  }

  /**
   * Mount a slot when a page handle provider is present (no-op otherwise).
   * @param key Slot namespace
   * @param impl Live implementation (kept fresh via an internal ref)
   * @param owner Component label for overwrite diagnostics
   */
  function useOptionalPageSlot<K extends Slot>(key: K, impl: Handle[K], owner: string): void {
    const ctx = useOptionalPageHandleContext()
    const implRef = useRef(impl)
    implRef.current = impl

    useEffect(() => {
      if (!ctx) {
        return
      }
      return ctx.registerSlot(key, implRef, owner)
    }, [ctx, key, owner])
  }

  return {
    PageHandleProvider,
    usePageHandleContext,
    useOptionalPageHandleContext,
    usePageSlot,
    useOptionalPageSlot,
  }
}
