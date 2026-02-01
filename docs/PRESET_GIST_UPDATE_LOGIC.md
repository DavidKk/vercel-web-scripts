# Preset 与 GIST 更新/刷新触发逻辑审阅

## 审阅结论

1. **Preset（Editor Dev Mode / Local Dev Mode）**：只有**本地**（编辑器页 / Watch Local Files 的 tab）能够**触发**更新；其他域名的 tab **不触发**，只**接收** GM 通知后刷新。
2. **GIST（Script Update）**：只有**其他页面**（非编辑器页）能够**触发**更新；**编辑器页面**作为 HOST 仅用于 Preset，**不触发** GIST 更新。

---

## 一、Preset：只有本地才能触发更新与刷新策略

### 1. Editor Dev Mode（编辑器开发模式）

| 角色                 | 触发更新                                                                                                                                                         | 接收更新后行为                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **编辑器页（HOST）** | ✅ 唯一触发方：通过 `setupEditorPostMessageListener` 接收 Editor 的 postMessage（如 `editor-files-updated`），执行 `GM_setValue(EDITOR_DEV_EVENT_KEY, newValue)` | ❌ 不刷新：`handleEditorDevModeUpdate` 内 `if (isEditorPage()) return`                      |
| **其他域名/tab**     | ❌ 不触发：只有 `isEditorPage()` 的 tab 才注册 postMessage 并写入 GM                                                                                             | ✅ 刷新：收到 `GM_addValueChangeListener` 后 `window.location.reload()` 或等 tab 激活后刷新 |

- **触发**：仅编辑器页（`__EDITOR_URL__` 对应页面）会执行 `setupEditorPostMessageListener`，收到 Cmd+S 等 postMessage 后写入 `EDITOR_DEV_EVENT_KEY`，因此只有「本地」编辑器 tab 能触发更新。
- **刷新**：`handleEditorDevModeUpdate` 中先判断 `isEditorPage()`，编辑器页直接 return，不刷新；非编辑器页才执行刷新或 `scheduleReloadWhenTabActive`。

### 2. Local Dev Mode（本地开发 / 插件菜单「Watch Local Files」）

| 角色                                                                    | 触发更新                                                                                                           | 接收更新后行为                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **当前 TAB 作为 HOST**（点菜单「Watch Local Files」并选目录的那个 tab） | ✅ 唯一触发方：在 `registerWatchLocalFilesMenu` 回调里轮询本地文件，执行 `GM_setValue(LOCAL_DEV_EVENT_KEY, state)` | ❌ 不刷新：`handleLocalDevModeUpdate` 内通过 `getWebScriptId() === newValue.host` 识别 host tab，直接 return        |
| **其他 TAB**                                                            | ❌ 不触发：只有 HOST tab 会轮询并 GM_setValue                                                                      | ✅ 可更新：收到 listener 后**仅当 ACTIVE 时立即刷新**；若 tab 处于后台则等切回前台再刷新（与 Editor Dev Mode 一致） |

- **触发**：只有当前 tab 在插件菜单里点击「Watch Local Files」并选择目录后，该 tab 成为 HOST，会 `setInterval(pollFiles)` 并 `GM_setValue(LOCAL_DEV_EVENT_KEY, state)`，即只有「当前 TAB 作为 HOST」能触发更新。
- **刷新**：
  - HOST tab 不刷新（`getWebScriptId() === newValue.host` 或 `isDevMode` 时 return）。
  - 其他 tab：**只有 ACTIVE 状态下会立即刷新**（`!document.hidden` 时 `window.location.reload()`）；若收到更新时 tab 在后台（`document.hidden`），则调用 `scheduleReloadWhenTabActiveLocal()`，等 `visibilitychange` 后 tab 变为可见再刷新，行为与 Editor Dev Mode 一致。

---

## 二、GIST：只有其他页面才会触发，编辑器页不触发

### Script Update 服务（getScriptUpdate().update()）

| 角色         | 触发 GIST 更新                                                                                       | 接收广播后行为                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **编辑器页** | ❌ 不触发：`ScriptUpdate.update()` 开头 `if (isEditorPage()) return`，不执行 tryBecomeHost/校验/广播 | 可接收其他 tab 的广播并执行脚本（与「不触发」无关）              |
| **其他页面** | ✅ 可触发：非编辑器页调用 `update()` 时可 `tryBecomeHost()`，成为 HOST 后校验并 broadcast            | 接收 HOST 的 broadcast，执行 `executeRemoteScript(validatedUrl)` |

- **编辑器页**：在 Preset 里作为 Editor Dev Mode 的 HOST，只负责接收 Editor UI 的 postMessage 并写 `EDITOR_DEV_EVENT_KEY`；在 GIST 侧**不**成为 Script Update 的 HOST，不发起校验与广播。逻辑上在 `script-update.ts` 的 `update()` 入口用 `isEditorPage()` 直接 return 保证。
- **其他页面**：只有非编辑器页可以成为 GIST 的 HOST，执行校验与广播，其他 tab（含编辑器页）仅接收并执行更新后的脚本。

---

## 三、代码位置速查

- **Editor Dev Mode**
  - 仅编辑器页写 GM：`preset/src/services/dev-mode/editor.ts` → `setupEditorPostMessageListener`（postMessage 里 `GM_setValue(EDITOR_DEV_EVENT_KEY, ...)`）。
  - 编辑器页不刷新：同上文件 → `handleEditorDevModeUpdate` 内 `if (isEditorPage()) return`。
- **Local Dev Mode**
  - 仅 host tab 写 GM：`preset/src/services/dev-mode/local.ts` → `registerWatchLocalFilesMenu` 回调内 `GM_setValue(LOCAL_DEV_EVENT_KEY, state)`。
  - Host tab 不刷新：同上文件 → `handleLocalDevModeUpdate` 内 `if (getWebScriptId() === newValue.host || isDevMode) return`。
- **GIST 编辑器页不触发**
  - `preset/src/services/script-update.ts` → `update()` 开头 `if (isEditorPage()) return`。
