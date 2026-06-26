# Runtime Phase D — 按 match 加载脚本模块 — task thread

Status: **TODO**（D2–D5 待排期）

**实施记录（2026-06-27 同步）**：**D1 已完成**（聚合 `script-bundle` / `tampermonkey-remote.js` 为默认路径，Phase A–C 已归档）。D2–D5 无代码实现；per-file OTA 缓存与 Extension 模块过滤属于 Phase C，**不是** match-based 按需加载。

关联: `../../specs/runtime-modularization.md` §Phase D、`../done/runtime-modularization-phase-a-b-c.md`

---

## Objective

从聚合 `tampermonkey-remote.js` 逐步演进到 **Match-Based Load**：仅加载当前 URL 匹配的脚本模块，聚合路径作 fallback。

---

## 现状（2026-06-27）

- [x] **D1** 聚合 script-bundle 路径保留且为默认（TM + Extension）
- [ ] **D2** 脚本元数据支持 match-based 加载声明
- [ ] **D3** 首个 match-based 加载路径（与 aggregate 并存）
- [ ] **D4** 脚本模块依赖
- [ ] **D5** aggregate → modules rollout 策略

---

## 影响面

**大** — 触及服务端 bundle 构建、`script-execution`、launcher、Gist 脚本加载模型。须独立里程碑，不与 extension-native-loader 同 PR。

---

## 验收（完成时）

- 匹配页只下载/执行相关脚本模块
- 无匹配或策略关闭时回退 aggregate bundle
- TM 与 Extension 行为一致或可文档化差异
