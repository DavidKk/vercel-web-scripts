import { enrichManagedScriptListWithUpdatedAt } from '../../extension/src/shared/extension-storage/script-list-cache'

describe('enrichManagedScriptListWithUpdatedAt', () => {
  it('fills missing updatedAt from gist revision time', () => {
    const gistUpdatedAt = 1761481200000
    const result = enrichManagedScriptListWithUpdatedAt(
      [
        { file: 'a.ts', name: 'A' },
        { file: 'b.ts', name: 'B', updatedAt: 1761481300000 },
      ],
      gistUpdatedAt
    )

    expect(result[0].updatedAt).toBe(gistUpdatedAt)
    expect(result[1].updatedAt).toBe(1761481300000)
  })

  it('returns rows unchanged when gist revision time is missing', () => {
    const scripts = [{ file: 'a.ts', name: 'A' }]
    expect(enrichManagedScriptListWithUpdatedAt(scripts, 0)).toEqual(scripts)
  })
})
