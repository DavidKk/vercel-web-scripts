import { isTrustedTypesHtmlError } from '../../preset/src/helpers/safe-inner-html'

describe('safe-inner-html', () => {
  it('isTrustedTypesHtmlError detects TrustedHTML assignment errors', () => {
    expect(isTrustedTypesHtmlError(new Error("Failed to set the 'innerHTML' property: TrustedHTML"))).toBe(true)
    expect(isTrustedTypesHtmlError(new Error('other'))).toBe(false)
  })
})
