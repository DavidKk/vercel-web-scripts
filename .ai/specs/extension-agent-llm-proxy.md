# Extension Agent LLM Proxy（Gemini Base URL）— 设计

Status: **IMPLEMENTED**（方案 A：Provider = Gemini / OpenAI / Claude；可选 API Base URL + custom headers；**不**使用 `chrome.proxy` / 本机 PAC）

关联:

- UX：Settings = Provider 下拉 → API key → Use API proxy（关隐藏 Base URL）→ Save
- 父规格：`.ai/specs/extension-webmcp-agent.md`（C2：用户自备 Key → background 代发 Gemini）
- 需求：`.ai/tasks/backlog/extension-webmcp-agent.md`
- 实现入口：`extension/src/shell/webmcp/agent-llm.ts`、`extension/src/ui/sidepanel/`

---

## 1. 目标

为侧栏 Agent 增加 **可配置 LLM Provider +（可选）协议中转 Base URL**：

1. **Provider 下拉**（方案 A）：始终只展示当前选中平台的一套字段（Gemini / OpenAI / Claude）。
2. **代理默认关闭**：未开启时走官方 endpoint；开启才展开 Base URL + custom headers。
3. **`byProvider`**：切换 Provider 时记住各平台的 key / proxy / model / headers。

### 非目标

- 不配置扩展侧 `chrome.proxy` / PAC / SOCKS（与 ZeroOmega 等全局代理冲突；系统代理或外部规则另论）。
- Gemini 鉴权仍用 `?key=`（OpenAI/Anthropic 各用其官方 header）。

---

## 2. 配置模型

存储键不变：`chrome.storage.local` → `vws_agent_llm_config`。

```ts
interface AgentLlmConfig {
  provider: 'gemini' // 后续扩 'openai' | …
  apiKey: string
  model: string
  proxyEnabled: boolean
  baseUrl: string
  byProvider: Partial<Record<provider, { apiKey; model; proxyEnabled; baseUrl }>>
}
```

默认值：

```ts
{
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.0-flash',
  proxyEnabled: false,
  baseUrl: '',
}
```

旧配置无 `proxyEnabled` / `baseUrl` 时：按默认合并（代理关闭）。

---

## 3. URL 解析（Gemini adapter）

有效 API root：

| 条件                           | Root                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `!proxyEnabled`                | `https://generativelanguage.googleapis.com`                          |
| `proxyEnabled && baseUrl` 合法 | `normalizeBaseUrl(baseUrl)`（trim、去尾 `/`、必须 `http:`/`https:`） |
| `proxyEnabled && baseUrl` 无效 | 抛错（Save 可本地校验；请求时硬失败，避免静默打官方）                |

路径（相对 root，与现网一致）：

- Generate：`{root}/v1beta/models/{model}:generateContent?key={apiKey}`
- List models：`{root}/v1beta/models?key={apiKey}&pageSize=…`

抽取纯函数（便于单测），例如 `resolveGeminiApiRoot(config)` / `buildGeminiGenerateUrl(...)`。

---

## 4. 设置 UI

Settings →「Gemini API」区块：

**始终可见**

- API key
- （模型选择仍在 Send 旁，不变）

**代理开关（默认关）**

- 控件：checkbox / toggle，文案如「Use API proxy」
- `proxyEnabled === false`：隐藏下方代理字段（`hidden`）
- `proxyEnabled === true`：展开：
  - **API Base URL**（text）
  - **Custom headers (JSON)**（如 `{"Authorization":"Bearer …"}`），仅代理开启时随请求发出
  - placeholder：`https://generativelanguage.googleapis.com`
  - hint：仅 Gemini 协议中转；填中转站根地址，路径仍走 `/v1beta/...`

**Save**

- 持久化 `apiKey`、`proxyEnabled`、`baseUrl`、`proxyHeaders`（及已有 `model` / `provider`）
- 开启代理且 `baseUrl` 为空或非法，或 headers JSON 非法 → 阻止保存并提示

**List models**

- 使用当前表单的 `proxyEnabled` + `baseUrl` + `proxyHeaders`（含未保存）

---

## 5. Background / 消息

- 仍由 background `fetch`（Key 不出侧栏以外通道的既有模式不变）。
- `AGENT_LLM_GENERATE`：读 storage 配置（生成前应已 Save；未 Save 的代理开关不生效——与现 apiKey 一致：聊天前会检查已存 key）。
- `AGENT_LLM_LIST_MODELS`：可选 override：`apiKey?`、`proxyEnabled?`、`baseUrl?`、`proxyHeaders?`（与设置页即时探测对齐）。
- 代理关闭时**不**发送 `proxyHeaders`。

`host_permissions: ["<all_urls>"]` 已存在，自定义 origin 无需改 manifest。

---

## 6. 扩展点（后续多平台，本轮不实现）

```text
AGENT_LLM_*
  → provider router
       ├── gemini（本轮：官方 / proxyEnabled+baseUrl）
       ├── openai（以后）
       └── …
```

侧栏日后增加 Provider 选择；各 adapter 各自解释 `baseUrl` 与鉴权。

---

## 7. 测试

- `resolveGeminiApiRoot` / URL builder：关代理 → 官方；开代理 + 合法 base → 自定义；开代理 + 非法 → throw；尾斜杠规范化。
- 可选：list/generate 对 fetch URL 的断言（mock `fetch`）。

---

## 8. 实现触点（预期文件）

| 区域        | 文件                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| 类型 / 默认 | `extension/src/shell/webmcp/agent-types.ts`                                   |
| URL + fetch | `extension/src/shell/webmcp/agent-llm.ts`（可再拆 `agent-llm-gemini-url.ts`） |
| 消息        | `extension/src/shared/messages.ts`、`webmcp-message-handlers.ts`              |
| 存储 / UI   | `agent-storage.ts`、`mm-sidepanel-app.ts`、`sidepanel.ejs`                    |
| 单测        | `__tests__/extension/` 下新增或扩展                                           |

---

## 9. 验收

1. 默认：无代理 UI 展开；请求打官方 Gemini。
2. 开启代理并填写合法 Base URL → Save → generate / list models 打该 host。
3. 关闭代理 → 再次走官方，忽略已填 `baseUrl`。
4. 开启但 URL 非法 → 无法 Save；运行时不静默回落官方。
