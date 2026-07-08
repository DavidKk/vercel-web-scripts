import type { EditorPageHandle, EditorPageSlot } from './EditorPageHandle'
import { EditorPageSlotUnavailableError } from './EditorPageSlotUnavailableError'

/**
 * Build a proxy slot that throws {@link EditorPageSlotUnavailableError} on every call.
 * @param slot Slot namespace name
 * @returns Stub implementation for {@link EditorPageHandle}
 */
export function createEditorUnavailableSlot<S extends EditorPageSlot>(slot: S): EditorPageHandle[S] {
  const fail = () => {
    throw new EditorPageSlotUnavailableError(slot)
  }
  const failAsync = async () => {
    fail()
  }

  switch (slot) {
    case 'session':
      return { getSnapshot: fail, getActiveOta: fail } as unknown as EditorPageHandle[S]
    case 'tabs':
      return { open: fail, switchTo: fail, list: fail, close: fail, closeOthers: fail } as unknown as EditorPageHandle[S]
    case 'buffer':
      return {
        getActive: fail,
        get: fail,
        apply: fail,
        listDirty: fail,
        applyPatch: fail,
        discard: fail,
        createFile: fail,
        renameFile: fail,
        deleteFile: fail,
        saveLocal: failAsync,
      } as unknown as EditorPageHandle[S]
    case 'publish':
      return { compile: failAsync, publishDebug: failAsync, publishStable: failAsync } as unknown as EditorPageHandle[S]
    case 'monaco':
      return { navigateToLine: fail } as unknown as EditorPageHandle[S]
    case 'ai':
      return {
        isAvailable: () => false,
        rewrite: failAsync,
        getPendingDiff: () => null,
        applyDiff: () => ({ ok: false, error: 'AI slot unavailable' }),
        rejectDiff: () => ({ ok: false }),
      } as unknown as EditorPageHandle[S]
    case 'rules':
      return {
        isAvailable: () => false,
        listForActiveScript: () => [],
        addRule: () => ({ ok: false, error: 'Rules slot unavailable' }),
        updateRule: () => ({ ok: false, error: 'Rules slot unavailable' }),
        deleteRule: () => ({ ok: false, error: 'Rules slot unavailable' }),
      } as unknown as EditorPageHandle[S]
    case 'layout':
      return {
        togglePanel: fail,
        getRightPanel: () => null,
        getLayout: fail,
      } as unknown as EditorPageHandle[S]
    case 'devMode':
      return {
        isEnabled: () => false,
        toggle: fail,
        getStatus: () => ({ enabled: false, hostId: null }),
        pushToPreset: failAsync,
      } as unknown as EditorPageHandle[S]
    default: {
      const exhaustive: never = slot
      return exhaustive
    }
  }
}
