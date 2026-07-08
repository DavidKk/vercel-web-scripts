import { PageSlotUnavailableError } from '@/initializer/webmcp'

import type { EditorPageSlot } from './EditorPageHandle'

/** Error thrown when a WebMCP tool calls an unmounted editor page slot. */
export class EditorPageSlotUnavailableError extends PageSlotUnavailableError<EditorPageSlot> {
  /**
   * @param slot Slot key
   */
  constructor(slot: EditorPageSlot) {
    super(slot)
    this.name = 'EditorPageSlotUnavailableError'
  }
}
