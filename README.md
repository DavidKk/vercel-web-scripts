[![Build Status](https://github.com/DavidKk/vercel-web-scripts/actions/workflows/coverage.workflow.yml/badge.svg)](https://github.com/DavidKk/vercel-web-scripts/actions/workflows/coverage.workflow.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Vercel Web Scripts

Mainly used for managing and deploying custom scripts on Vercel.

## Features

- **Script Management**: Centrally manage private scripts, sync to multiple clients, and support online modification with instant synchronization. Since the content is stored in private GitHub Gist, it is not absolutely secure. Please do not store any sensitive information (such as API keys, passwords, etc.) and use it only for non-sensitive functional scripts.
- **Script Packaging**: Automatically generate script entry, support multi-script packaging. (Currently only supports Tampermonkey)

## Security Notes

- Script content is stored in private GitHub Gist, but GitHub employees and anyone with account access can still view the content.
- **Do not store any sensitive information** (such as API keys, passwords, etc.), it is recommended to use it only for non-sensitive functional scripts.
- Ensure the Gist Token has minimal permissions (only need gist scope) and rotate the keys regularly.

## Deploy to Vercel

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDavidKk%2Fvercel-web-scripts)

### Environment Variable Configuration

Refer to the [`.env.example`](./.env.example) file to set the required environment variables.

- `GIST_ID`: GitHub Gist Id
- `GIST_TOKEN`: GitHub Gist Token
- `ACCESS_USERNAME`: Admin Username
- `ACCESS_PASSWORD`: Admin Password
- `ACCESS_2FA_SECRET`: 2FA Secret, can generate TOKEN using [https://vercel-2fa.vercel.app](https://vercel-2fa.vercel.app)
- `JWT_SECRET`: JWT Secret
- `JWT_EXPIRES_IN`: JWT Token Expiration Time

## Quick Start

1. Create a **GitHub Gist** and generate a **GitHub Access Token** (with gist permission).
2. Set the corresponding environment variables in Vercel.
3. Once deployed, you can manage scripts through the generated configuration (recommended to use in non-public network environments).
