import { createMcpSkillResourceProvider } from '@/app/api/mcp/skillResources'

describe('createMcpSkillResourceProvider', () => {
  const provider = createMcpSkillResourceProvider()

  it('should list all skill resources including gme-webmcp', () => {
    const resources = provider.listResources()
    const uris = resources.map((resource) => resource.uri)

    expect(uris).toEqual([
      'skill://magickmonkey/scripts-routing.md',
      'skill://magickmonkey/scripts-ui-skill.md',
      'skill://magickmonkey/scripts-ai-skill.md',
      'skill://magickmonkey/gme-webmcp-skill.md',
    ])
  })

  it('should read gme-webmcp skill markdown', async () => {
    const result = await provider.readResource('skill://magickmonkey/gme-webmcp-skill.md')

    expect(result).not.toBeNull()
    expect(result?.mimeType).toBe('text/markdown')
    expect(result?.text).toContain('GME_registerWebMcpTool')
  })

  it('should accept legacy gme-webmcp uri without suffix', async () => {
    const result = await provider.readResource('skill://magickmonkey/gme-webmcp-skill')

    expect(result).not.toBeNull()
    expect(result?.text).toContain('GME_registerWebMcpTool')
  })
})
