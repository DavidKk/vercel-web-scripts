import { VWS_WEBMCP_TOOL_REGISTRY_KEY } from '@shared/webmcp/constants'
import { registerVwsWebMcpTool } from '@shared/webmcp/register-tool'
import type { DocumentModelContext } from '@shared/webmcp/types'

describe('registerVwsWebMcpTool', () => {
  const originalDocument = globalThis.document
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator })
    delete (globalThis as Record<string, unknown>)[VWS_WEBMCP_TOOL_REGISTRY_KEY]
    delete (globalThis as Record<string, unknown>).__VWS_WEBMCP_UNSUPPORTED_WARNED__
  })

  function installModelContext(registerTool: DocumentModelContext['registerTool']) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { modelContext: { registerTool } },
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    })
  }

  it('should register tool with vws canonical name and registry record', async () => {
    const registered: Array<{ name: string; title?: string }> = []
    installModelContext(async (definition) => {
      registered.push({ name: definition.name, title: definition.title })
    })

    const result = await registerVwsWebMcpTool(
      {
        name: 'toggle_danmaku',
        description: 'Toggle danmaku',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
      },
      { scriptKey: 'shop-key', scriptFile: 'demo.user.ts' }
    )

    expect(result).toEqual({ ok: true, canonicalName: 'vws.shop-key.toggle_danmaku' })
    expect(registered).toEqual([{ name: 'vws.shop-key.toggle_danmaku', title: 'MagickMonkey · toggle_danmaku' }])

    const registry = (globalThis as Record<string, unknown>)[VWS_WEBMCP_TOOL_REGISTRY_KEY] as Map<string, { scriptFile: string }>
    expect(registry.get('vws.shop-key.toggle_danmaku')?.scriptFile).toBe('demo.user.ts')
  })

  it('should return duplicate when canonical name already exists', async () => {
    installModelContext(async () => undefined)
    const definition = {
      name: 'toggle_danmaku',
      description: 'Toggle danmaku',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    }
    const options = { scriptKey: 'shop-key' }

    const first = await registerVwsWebMcpTool(definition, options)
    const second = await registerVwsWebMcpTool(definition, options)

    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, reason: 'duplicate' })
  })

  it('should remove registry entry when abort signal fires', async () => {
    installModelContext(async (_definition, options) => {
      options?.signal?.addEventListener('abort', () => {
        // registerTool abort is driven by the test via controller.abort()
      })
    })

    const controller = new AbortController()
    const result = await registerVwsWebMcpTool(
      {
        name: 'enter_fullscreen',
        description: 'Fullscreen',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
      },
      { scriptKey: 'shop-key', signal: controller.signal }
    )

    expect(result.ok).toBe(true)
    const registry = (globalThis as Record<string, unknown>)[VWS_WEBMCP_TOOL_REGISTRY_KEY] as Map<string, unknown>
    expect(registry.has('vws.shop-key.enter_fullscreen')).toBe(true)

    controller.abort()
    expect(registry.has('vws.shop-key.enter_fullscreen')).toBe(false)
  })

  it('should reject reserved scriptKey page', async () => {
    installModelContext(async () => undefined)

    const result = await registerVwsWebMcpTool(
      {
        name: 'snapshot',
        description: 'Should not register',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
      },
      { scriptKey: 'page' }
    )

    expect(result).toMatchObject({ ok: false, reason: 'invalid_script_key' })
    expect(result.message).toMatch(/reserved/i)
  })

  it('should allow reserved scriptKey page when allowReservedPageScriptKey is set', async () => {
    installModelContext(async () => undefined)

    const result = await registerVwsWebMcpTool(
      {
        name: 'snapshot',
        description: 'Builtin snapshot',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
      },
      { scriptKey: 'page', scriptFile: '__builtin__/page-tools', allowReservedPageScriptKey: true }
    )

    expect(result).toEqual({ ok: true, canonicalName: 'vws.page.snapshot' })
  })

  it('should return unsupported when modelContext is missing', async () => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {} })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })

    const warnings: string[] = []
    const result = await registerVwsWebMcpTool(
      {
        name: 'toggle_danmaku',
        description: 'Toggle danmaku',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
      },
      { scriptKey: 'shop-key', warn: (message) => warnings.push(message) }
    )

    expect(result).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(warnings.some((line) => line.includes('unavailable'))).toBe(true)
  })

  it('should wrap execute errors into structured results', async () => {
    installModelContext(async (definition) => {
      const output = await definition.execute({})
      expect(output).toMatchObject({ ok: false, error: 'tool_execute_failed' })
    })

    await registerVwsWebMcpTool(
      {
        name: 'fail_tool',
        description: 'Fails',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          throw new Error('boom')
        },
      },
      { scriptKey: 'shop-key' }
    )
  })
})
