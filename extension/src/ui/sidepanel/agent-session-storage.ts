import type { AgentUiMessage } from './agent-loop'

export const VWS_AGENT_CHAT_SESSIONS_KEY = 'vws_agent_chat_sessions'

const MAX_SESSIONS = 50

/** Persisted agent chat session. */
export interface AgentChatSession {
  id: string
  title: string
  messages: AgentUiMessage[]
  createdAt: number
  updatedAt: number
}

/** Agent chat session store in extension local storage. */
export interface AgentChatSessionStore {
  /** Active session id, or `null` when viewing an unsaved empty draft. */
  activeSessionId: string | null
  /** Only sessions that have at least one message. */
  sessions: AgentChatSession[]
}

/**
 * Whether a session has content and should be persisted.
 * @param session Chat session
 * @returns True when the session has messages
 */
export function sessionHasContent(session: AgentChatSession): boolean {
  return session.messages.length > 0
}

/**
 * Keep only sessions with messages and a valid active id.
 * @param store Session store
 * @returns Sanitized store (empty draft → `activeSessionId: null`)
 */
export function sanitizeAgentSessionStore(store: AgentChatSessionStore): AgentChatSessionStore {
  const sessions = store.sessions.filter(sessionHasContent).slice(0, MAX_SESSIONS)
  const activeSessionId = store.activeSessionId && sessions.some((session) => session.id === store.activeSessionId) ? store.activeSessionId : null

  return { activeSessionId, sessions }
}

/**
 * Create a new empty chat session (in-memory draft until content exists).
 * @param title Session title
 * @returns Empty session
 */
export function createEmptySession(title = 'New chat'): AgentChatSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Load chat sessions from extension storage.
 * Empty sessions are dropped; no content means no persisted session id.
 * @returns Sanitized session store
 */
export async function loadAgentSessionStore(): Promise<AgentChatSessionStore> {
  const stored = await chrome.storage.local.get(VWS_AGENT_CHAT_SESSIONS_KEY)
  const raw = stored[VWS_AGENT_CHAT_SESSIONS_KEY] as AgentChatSessionStore | undefined
  if (!raw?.sessions?.length) {
    return { activeSessionId: null, sessions: [] }
  }

  const sanitized = sanitizeAgentSessionStore({
    activeSessionId: raw.activeSessionId ?? null,
    sessions: raw.sessions,
  })

  // After pruning empties, restore the most recent chat if nothing is active.
  if (!sanitized.activeSessionId && sanitized.sessions.length) {
    const newest = [...sanitized.sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    sanitized.activeSessionId = newest?.id ?? null
  }

  return sanitized
}

/**
 * Persist chat sessions to extension storage (content-only).
 * @param store Session store
 */
export async function saveAgentSessionStore(store: AgentChatSessionStore): Promise<void> {
  const sanitized = sanitizeAgentSessionStore(store)
  await chrome.storage.local.set({
    [VWS_AGENT_CHAT_SESSIONS_KEY]: sanitized,
  })
  store.activeSessionId = sanitized.activeSessionId
  store.sessions = sanitized.sessions
}
