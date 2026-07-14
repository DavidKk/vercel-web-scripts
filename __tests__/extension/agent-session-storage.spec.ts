import { type AgentChatSession, createEmptySession, sanitizeAgentSessionStore, sessionHasContent } from '@ext/ui/sidepanel/agent-session-storage'

describe('agent-session-storage', () => {
  function sessionWithMessage(title: string, id = crypto.randomUUID()): AgentChatSession {
    return {
      id,
      title,
      messages: [
        {
          id: crypto.randomUUID(),
          kind: 'user',
          text: title,
          createdAt: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  it('should treat sessions with messages as contentful', () => {
    expect(sessionHasContent(createEmptySession())).toBe(false)
    expect(sessionHasContent(sessionWithMessage('hello'))).toBe(true)
  })

  it('should drop empty sessions and clear active id when nothing is persisted', () => {
    const empty = createEmptySession()
    const sanitized = sanitizeAgentSessionStore({
      activeSessionId: empty.id,
      sessions: [empty],
    })
    expect(sanitized.sessions).toEqual([])
    expect(sanitized.activeSessionId).toBeNull()
  })

  it('should keep only contentful sessions and a valid active id', () => {
    const empty = createEmptySession()
    const kept = sessionWithMessage('在吗')
    const sanitized = sanitizeAgentSessionStore({
      activeSessionId: kept.id,
      sessions: [empty, kept],
    })
    expect(sanitized.sessions.map((session) => session.id)).toEqual([kept.id])
    expect(sanitized.activeSessionId).toBe(kept.id)
  })

  it('should null active id when it pointed at a pruned empty session', () => {
    const empty = createEmptySession()
    const kept = sessionWithMessage('hello')
    const sanitized = sanitizeAgentSessionStore({
      activeSessionId: empty.id,
      sessions: [empty, kept],
    })
    expect(sanitized.sessions).toHaveLength(1)
    expect(sanitized.activeSessionId).toBeNull()
  })
})
