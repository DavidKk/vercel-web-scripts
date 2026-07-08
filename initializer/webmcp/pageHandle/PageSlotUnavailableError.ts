/**
 * Thrown when a WebMCP tool calls a page slot that is not mounted.
 */
export class PageSlotUnavailableError<Slot extends string = string> extends Error {
  /** Slot namespace that was not mounted. */
  readonly slot: Slot

  /**
   * @param slot Slot key
   */
  constructor(slot: Slot) {
    super(`Page slot "${slot}" is not mounted`)
    this.name = 'PageSlotUnavailableError'
    this.slot = slot
  }
}
