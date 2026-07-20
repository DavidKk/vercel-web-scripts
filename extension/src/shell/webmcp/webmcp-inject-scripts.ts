import { VWS_WEBMCP_PAGE_TOOL_HINTS_KEY, VWS_WEBMCP_TOOL_REGISTRY_KEY } from '@shared/webmcp/constants'

/**
 * Build MAIN-world JavaScript that lists WebMCP tools and MagickMonkey metadata.
 * @returns Executable source for `chrome.userScripts.execute`
 */
export function buildListToolsProbeCode(): string {
  // Keep as an IIFE string: runs in the page MAIN world via userScripts.execute.
  // Registry may live on __GLOBAL__ (preset) or globalThis/window — merge all Maps.
  return `(async()=>{
  const REGISTRY_KEY=${JSON.stringify(VWS_WEBMCP_TOOL_REGISTRY_KEY)};
  const PAGE_HINTS_KEY=${JSON.stringify(VWS_WEBMCP_PAGE_TOOL_HINTS_KEY)};
  const out={ok:false,reason:"api_missing",tools:[],registryEntries:[],pageHintEntries:[],details:{}};
  try{
    const isSecure=typeof window!=="undefined"&&window.isSecureContext;
    const origin=typeof window!=="undefined"?window.location.origin:null;
    const testing=typeof navigator!=="undefined"?navigator.modelContextTesting:null;
    const hosts=[];
    try{if(globalThis.__GLOBAL__&&typeof globalThis.__GLOBAL__==="object"){hosts.push(globalThis.__GLOBAL__);}}catch(_){}
    hosts.push(globalThis);
    if(typeof window!=="undefined"){hosts.push(window);}
    const registryMap=new Map();
    const pageHintsMap=new Map();
    for(const host of hosts){
      const registry=host[REGISTRY_KEY];
      if(registry&&typeof registry.entries==="function"){
        for(const [name,rec] of registry.entries()){if(!registryMap.has(name)){registryMap.set(name,rec);}}
      }
      const pageHints=host[PAGE_HINTS_KEY];
      if(pageHints&&typeof pageHints.entries==="function"){
        for(const [name,hint] of pageHints.entries()){if(!pageHintsMap.has(name)){pageHintsMap.set(name,hint);}}
      }
    }
    const registryEntries=Array.from(registryMap.entries());
    const pageHintEntries=Array.from(pageHintsMap.entries());
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
 * Chrome `modelContextTesting.executeTool` requires args as a JSON **string**
 * (not a plain object); passing an object yields "Failed to parse input arguments".
 * @param name Canonical tool name
 * @param args Tool arguments
 */
export function buildExecuteToolCode(name: string, args: Record<string, unknown>): string {
  const nameLiteral = JSON.stringify(name)
  const argsLiteral = JSON.stringify(args ?? {})
  return `(async()=>{const name=${nameLiteral};const args=${argsLiteral};const testing=navigator.modelContextTesting;if(typeof testing?.executeTool!=="function"){return{ok:false,reason:"api_missing",message:"executeTool unavailable"};}try{let result=await testing.executeTool(name,JSON.stringify(args));if(typeof result==="string"){try{result=JSON.parse(result);}catch(_){}}return{ok:true,result};}catch(e){return{ok:false,reason:"tool_execute_failed",message:e instanceof Error?e.message:String(e)};}})();`
}
