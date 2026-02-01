# Editor Dev Mode 代码审阅

## 审阅范围

- `preset/src/services/editor-dev-mode.ts`：更新处理、postMessage 监听、tryExecuteEditorScript
- `preset/src/main.ts`：listener 注册、existing 处理、tryExecuteEditorScript 调用
- `app/editor/components/EditorContent.tsx`：仅 Cmd+S 触发 sendEditorDevModeFiles
- `app/editor/Editor.tsx`：editor-dev-mode-started / stopped postMessage
- `preset/src/services/dev-mode.ts`：isEditorPage、getEditorDevHost、isEditorDevMode
- `preset/src/services/script-execution.ts`：executeEditorScript（首次加载执行）

## 流程确认

1. **开启 Dev Mode**：Editor 发 `editor-dev-mode-started` → 仅 editor tab 的 preset 收到 postMessage → `GM_setValue(EDITOR_DEV_EVENT_KEY, { host, compiledContent: '' })` → 其他 tab 的 listener 收到，`!newValue.compiledContent` 直接 return，不刷新。
2. **Cmd+S 保存**：EditorContent 的 `handleEditorSave` → `sendEditorDevModeFiles()` → 编译、postMessage `editor-files-updated` → 仅 editor tab 执行 `GM_setValue(..., newValue)` → 各 tab 的 `GM_addValueChangeListener` 触发。
3. **收到真实更新**：`handleEditorDevModeUpdate(oldValue, newValue)` 中：`oldValue === null`（来自 main 的“已有值”调用）→ 不刷新；`document.hidden` → 调用 `scheduleReloadWhenTabActive(newValue)` 注册 `visibilitychange`，等 tab 激活后刷新；否则立即 `location.reload()`。非激活 tab 在**激活后**会触发一次刷新（通过 `visibilitychange`）。
4. **未开 Dev Mode 的页面**：存储里可能有残留的 `EDITOR_DEV_EVENT_KEY`。main 调用 `handleEditorDevModeUpdate(null, existing)` 时因 `oldValue === null` 直接 return，不刷新，避免疯狂刷新。
5. **关闭 Dev Mode**：Editor 发 `editor-dev-mode-stopped` → `GM_setValue(EDITOR_DEV_EVENT_KEY, null)` → 各 tab 收到 `!newValue`，若 `hasExecutedEditorScript` 则 reload 恢复普通脚本。

## 结论：逻辑正确，无阻塞问题

- 仅 Cmd+S 触发推送（EditorContent 无 interval）。
- 仅“真实更新”（listener 触发，`oldValue !== null`）且当前 tab 激活时才刷新。
- 初始加载时用“已有值”调用不会触发刷新（`oldValue === null` 已拦截）。
- 首次进入目标页仍通过 `tryExecuteEditorScript()` → `executeEditorScript()` 执行一次脚本；之后更新只刷新不 re-execute。

## 可选优化（非必须）

1. **`editor-dev-mode-early-init`**：preset 中有处理，但未在 Editor/EditorContent 中看到发送方，若确定不用可删该分支或保留作扩展。
2. **main 中 `handleEditorDevModeUpdate(null, existingEditorDevMode)`**：现在只会在 `oldValue === null` 时一路 return，不产生副作用。可保留（便于以后在“已有 dev 状态”时加逻辑）或删除以少一次调用，二者皆可。

## 无需修改

- `__WEB_SCRIPT_EDITOR_LAST_MODIFIED__` 在 `script-execution.ts` 的 `executeEditorScript` 中设置，用于“dev mode 停止”时 5s 内忽略 stop 信号，逻辑正确。
- 指纹 / lastModified 去重、仅激活 tab 刷新、editor 页跳过等条件顺序合理。
