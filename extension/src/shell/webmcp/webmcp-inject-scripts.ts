import { VWS_WEBMCP_PAGE_TOOL_HINTS_KEY, VWS_WEBMCP_TOOL_REGISTRY_KEY } from '@shared/webmcp/constants'

/**
 * Build MAIN-world JavaScript that lists WebMCP tools and MagickMonkey metadata.
 * @returns Executable source for `chrome.userScripts.execute`
 */
export function buildListToolsProbeCode(): string {
  // Keep as an IIFE string: runs in the page MAIN world via userScripts.execute.
  return `(async()=>{
  const REGISTRY_KEY=${JSON.stringify(VWS_WEBMCP_TOOL_REGISTRY_KEY)};
  const PAGE_HINTS_KEY=${JSON.stringify(VWS_WEBMCP_PAGE_TOOL_HINTS_KEY)};
  const out={ok:false,reason:"api_missing",tools:[],registryEntries:[],pageHintEntries:[],details:{}};
  try{
    const isSecure=typeof window!=="undefined"&&window.isSecureContext;
    const origin=typeof window!=="undefined"?window.location.origin:null;
    const testing=typeof navigator!=="undefined"?navigator.modelContextTesting:null;
    const registry=globalThis[REGISTRY_KEY];
    const pageHints=globalThis[PAGE_HINTS_KEY];
    const registryEntries=registry&&typeof registry.entries==="function"?Array.from(registry.entries()):[];
    const pageHintEntries=pageHints&&typeof pageHints.entries==="function"?Array.from(pageHints.entries()):[];
    const hasListTools=typeof testing?.listTools==="function";
    const hasExecuteTool=typeof testing?.executeTool==="function";
    const hasGetTools=typeof document?.modelContext?.getTools==="function";
    out.details={isSecure,origin,hasTesting:Boolean(testing),hasListTools,hasExecuteTool,hasGetTools};
    if(!isSecure){out.reason="no_secure_context";return out;}
    let tools=[];
    if(hasListTools){tools=await testing.listTools();}
    else if(hasGetTools){tools=await document.modelContext.getTools();}
    else{out.reason="api_missing";return out;}
    const normalizeReadOnly=(tool)=>{
      if(!tool||typeof tool!=="object"){return false;}
      if(tool.annotations&&tool.annotations.readOnlyHint===true){return true;}
      if(tool.annotations&&tool.annotations.readOnly===true){return true;}
      if(tool.readOnlyHint===true){return true;}
      return false;
    };
    out.ok=true;
    out.reason="supported";
    out.tools=Array.isArray(tools)?tools.map((tool)=>({
      name:tool&&tool.name,
      description:tool&&tool.description,
      inputSchema:tool&&tool.inputSchema,
      annotations:{readOnlyHint:normalizeReadOnly(tool)}
    })):[];
    out.registryEntries=registryEntries.map(([name,rec])=>({
      name,
      providerId:rec&&rec.providerId,
      scriptKey:rec&&rec.scriptKey,
      scriptFile:rec&&rec.scriptFile,
      localName:rec&&rec.localName,
      readOnlyHint:rec&&rec.readOnlyHint,
      description:rec&&rec.description
    }));
    out.pageHintEntries=pageHintEntries.map(([name,hint])=>({
      name,
      readOnlyHint:Boolean(hint&&hint.readOnlyHint===true)
    }));
    return out;
  }catch(e){
    out.reason="internal_error";
    out.message=e instanceof Error?e.message:String(e);
    return out;
  }
})();`.replace(/\n\s*/g, '')
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
