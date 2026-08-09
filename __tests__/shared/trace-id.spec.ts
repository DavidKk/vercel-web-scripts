import {
  createTraceId,
  enterTraceScope,
  exitTraceScope,
  getActiveTraceId,
  normalizeTraceId,
  PAGE_TRACE_ID_GLOBAL_KEY,
  peekTraceIdFromArgs,
  publishPageTraceId,
  readPageTraceId,
  readTraceIdFromHeaders,
  resolveLogTraceId,
  shortTraceId,
  TRACE_ID_HEADER,
  TRACE_ID_HEX_LENGTH,
  withTraceScope,
} from '@shared/trace-id'

describe('trace-id', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[PAGE_TRACE_ID_GLOBAL_KEY]
    while (getActiveTraceId()) {
      exitTraceScope()
    }
  })

  it('should create a continuous hex trace id', () => {
    const id = createTraceId()
    expect(id).toMatch(/^[0-9a-f]+$/)
    expect(id).toHaveLength(TRACE_ID_HEX_LENGTH)
    expect(normalizeTraceId(id)).toBe(id)
  })

  it('should normalize hex ids and legacy uuids', () => {
    expect(normalizeTraceId(' 550E8400E29B41D4 ')).toBe('550e8400e29b41d4')
    expect(normalizeTraceId('550E8400-E29B-41D4-A716-446655440000')).toBe('550e8400e29b41d4a716446655440000')
    expect(normalizeTraceId('not-a-trace')).toBeUndefined()
    expect(normalizeTraceId('abcd')).toBeUndefined()
    expect(normalizeTraceId(null)).toBeUndefined()
  })

  it('should read trace id from headers', () => {
    const headers = new Headers({ [TRACE_ID_HEADER]: '550e8400e29b41d4' })
    expect(readTraceIdFromHeaders(headers)).toBe('550e8400e29b41d4')
  })

  it('should shorten trace id to eight hex chars', () => {
    expect(shortTraceId('550e8400e29b41d4')).toBe('550e8400')
    expect(shortTraceId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400')
    expect(shortTraceId('bad')).toBe('')
  })

  it('should peek traceId from action-style option objects', () => {
    expect(peekTraceIdFromArgs([{ saveAsDebug: true, traceId: '550e8400e29b41d4' }])).toBe('550e8400e29b41d4')
    expect(peekTraceIdFromArgs(['file.ts', { traceId: 'nope' }])).toBeUndefined()
  })

  it('should nest enter/exit trace scopes', () => {
    expect(getActiveTraceId()).toBeUndefined()
    const outer = enterTraceScope('550e8400e29b41d4')
    expect(getActiveTraceId()).toBe(outer)
    const inner = enterTraceScope()
    expect(getActiveTraceId()).toBe(inner)
    expect(inner).not.toBe(outer)
    exitTraceScope()
    expect(getActiveTraceId()).toBe(outer)
    exitTraceScope()
    expect(getActiveTraceId()).toBeUndefined()
  })

  it('should run withTraceScope and always exit', () => {
    expect(() =>
      withTraceScope(() => {
        expect(getActiveTraceId()).toBeTruthy()
        throw new Error('boom')
      }, '550e8400e29b41d4')
    ).toThrow('boom')
    expect(getActiveTraceId()).toBeUndefined()
  })

  it('should publish and read page-global TraceId', () => {
    const id = createTraceId()
    expect(publishPageTraceId(id)).toBe(id)
    expect(readPageTraceId()).toBe(id)
    expect(resolveLogTraceId()).toBe(id)
  })
})
