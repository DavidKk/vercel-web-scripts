# Gist 脚本版本历史与回滚 — task thread

Status: **TODO**（待确认是否立项；**不改代码**）

## 背景与目标

在 Web 编辑器中支持：

1. 查看托管脚本（Gist 内 `.ts` / `.js` 管理文件）的**历史版本**
2. 预览 / diff 某一历史版本
3. **回滚**到指定版本（写回 Gist，生成新版本 commit，不删除 Git 历史）

典型场景：某文件十几天才改一次，但同 Gist 内其他文件已保存几百次——需要**按文件**快速找到「上一版」，而不是翻整份 Gist 的全部 commit。

## 现状

| 能力                | 状态                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| Gist 读写           | ✅ `services/gist/index.ts`（`fetchGist` / `writeGistFiles`）                |
| 脚本 CRUD API / MCP | ✅ `/api/v1/scripts`、`scripts_*` MCP tools                                  |
| 脚本索引            | ✅ `magickmonkey.scripts.index.json`（元数据，非版本历史）                   |
| 版本历史 / 回滚 API | ❌ 无                                                                        |
| 编辑器版本 UI       | ❌ 无                                                                        |
| 边缘运行时 Git      | ❌ Vercel Fluid Compute 无 `git` CLI，不能 clone Gist 做 `git log -- <file>` |

客户端 launcher 的 preset **缓存回滚**（`launcherScript.ts`）与编辑器 **Gist 脚本回滚**是不同域，本任务只覆盖后者。

## Gist / REST 能力边界

GitHub Gist 每次 `PATCH` 都会产生 revision，底层是完整 Git 仓库，但 **REST 无「按文件查历史」接口**：

| 接口                           | 作用                                             | 限制                                       |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------ |
| `GET /gists/{gist_id}/commits` | 整份 Gist 提交列表（SHA、时间、`change_status`） | 不返回「改了哪些文件」                     |
| `GET /gists/{gist_id}/{sha}`   | 某一 revision 的**全部**文件内容                 | 每次请求整包；单文件 >1MB 可能 `truncated` |
| `PATCH /gists/{gist_id}`       | 更新文件（即「回滚」= 用旧内容 PATCH）           | 会新增 revision，非 destructive            |

**结论**：纯 REST **可以**实现回滚，但**不能**高效地「只查某文件上一版」——必须自建索引或逐 commit 扫描比对。

---

## 推荐技术方案（边缘无 Git）

### 方案 A — 写时索引（推荐，主路径）

每次成功写入 Gist（单文件 upsert、批量保存、rename、delete 等）后，维护一份**版本索引文件**（存于同一 Gist）。

#### 索引文件

- 建议文件名：`magickmonkey.scripts.revisions.json`（与 `magickmonkey.scripts.index.json` 并列）
- 加入 `EXCLUDED_FILES` 同类排除规则：不参与用户脚本编译，但由服务端读写
- 结构示意：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-24T12:00:00.000Z",
  "gistRevisionSha": "abc123…",
  "files": {
    "example.user.ts": [
      {
        "sha": "abc123…",
        "savedAt": "2026-06-24T12:00:00.000Z",
        "contentHash": "sha256:…",
        "size": 4096,
        "source": "editor"
      }
    ]
  }
}
```

#### 写入规则

1. 在 `writeGistFiles` 成功、拿到 GitHub 响应中的 revision SHA（或随后 `GET /commits` 取最新一条）后更新索引。
2. **仅当该文件 `contentHash` 相对上一条目变化**时 append 新条目（避免无内容变更的重复索引）。
3. 每个文件保留最近 **N** 条（建议 N=50～100，可配置）；超出则 trim 最旧条目（Gist 底层 Git 仍保留完整历史，索引只是热路径缓存）。
4. delete 文件：append 一条 `{ deleted: true, sha, savedAt }` 或从 `files` 移除并记录 tombstone（实现时二选一，文档化即可）。
5. rename：旧名记录 delete/close，新名 append 首条（可选携带 `renamedFrom`）。

#### 读取「某文件上一版」

1. 读索引 → 取该文件 entries 倒数第二条（当前版为最后一条或与 live Gist 比对）。
2. `GET /gists/{gist_id}/{sha}` 取该 revision 内容；或若索引内已存 `contentHash` 且与目标 SHA 一致则直接取 revision。
3. **O(1)**，与「其他文件改了几百次」无关。

#### 回滚

1. 用户选定 `{ filename, targetSha }`。
2. 服务端 `GET /gists/{gist_id}/{targetSha}` 提取该文件内容。
3. 校验：`isManagedScriptFilename`、脚本内容 validate（复用 `gistScripts` 现有校验）。
4. `writeGistFiles` 写回 → 触发索引 append（回滚本身也记一条，`source: "rollback"`）。
5. 可选：回滚前自动对当前 live 内容再 append 一条，便于「撤销回滚」。

#### 集成点（预估）

| 层                                                     | 变更                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| `constants/file.ts` / `shared/managed-script-files.ts` | 新增 `SCRIPT_REVISIONS_FILE` 常量              |
| `services/gist/revisions.ts`（新）                     | 索引 parse/stringify、append、trim、按文件查询 |
| `services/scripts/gistScripts.ts`                      | 所有写路径 hook 更新索引                       |
| `app/api/v1/scripts/...`                               | 历史列表、取 revision、rollback 路由           |
| `services/scripts/scriptMcpTools.ts`                   | 可选 MCP tools                                 |
| `components/ScriptEditor/`                             | 版本面板、diff、回滚确认                       |

---

### 方案 B — 纯 REST 按需扫描（备选 / 回填）

不维护索引，或索引缺失时的 **fallback**：

1. `GET /gists/{id}/commits` 分页（`per_page=100`），从新到旧。
2. 对每个 SHA：`GET /gists/{id}/{sha}`，仅比对目标 `filename` 的 content（或 hash）。
3. 当前 content 为 `C0`；**首次**遇到 `C != C0` 的 revision，该 revision 即为「上一版」。

| 优点             | 缺点                                           |
| ---------------- | ---------------------------------------------- |
| 无额外 Gist 文件 | commit 数百时：数百次 API、慢、易触 rate limit |
| 可回填历史索引   | 每次响应含全部文件，带宽浪费                   |

**建议**：仅用于 (1) 首次部署后一次性 backfill 索引；(2) 索引条目被 trim 后查更老版本（可选「加载更多」）。

---

### 方案 C — 外部 KV / DB（不优先）

将 `{ filename → [{ sha, hash, at }] }` 存 Vercel KV / Postgres。

- 优点：索引无大小限制、查询快
- 缺点：多一套存储与备份；与「脚本只在 Gist」的模型不一致

**结论**：除非 Gist 索引文件体积成为问题（脚本极多 / 历史极长），否则不引入。

---

## API 草案（REST v1）

| 方法   | 路径                                       | 说明                                              |
| ------ | ------------------------------------------ | ------------------------------------------------- |
| `GET`  | `/api/v1/scripts/{filename}/history`       | 返回该文件索引条目（分页：`limit` / `beforeSha`） |
| `GET`  | `/api/v1/scripts/{filename}/history/{sha}` | 返回该文件在指定 revision 的内容 + metadata       |
| `POST` | `/api/v1/scripts/{filename}/rollback`      | Body: `{ "sha": "…" }`；写回 Gist 并更新索引      |
| `GET`  | `/api/v1/scripts/history/backfill`         | （可选，admin）触发 REST 扫描回填；异步或限流     |

认证：与现有 `/api/v1/scripts` 相同（session / `x-api-key`）。

OpenAPI：`services/scripts/openapiV1.ts` 同步扩展。

---

## 编辑器 UI 草案

1. 脚本编辑器工具栏或侧栏：**「历史版本」**
2. 列表：时间、SHA 短码、`source`（editor / api / rollback）、可选行数 delta
3. 点击：Monaco diff（当前 vs 选中 revision）或只读预览
4. **「恢复此版本」**：二次确认 → 调用 rollback API → 刷新编辑器 buffer
5. 索引被 trim 时：展示「仅最近 N 版」提示 +「加载更早版本（较慢）」走方案 B

不在首版范围：整 Gist 快照回滚、多文件批量回滚。

---

## 风险与待确认项

| 项                          | 说明                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------- |
| 索引文件大小                | 文件数 × N 条 × ~200B；100 脚本 × 100 条仍可控；需 monitor                              |
| GitHub rate limit           | 方案 B 回填需限流；方案 A 常态每次 save +1 次 commits 读（可优化为从 PATCH 响应取 SHA） |
| `truncated` 大文件          | >1MB 不能可靠 diff/回滚；UI 需禁用并提示                                                |
| 并发写                      | 两 tab 同时保存：后写 wins；索引 append 可能乱序——可带 `gistRevisionSha` 做乐观校验     |
| 与 `SCRIPT_INDEX_FILE` 关系 | revisions 只管历史；index 只管展示元数据；写路径需同一事务式 batch PATCH                |
| MCP / AI 误回滚             | rollback 需显式 tool + 确认策略                                                         |

**立项前需产品确认**：

- [ ] 首版是否只做**单文件**回滚
- [ ] 每文件保留 N 条默认值
- [ ] 是否需要 backfill 既有 Gist 历史
- [ ] 回滚是否必须 diff 预览后才能点

---

## 验收标准（实现阶段）

- [ ] 保存脚本后，索引中出现新条目（内容未变则不重复）
- [ ] 对「冷门文件」查上一版：**不依赖** commit 总数，响应 <500ms（索引命中）
- [ ] 回滚后 Gist live 内容与目标 SHA 一致；launcher / MCP `scripts_get` 可见
- [ ] 回滚产生新 revision；GitHub commits 列表可看到新 commit
- [ ] 大文件 `truncated`、非 managed 文件名、未授权请求有明确错误
- [ ] OpenAPI + 可选 MCP 文档更新

---

## 工作量粗估

| 阶段 | 内容                                          | 估时        |
| ---- | --------------------------------------------- | ----------- |
| P0   | 索引模块 + 写路径 hook + history/rollback API | 1～2 人日   |
| P1   | 编辑器历史面板 + diff + 回滚 UX               | 1～2 人日   |
| P2   | backfill、MCP tools、trim/监控                | 0.5～1 人日 |

---

## 关联文件

- `services/gist/index.ts` — Gist REST 封装
- `services/scripts/gistScripts.ts` — 脚本写路径
- `constants/file.ts` / `shared/managed-script-files.ts` — 管理文件常量
- `components/ScriptEditor/` — Web 编辑器
- `public/docs/scripts-ai-skill.md` — 集成文档（若加 MCP）

## 参考

- [GitHub REST: List gist commits](https://docs.github.com/en/rest/gists/gists#list-gist-commits)
- [GitHub REST: Get a gist revision](https://docs.github.com/en/rest/gists/gists#get-a-gist-revision)
- 讨论结论：边缘无 Git 时，**写时索引（方案 A）** 为按文件快速找上一版的可行主路径；纯 REST 扫描（方案 B）仅作回填或查更早历史。
