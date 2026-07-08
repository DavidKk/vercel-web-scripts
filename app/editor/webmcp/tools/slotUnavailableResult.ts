import { EditorPageSlotUnavailableError } from '../EditorPageSlotUnavailableError'

/**
 * Map a slot error to a structured WebMCP tool result.
 * @param error Caught error
 * @returns Structured unavailable payload or rethrows
 */
export function toSlotUnavailableResult(error: unknown): { ok: false; error: 'slot_unavailable'; slot: string; message: string } {
  if (error instanceof EditorPageSlotUnavailableError) {
    return {
      ok: false,
      error: 'slot_unavailable',
      slot: error.slot,
      message: error.message,
    }
  }
  throw error
}
