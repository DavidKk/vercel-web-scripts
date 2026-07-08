/**
 * @jest-environment jsdom
 */
import { bindComboClickTrigger } from '@ext/ui/shared/combo-click-trigger'

describe('bindComboClickTrigger', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should fire onTrigger after targetCount clicks within idle window', () => {
    const element = document.createElement('button')
    const onTrigger = jest.fn()

    const unbind = bindComboClickTrigger(element, { targetCount: 3, idleMs: 500, onTrigger })

    element.click()
    element.click()
    expect(onTrigger).not.toHaveBeenCalled()

    element.click()
    expect(onTrigger).toHaveBeenCalledTimes(1)

    unbind()
  })

  it('should reset progress when idle gap exceeds idleMs', () => {
    const element = document.createElement('button')
    const onTrigger = jest.fn()

    const unbind = bindComboClickTrigger(element, { targetCount: 3, idleMs: 500, onTrigger })

    element.click()
    element.click()
    jest.advanceTimersByTime(501)
    element.click()
    element.click()
    element.click()
    expect(onTrigger).toHaveBeenCalledTimes(1)

    unbind()
  })

  it('should not double-fire while onTrigger is pending', async () => {
    const element = document.createElement('button')
    let resolveTrigger!: () => void
    const onTrigger = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTrigger = resolve
        })
    )

    const unbind = bindComboClickTrigger(element, { targetCount: 2, idleMs: 500, onTrigger })

    element.click()
    element.click()
    expect(onTrigger).toHaveBeenCalledTimes(1)

    element.click()
    element.click()
    expect(onTrigger).toHaveBeenCalledTimes(1)

    resolveTrigger()
    await Promise.resolve()

    unbind()
  })
})
