[![Build Status](https://github.com/DavidKk/vercel-web-scripts/actions/workflows/coverage.workflow.yml/badge.svg)](https://github.com/DavidKk/vercel-web-scripts/actions/workflows/coverage.workflow.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Vercel Web Scripts

主要用于在 Vercel 上管理和部署自定义脚本。

## 特点

- **脚本管理**：私有脚本集中管理，同步到多个客户端，支持在线修改即时同步
- **脚本打包**：自动生成脚本入口，支持多脚本打包。(暂仅支持篡改猴)

## 安全说明

- 脚本内容存储在私有 GitHub Gist，但 GitHub 员工及拥有账户访问权限的人员仍可查看内容
- **请勿存储任何敏感信息**（如 API 密钥、密码等），建议仅用于非敏感的功能性脚本
- 确保 Gist Token 的权限最小化（只需 gist 作用域），并定期轮换密钥

## 部署到 Vercel

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDavidKk%2Fvercel-web-scripts)

### 环境变量配置

参考 [`.env.example`](./.env.example) 文件，设置必要的环境变量。

- `GIST_ID`: GitHub Gist Id
- `GIST_TOKEN`: GitHub Gist Token
- `ACCESS_USERNAME`: 管理员用户名
- `ACCESS_PASSWORD`: 管理员密码
- `ACCESS_2FA_SECRET`: 2FA 密钥，可以使用 [https://vercel-2fa.vercel.app](https://vercel-2fa.vercel.app) 生成 TOKEN
- `JWT_SECRET`: JWT 密钥
- `JWT_EXPIRES_IN`: JWT 过期时间

## 快速开始

1. 创建一个 **GitHub Gist** 并生成一个 **GitHub Access Token**（需勾选 gist 权限）。
2. 在 Vercel 中设置相应的环境变量。
3. 部署完成后，您可以通过生成的配置管理脚本（建议在非公开网络环境下使用）。