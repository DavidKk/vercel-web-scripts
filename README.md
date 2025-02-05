[![Build Status](https://github.com/DavidKk/vercel-web-scripts/actions/workflows/coverage.workflow.yml/badge.svg)](https://github.com/DavidKk/vercel-web-scripts/actions/workflows/coverage.workflow.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Vercel Web Scripts

Mainly used for managing and deploying custom scripts on Vercel.

## Features

- **Script Management**: Centrally manage private scripts, sync to multiple clients, and support online modification with instant synchronization.
- **Script Packaging**: Automatically generate script entry, support multi-script packaging. (Currently only supports Tampermonkey)

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

1. Create a **GitHub Gist** and generate a **GitHub Access Token**.
2. Set the corresponding environment variables in Vercel.
3. Once deployed, you can manage scripts through the generated configuration.
