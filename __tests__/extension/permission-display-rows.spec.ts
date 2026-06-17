import { buildPermissionDisplayRows, groupPermissionRowsByScript, isDebugPermissionScriptFile, resolveDebugScriptDisplayName } from '@ext/ui/permissions/permission-display-rows'
import { buildScriptPermissionRegistryKey } from '@shared/script-permission'

describe('buildPermissionDisplayRows', () => {
  const request = {
    scriptKey: 'shop-key',
    file: 'shopline-debug.ts',
    capability: 'unsafe-window' as const,
    resource: '*',
  }
  const key = buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)

  it('should prefer persistent grant over once history for the same key', () => {
    const rows = buildPermissionDisplayRows({
      registryEntries: [{ key, request, entry: { decision: 'allow', updatedAt: 200 } }],
      sessionEntries: [],
      historyEntries: [
        {
          id: 'once:1',
          tabId: 99,
          key,
          request,
          decision: 'allow',
          remember: 'once',
          decidedAt: 100,
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.scope).toBe('persistent')
    expect(rows[0]?.policy).toBe('allow')
    expect(rows[0]?.rowId).toBe(`registry:${key}`)
  })

  it('should show session grant when no persistent entry exists', () => {
    const rows = buildPermissionDisplayRows({
      registryEntries: [],
      sessionEntries: [{ tabId: 42, key, request, decision: 'allow' }],
      historyEntries: [],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.scope).toBe('session')
    expect(rows[0]?.policy).toBe('allow')
    expect(rows[0]?.tabId).toBe(42)
  })

  it('should keep only the latest once-only row per key', () => {
    const rows = buildPermissionDisplayRows({
      registryEntries: [],
      sessionEntries: [],
      historyEntries: [
        {
          id: 'once:old',
          tabId: 1,
          key,
          request,
          decision: 'allow',
          remember: 'once',
          decidedAt: 50,
        },
        {
          id: 'once:new',
          tabId: 2,
          key,
          request,
          decision: 'deny',
          remember: 'once',
          decidedAt: 150,
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.rowId).toBe('once:new')
    expect(rows[0]?.decision).toBe('deny')
    expect(rows[0]?.policy).toBe('deny')
  })

  it('should map once allow history to ask policy', () => {
    const rows = buildPermissionDisplayRows({
      registryEntries: [],
      sessionEntries: [],
      historyEntries: [
        {
          id: 'once:allow',
          tabId: 1,
          key,
          request,
          decision: 'allow',
          remember: 'once',
          decidedAt: 100,
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.policy).toBe('ask')
  })

  it('should map registry ask policy to ask in admin rows', () => {
    const rows = buildPermissionDisplayRows({
      registryEntries: [{ key, request, entry: { decision: 'allow', adminPolicy: 'ask', updatedAt: 300 } }],
      sessionEntries: [],
      historyEntries: [],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.policy).toBe('ask')
  })

  it('should sort debug script files to the bottom', () => {
    const debugRequest = { ...request, file: '__debug-command-palette__.ts' }
    const debugKey = buildScriptPermissionRegistryKey(debugRequest.scriptKey, debugRequest.file, debugRequest.capability, debugRequest.resource)
    const rows = buildPermissionDisplayRows({
      registryEntries: [
        { key: debugKey, request: debugRequest, entry: { decision: 'allow', updatedAt: 999 } },
        { key, request, entry: { decision: 'allow', updatedAt: 100 } },
      ],
      sessionEntries: [],
      historyEntries: [],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]?.file).toBe('shopline-debug.ts')
    expect(rows[1]?.file).toBe('__debug-command-palette__.ts')
  })

  it('should group rows by script file with stable index ordering', () => {
    const debugFile = '__debug-command-palette__.ts'
    const debugNetworkKey = buildScriptPermissionRegistryKey(request.scriptKey, debugFile, 'network', 'example.com')
    const debugClipboardKey = buildScriptPermissionRegistryKey(request.scriptKey, debugFile, 'clipboard-write', '*')
    const rows = buildPermissionDisplayRows({
      registryEntries: [
        { key, request, entry: { decision: 'allow', updatedAt: 200 } },
        {
          key: debugNetworkKey,
          request: { ...request, file: debugFile, capability: 'network', resource: 'example.com' },
          entry: { decision: 'allow', adminPolicy: 'ask', updatedAt: 150 },
        },
        {
          key: debugClipboardKey,
          request: { ...request, file: debugFile, capability: 'clipboard-write', resource: '*' },
          entry: { decision: 'allow', adminPolicy: 'ask', updatedAt: 100 },
        },
      ],
      sessionEntries: [],
      historyEntries: [],
    })
    const groups = groupPermissionRowsByScript(rows, new Map([[`${request.scriptKey}:${debugFile}`, 'Command Palette Debug']]))

    expect(groups).toHaveLength(2)
    expect(groups[0]?.file).toBe('shopline-debug.ts')
    expect(groups[0]?.index).toBe(1)
    expect(groups[0]?.rows).toHaveLength(1)
    expect(groups[1]?.file).toBe(debugFile)
    expect(groups[1]?.index).toBe(2)
    expect(groups[1]?.scriptName).toBe('Command Palette Debug')
    expect(groups[1]?.rows).toHaveLength(2)
  })

  it('should use default display name for debug scripts without script list entry', () => {
    const debugFile = '__debug-command-palette__.ts'
    const debugKey = buildScriptPermissionRegistryKey(request.scriptKey, debugFile, 'network', 'example.com')
    const rows = buildPermissionDisplayRows({
      registryEntries: [{ key: debugKey, request: { ...request, file: debugFile }, entry: { decision: 'allow', adminPolicy: 'ask', updatedAt: 100 } }],
      sessionEntries: [],
      historyEntries: [],
    })
    const groups = groupPermissionRowsByScript(rows, new Map())

    expect(groups).toHaveLength(1)
    expect(groups[0]?.scriptName).toBe('Command palette')
    expect(groups[0]?.file).toBe(debugFile)
  })
})

describe('resolveDebugScriptDisplayName', () => {
  it('should map known debug script files to friendly labels', () => {
    expect(resolveDebugScriptDisplayName('__debug-command-palette__.ts')).toBe('Command palette')
    expect(resolveDebugScriptDisplayName('__debug-permission-test__.ts')).toBe('Permission test')
  })

  it('should derive a title from unknown debug script filenames', () => {
    expect(resolveDebugScriptDisplayName('__debug-custom-hook__.ts')).toBe('Custom Hook')
  })

  it('should return null for non-debug script files', () => {
    expect(resolveDebugScriptDisplayName('shopline-debug.ts')).toBeNull()
  })
})

describe('isDebugPermissionScriptFile', () => {
  it('should detect internal debug script filenames', () => {
    expect(isDebugPermissionScriptFile('__debug-command-palette__.ts')).toBe(true)
    expect(isDebugPermissionScriptFile('__debug-permission-test__.ts')).toBe(true)
    expect(isDebugPermissionScriptFile('shopline-debug.ts')).toBe(false)
  })
})
