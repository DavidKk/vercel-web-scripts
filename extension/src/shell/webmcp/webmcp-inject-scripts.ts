/**
 * Build MAIN-world JavaScript that lists WebMCP tools and registry metadata.
 * @returns Executable source for `chrome.userScripts.execute`
 */
export function buildListToolsProbeCode(): string {
  return `(async()=>{const out={ok:false,reason:"api_missing",tools:[],registryEntries:[],details:{}};try{const isSecure=typeof window!=="undefined"&&window.isSecureContext;const origin=typeof window!=="undefined"?window.location.origin:null;const testing=typeof navigator!=="undefined"?navigator.modelContextTesting:null;const registry=globalThis.__VWS_WEBMCP_TOOL_REGISTRY__;const registryEntries=registry&&typeof registry.entries==="function"?Array.from(registry.entries()):[];const hasListTools=typeof testing?.listTools==="function";const hasExecuteTool=typeof testing?.executeTool==="function";const hasGetTools=typeof document?.modelContext?.getTools==="function";out.details={isSecure,origin,hasTesting:Boolean(testing),hasListTools,hasExecuteTool,hasGetTools};if(!isSecure){out.reason="no_secure_context";return out;}let tools=[];if(hasListTools){tools=await testing.listTools();}else if(hasGetTools){tools=await document.modelContext.getTools();}else{out.reason="api_missing";return out;}out.ok=true;out.reason="supported";out.tools=Array.isArray(tools)?tools:[];out.registryEntries=registryEntries.map(([name,rec])=>({name,providerId:rec?.providerId,scriptKey:rec?.scriptKey,scriptFile:rec?.scriptFile,localName:rec?.localName,readOnlyHint:rec?.readOnlyHint,description:rec?.description}));return out;}catch(e){out.reason="internal_error";out.message=e instanceof Error?e.message:String(e);return out;}})();`
}

/**
 * Build MAIN-world JavaScript that executes a WebMCP tool by canonical name.
 * @param name Canonical tool name
 * @param args Tool arguments
 */
export function buildExecuteToolCode(name: string, args: Record<string, unknown>): string {
  const nameLiteral = JSON.stringify(name)
  const argsLiteral = JSON.stringify(args ?? {})
  return `(async()=>{const name=${nameLiteral};const args=${argsLiteral};const testing=navigator.modelContextTesting;if(typeof testing?.executeTool!=="function"){return{ok:false,reason:"api_missing",message:"executeTool unavailable"};}try{const result=await testing.executeTool(name,args);return{ok:true,result};}catch(e){return{ok:false,reason:"tool_execute_failed",message:e instanceof Error?e.message:String(e)};}})();`
}
