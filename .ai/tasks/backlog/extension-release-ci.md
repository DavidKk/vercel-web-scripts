# Backlog: Chrome 扩展 CI 正式发版（semver）

Status: **IN PROGRESS**（P0 实现中）

## Specs

- 需求：`.ai/specs/extension-release-ci.requirements.md`
- 技术：`.ai/specs/extension-release-ci.md`

## P0 checklist

- [x] bump CLI `--from-last-release` + RESULT 行
- [x] workflow `extension-release.yml`
- [x] API 读 GitHub latest + ZIP asset
- [x] 去 pre-push bump
- [x] Vercel ignore 双保险
- [x] format / lint / typecheck / 相关单测通过
