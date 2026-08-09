# 技术规格：Chrome 扩展 CI 正式发版（semver `X.Y.Z`）

> 状态：**实现中**（P0；文档 REVIEW 修订 2026-08-09）  
> 需求文档：[`extension-release-ci.requirements.md`](./extension-release-ci.requirements.md)

## 0. 已锁定决议（2026-08-09）

| #   | 项            | 决议                                                                                                                  |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 触发          | **仅** `workflow_dispatch`；**仅** `main`                                                                             |
| 2   | 回写          | CI **必须** push `package.json`；subject = `chore(release): X.Y.Z`；**`[skip vercel]` 仅 body**；Vercel ignore 双保险 |
| 3   | `downloadUrl` | **GitHub Release** ZIP asset（P0 假设仓库 **public**，否则匿名下载失败）                                              |

### 0.1 REVIEW 补强（同日）

| 项         | 锁定                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| Bump range | `lastRelease..HEAD`，**不是** `origin/main..HEAD`（见 §3.4）              |
| 水位       | 优先最近 `chore(release):` commit；若无则最近匹配 `v\d+\.\d+\.\d+` 的 tag |
| 顺序       | Release → 再回写；回写失败的恢复见 §3.4.1                                 |
| pre-push   | **P0 同 PR 删除**                                                         |
| API 仓坐标 | 从根 `package.json` `repository.url` 解析 `owner/repo`（可被 env 覆盖）   |

## 1. 目标架构

把「扩展壳正式版本」从 **Vercel 构建附带产物 / 本地 pre-push bump** 挪到 **GitHub Actions 发版通道**。

```text
业务 commit → main（日常部署仍走 Vercel）
       │
       │  维护者手动 Run workflow
       ▼
 GitHub Actions「extension-release」（workflow_dispatch）
       │  1. range = lastRelease..HEAD（禁止 origin/main..HEAD）
       │  2. 写入 package.json → X.Y.Z（job 工作区）
       │  3. pnpm pack:extension（manifest 注入同一 X.Y.Z）
       │  4. gh release create vX.Y.Z + ZIP asset
       │  5. 回写：subject `chore(release): X.Y.Z`，body 含 `[skip vercel]`
       ▼
 正式权威：GitHub Release vX.Y.Z
       │
       ▼
 GET /api/extension/version  → GitHub latest release（version + asset URL）
       │
       ▼
 Extension Popup 更新检测（现有 isSemverNewer）
```

**与 Vercel 的关系：** Web 应用照常部署；扩展正式 semver / ZIP **不以**「这次 Vercel 构建打进函数的 package.json」为权威。因此发版 **不要求** 额外一轮 Vercel Production。

## 2. 现状与缺口

| 能力          | 现状                                                                 | 缺口                        |
| ------------- | -------------------------------------------------------------------- | --------------------------- |
| Bump 规则     | `shared/version-bump.ts` + `pnpm version:bump`                       | 挂在 husky pre-push，非 CI  |
| Manifest 版本 | Vite 替换 `__VERSION__` ← 根 `package.json`                          | 正式版未保证只来自发版 job  |
| ZIP           | `pnpm pack:extension` → `public/downloads/...zip`，常随 `next build` | 与站点部署绑在一起          |
| 版本 API      | 读 `extension/dist/manifest.json` 或 import 的 `package.json`        | 权威 = 当前部署，非正式发版 |
| 客户端        | `fetchExtensionUpdateInfo` + `isSemverNewer`                         | 契约可保持                  |

## 3. 推荐方案（R1）

### 3.1 权威源

- **Tag：** `vX.Y.Z`（与 `package.json` / manifest 一致，无 `v` 的 semver 字符串对外 API 仍用 `X.Y.Z`）。
- **Asset：** `magickmonkey-chrome-extension.zip`（文件名与现 `CHROME_EXTENSION_ZIP_FILENAME` 对齐）。
- **Release 标题/说明：** `chore(release): X.Y.Z` 或自动生成 changelog（可选，非 P0）。

### 3.2 版本 API

`getExtensionReleaseInfo` 改为：

1. **优先** 读「正式发布元数据」（见 3.3）。
2. 失败或未配置时：可 **fallback** 到现逻辑（部署内 manifest / package.json），并在日志标 `source=deployment-fallback`（仅过渡期）。

响应形状不变：

```ts
{
  version: string
  downloadUrl: string
}
```

`downloadUrl`（已锁定）：**GitHub Release asset**（优先 `browser_download_url`；亦可文档化 `.../releases/latest/download/magickmonkey-chrome-extension.zip`）。MagickMonkey origin **不是**正式 ZIP 权威。

### 3.3 元数据读取方式

**P0 采用 A：GitHub API**（`GET /repos/{owner}/{repo}/releases/latest`），解析 tag → `X.Y.Z`，并从 assets 中取 ZIP 的 `browser_download_url`。

- 服务端短缓存（约 60s）与现有 `Cache-Control` 对齐。
- 公开仓库可无 token；若遇限流再加 `GITHUB_TOKEN` / 细粒度 PAT（仅服务端）。
- 方案 B/C 不采用（回写已用于 `package.json`，不必再写静态指针；env 手工更新不符合自动发版）。

### 3.4 CI Workflow 草图

路径建议：`.github/workflows/extension-release.yml`

**触发（已锁定）：仅 `workflow_dispatch`。**  
Job 开头：`git rev-parse --abbrev-ref HEAD`（或 `github.ref_name`）必须为 `main`，否则 fail。

**Bump range（已锁定，避免空 range）：**

- 现有本地 pre-push 默认 `origin/<branch>..HEAD`：**不适用于** 已与 origin 同步的 dispatch。
- CI 显式传入 / 内置解析：
  1. `git log -1 --grep='^chore(release):' --pretty=%H` → 若有，range = `${sha}..HEAD`；
  2. 否则最新 tag 匹配 `v[0-9]+.[0-9]+.[0-9]+` → `${tag}..HEAD`；
  3. 再否则视为首次发版（对当前 `package.json` 做一次 patch/minor 按 pending commits；若无 commit 历史则 fail 并要求人工设初始版本）。
- CLI 增加例如 `--range-from-last-release`（或 CI 只传算好的 `--range`），**不要**在 CI 依赖默认 `origin/main..HEAD`。

**步骤：**

1. Checkout `main`（`fetch-depth: 0`，含 tags）。
2. `pnpm install --frozen-lockfile`。
3. bump 到工作区（`--no-commit`）：无待发 commit → 打印 skip 并 **成功结束**（幂等）。
4. `pnpm pack:extension`；断言 dist manifest `version === X.Y.Z`。
5. 若 tag `vX.Y.Z` **已存在**：
   - 若 Release 已有同名 ZIP → 进入 §3.4.1（补回写）；
   - 否则 fail（避免无 asset 的空 tag）。
6. 否则 `gh release create "vX.Y.Z" <zip> --generate-notes`。
7. 回写：仅当 `package.json` 在 `origin/main` 上仍不是 `X.Y.Z` 时：
   - `git commit -m "chore(release): X.Y.Z" -m "[skip vercel]"`（**subject 不得**附加 `[skip vercel]`，否则破坏 `isReleaseCommitSubject` / 水位 grep）；
   - `git push`；`HUSKY=0` 或 `VWS_SKIP_VERSION_BUMP=1`。

权限：`contents: write`。

#### 3.4.1 恢复策略

| 状态                   | 处理                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| Release 成功、回写失败 | 重跑 workflow：bump 算出版本 == 已有 tag → 跳过 create，只补 push `package.json` |
| 回写成功、Release 失败 | 不应发生（顺序禁止）；若人工打乱，删除错误 commit 或补建同版本 Release（慎用）   |
| 无待发、已对齐         | 整 job skip，exit 0                                                              |

### 3.5 版本 API 细节

- 解析 `repository.url` → `https://api.github.com/repos/{owner}/{repo}/releases/latest`。
- 校验 `tag_name` 可规范为 `X.Y.Z`；assets 中存在 `magickmonkey-chrome-extension.zip`（或 `CHROME_EXTENSION_ZIP_FILENAME`）；否则视为失败（勿把无 ZIP 的其它 Release 当扩展版）。
- Env 覆盖（可选）：`EXTENSION_GITHUB_REPO=owner/repo`、`GITHUB_TOKEN`（服务端）。
- **P0 过渡 fallback**（部署内 version）：允许，但 `downloadUrl` 在 fallback 路径仍应尽量指向 last known GH URL；若只能用站点 ZIP，响应或日志标明 `source=deployment-fallback`，P2 删除。

### 3.6 复用代码

| 模块                                  | 用途                                     |
| ------------------------------------- | ---------------------------------------- |
| `shared/version-bump.ts`              | bump level、release subject、semver 运算 |
| `scripts/bump-version-from-commits-*` | CLI；`--no-commit` + CI range 解析       |
| `extension/vite.config.ts`            | 保持 `__VERSION__` ← package.json        |
| `shared/semver-compare.ts`            | 客户端比较不变                           |
| `package.json#repository`             | API 默认 owner/repo                      |

避免再实现第二套 conventional → semver 规则。

## 4. 本地 pre-push 迁移

| 阶段            | 行为                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| **P0（同 PR）** | 从 `scripts/husky.mjs` **删除** main/master `version:bump`；同步 hook 模板     |
| P1              | `extension/README.md` / `.ai/INDEX` 写清「发版 = Actions → extension-release」 |
| 保留            | `pnpm version:bump --dry-run` 供预览                                           |

禁止 P0 只上 CI、留下 pre-push 的双水源窗口。

## 5. 与 Vercel 解耦细则

| 场景                             | 期望                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 仅 Web 改动 push main            | 正常 Vercel 构建；**扩展正式 version 不变**                                                               |
| CI 只创建 GitHub Release         | **0** 次额外 Vercel（推荐默认）                                                                           |
| CI 回写 `package.json`（必做）   | **必须** Ignore Build：commit 含 `[skip vercel]`，**并**建议 `ignoreCommand` 识别 `chore(release)` 双保险 |
| `next build` 仍 `pack:extension` | 可作为站点「开发/镜像下载」；API 正式源不读它                                                             |

**不要**采用「先 push 业务 → Vercel 建完 → CI bump 再 push」作为正式版水源——那会回到双构建，且第一趟 version 错误。

## 6. 安全与权限

- Release 使用 `github.token` 或受限 PAT；不把 token 写入 Release body。
- 若 API 用 GitHub API：token 仅服务端；客户端只打 MagickMonkey `/api/extension/version`。
- 不在公开文档承诺未发布的内部 tag。

## 7. 测试与验收

### 7.1 自动化

- 现有 `version-bump` / semver 单测保留并覆盖 CI 用的 CLI 旗标。
- （可选）workflow 用 `act` 或 `workflow_dispatch` + dry-run job 验证「无待发则 skip」。
- API：mock GitHub latest release → 返回正确 `version` / `downloadUrl`；失败 fallback 行为单测。

### 7.2 手工

1. `workflow_dispatch` 发一版 patch；确认 Release + ZIP；manifest 内版本正确。
2. 旧版 Load unpacked 扩展指向预览/生产 origin → Popup 提示更新 → 下载 URL 可打开 ZIP。
3. 再跑一次同一 tip 发版 → 应 skip，不新建 tag。
4. 仅改 `app/` 部署 → 扩展 `latestVersion` **不变**。

## 8. 实施分期（建议）

| 阶段 | 内容                                                                                                                      | Vercel 影响       |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| P0   | Workflow + bump CLI range/no-commit + `gh release` + 回写 + **API 读 GH** + **删除 pre-push bump** + Vercel ignore 双保险 | 回写 0 次额外构建 |
| P1   | README / INDEX / 发版操作说明；收紧或删除 deployment-fallback                                                             | 无                |
| P2   | （可选）站点 ZIP 镜像                                                                                                     | 提交须 skip       |

## 9. 明确不采用

- CalVer / 纯时间戳替代 `X.Y.Z`。
- 以「每次 Vercel Production」自动当扩展发版。
- 在 pre-push 与 CI **同时** 自动 bump 且都写 tag（双水源）。

## 10. 决议状态

§0 / §0.1 已锁定。下一步：按 **P0 → P1** 实现；开工时状态改为 **实现中**。
