declare interface MenuItem {
  id: string
  text: string
  icon?: string
  hint?: string
  action?: () => void
}

declare function GME_registerMenuCommand(item: MenuItem): any

declare interface WaitForOptions {
  timeout?: boolean
}

type Query = () => HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null

declare function GME_curl(content: string): Promise<any>
declare function GME_preview(file: string, content: string): void
declare function GME_waitFor<T extends () => any>(query: T, options?: WaitForOptions): Promise<ReturnType<T>>
declare function GME_sleep(ms: number): Promise<unknown>
declare function GME_ok(...contents: any[]): void
declare function GME_info(...contents: any[]): void
declare function GME_fail(...contents: any[]): void
declare function GME_warn(...contents: any[]): void
declare function GME_uuid(): string
declare function GME_notification(message: string, type: 'success' | 'error' | 'info' | 'warn', duration: any): any
