# Script Update Ways (脚本更新方式汇总)

All ways to update preset or remote script, including dev-only flows.

---

## 1. Preset 更新（preset 本体 / launcher 缓存的 preset）

| 方式                               | 触发                                                                                       | 条件                                                    | 行为                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **SSE preset-built**               | Vite 构建 preset 完成 → POST `/api/sse/preset-built` → 服务端广播                          | 仅 **同域**（与 dev server 同 origin 的 tab）会订阅 SSE | 收到事件 → 清 `PRESET_CACHE_KEY` → 约 300ms 后 `location.reload()`，launcher 重新拉 preset            |
| **URL 参数 vws_script_update=1**   | 编辑器发布成功后用 iframe 打开 `origin/?vws_script_update=1`；或用户手动打开带该参数的链接 | 任意匹配脚本的页面                                      | 去掉参数 → `GM_deleteValue(PRESET_CACHE_KEY)` → `location.reload()`，launcher 下次加载会重新拉 preset |
| **Launcher 菜单「Update preset」** | 用户在 Tampermonkey 菜单里点击「Update preset」                                            | 使用 launcher 的任意页面                                | Launcher 清空 preset 缓存 → 约 500ms 后 `location.reload()`，下次加载重新拉 preset                    |

---

## 2. Remote Script 更新（GIST/远程脚本 tampermonkey-remote.js）

| 方式                                                | 触发                                                      | 条件                                                                           | 行为                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **HMR watch (watchHMRUpdates)**                     | Dev 模式下 remote 脚本对应的 WebSocket HMR 检测到文件变更 | **Dev 模式** 且非 editor 页（执行了 `executeRemoteScript()` 的 tab）           | `onUpdate` → `window.location.reload()`，整页刷新后重新拉 remote 脚本                                            |
| **菜单「Update Script」**                           | 用户在预设菜单里点击「Update Script」                     | 任意                                                                           | 打开脚本的 **Tampermonkey 更新 URL**（新标签），由 Tampermonkey 自己拉新版本并提示安装，不直接 reload 当前页     |
| **Script-update 服务 (getScriptUpdate().update())** | 之前：带 `vws_script_update=1` 时由 main 调用             | 当前 main 已改为「清缓存 + reload」，**不再**调用 `getScriptUpdate().update()` | 若某处仍调用：HOST tab 校验 script URL → broadcast → 各 tab `executeRemoteScript(url)`（eval 新脚本，不 reload） |

---

## 3. 临时开发（不 reload 整页，只重跑脚本）

| 方式                | 触发                                                                                        | 条件                                                | 行为                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Editor dev mode** | 编辑器里改代码并推送 → postMessage → 编辑器 tab 调 `GM_setValue(EDITOR_DEV_EVENT_KEY, ...)` | 已开启 **Editor dev mode** 的 tab（同域或跨域均可） | 其他 tab 通过 `GM_addValueChangeListener` 收到 → `executeEditorScript()` 或等 tab 可见时 reload |
| **Local dev mode**  | 本地监听文件变更 → 修改后 `GM_setValue(LOCAL_DEV_EVENT_KEY, ...)`                           | **Dev 模式** 且已开启「Watch Local Files」的 tab    | 其他 tab 收到 → `executeLocalScript()`，不 reload                                               |

---

## 汇总表（按「是否整页 reload」）

| 方式                      | 作用对象                      | 是否整页 reload         | 环境      |
| ------------------------- | ----------------------------- | ----------------------- | --------- |
| SSE preset-built          | Preset                        | 是                      | Dev，同域 |
| vws_script_update=1       | Preset                        | 是                      | 任意      |
| Launcher「Update preset」 | Preset                        | 是                      | 任意      |
| watchHMRUpdates           | Remote script                 | 是                      | Dev       |
| 「Update Script」菜单     | 整份脚本（Tampermonkey 更新） | 由 Tampermonkey 决定    | 任意      |
| Editor dev mode           | 当前执行的 editor 脚本        | 否（或等可见时 reload） | Dev       |
| Local dev mode            | 当前执行的 local 脚本         | 否                      | Dev       |

---

## 代码位置速查

- **SSE preset-built 订阅与处理**: `preset/src/services/preset-built-sse.ts`（`subscribePresetBuiltSSE`, `handlePresetBuiltEvent`）
- **vws_script_update=1 处理**: `preset/src/main.ts`（main 开头）
- **编辑器发布后 iframe 触发**: `app/editor/components/EditorContent.tsx`（publish 成功后的 iframe）
- **Launcher「Update preset」**: `services/tampermonkey/launcherScript.ts`（`GM_registerMenuCommand('Update preset', ...)`）
- **watchHMRUpdates**: `preset/src/main.ts`（dev 分支）、`preset/src/services/script-execution.ts`（实现）
- **「Update Script」菜单**: `preset/src/services/menu.ts`
- **Editor dev mode 推送与执行**: `preset/src/services/editor-dev-mode.ts`
- **Local dev mode 推送与执行**: `preset/src/services/local-dev-mode.ts`
