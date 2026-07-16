/**
 * chrome.userScripts.execute + InjectionResult (Chrome 135+).
 * Used when root `tsc` typechecks extension sources via __tests__ imports.
 */
declare namespace chrome.userScripts {
  interface InjectionResult {
    documentId?: string
    frameId?: number
    /** Value returned by the injected script (Chrome 135+). */
    result?: unknown
    error?: string
  }

  interface ExecuteTarget {
    tabId: number
    frameIds?: number[]
    allFrames?: boolean
    documentIds?: string[]
  }

  interface ExecuteDetails {
    target: ExecuteTarget
    world?: ExecutionWorld
    injectImmediately?: boolean
    js: ScriptSource[]
  }

  function execute(details: ExecuteDetails): Promise<InjectionResult[]>
}
