import { type MmNotificationType, showMmNotification } from '../mm-notification/index'

export type MmToastVariant = MmNotificationType

/** @deprecated Prefer {@link showMmNotification} — kept for existing call sites. */
export class MmToast {
  constructor(_root?: ParentNode) {
    void _root
  }

  show(message: string, variant: MmToastVariant = 'info'): void {
    showMmNotification(message, variant)
  }
}

export { type MmNotificationType, showMmNotification } from '../mm-notification/index'
