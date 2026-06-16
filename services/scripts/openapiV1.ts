/**
 * OpenAPI 3.1 document for script integration REST (`/api/v1/scripts`).
 * Served at `/api/v1/openapi.json` (requires the same auth as the API).
 */
export const SCRIPTS_OPENAPI_V1 = {
  openapi: '3.1.0',
  info: {
    title: 'MagickMonkey — Script files API',
    version: '1.0.0',
    description:
      'CRUD for user script files stored in the configured GitHub Gist. Only .ts/.js files outside generated entry/rules are writable. Authenticate with session cookie or x-api-key configured via SCRIPTS_MCP_HEADERS.',
  },
  servers: [{ url: '/', description: 'Deployment origin' }],
  security: [{ ScriptsApiKey: [] }, { cookieAuth: [] }],
  paths: {
    '/api/v1/scripts': {
      get: {
        operationId: 'listScripts',
        summary: 'List script files',
        responses: {
          '200': {
            description: 'List of script file metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ListScriptsResponse' },
                examples: {
                  ok: {
                    value: {
                      code: 0,
                      message: 'ok',
                      data: {
                        files: [
                          {
                            filename: 'demo.ts',
                            byteLength: 128,
                            contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                            name: 'Demo Script',
                            description: 'Copy table data as CSV',
                            version: '1.0.0',
                            runAt: 'document-idle',
                            icon: 'https://example.com/icon.png',
                            author: 'Test Author',
                            match: ['https://example.com/*'],
                            connect: ['example.com'],
                            aliases: ['表格复制'],
                            keywords: ['CSV'],
                          },
                        ],
                        gistUpdatedAt: 1761481200000,
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/scripts/{filename}': {
      get: {
        operationId: 'getScript',
        summary: 'Get script file content',
        parameters: [
          {
            name: 'filename',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'URL-encoded Gist file name (e.g. my-script.ts)',
          },
        ],
        responses: {
          '200': {
            description: 'File content wrapper',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetScriptResponse' },
                examples: {
                  ok: {
                    value: {
                      code: 0,
                      message: 'ok',
                      data: {
                        filename: 'demo.ts',
                        content: "console.log('hello')",
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Not a managed script file' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
      put: {
        operationId: 'putScript',
        summary: 'Create or replace script file',
        parameters: [
          {
            name: 'filename',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { content: { type: 'string' } },
                required: ['content'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MutationResponse' },
                examples: {
                  ok: { value: { code: 0, message: 'ok', data: { filename: 'demo.ts', ok: true } } },
                },
              },
            },
          },
          '400': { description: 'Invalid body or filename' },
          '401': { description: 'Unauthorized' },
        },
      },
      delete: {
        operationId: 'deleteScript',
        summary: 'Delete script file from Gist',
        parameters: [
          {
            name: 'filename',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MutationResponse' },
                examples: {
                  ok: { value: { code: 0, message: 'ok', data: { filename: 'demo.ts', ok: true } } },
                },
              },
            },
          },
          '400': { description: 'Not a managed script file' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
  },
  components: {
    schemas: {
      StandardEnvelope: {
        type: 'object',
        properties: {
          code: { type: 'integer' },
          message: { type: 'string' },
          data: {},
        },
        required: ['code', 'message', 'data'],
      },
      ScriptFileMeta: {
        type: 'object',
        properties: {
          filename: { type: 'string' },
          byteLength: { type: 'integer' },
          contentHash: { type: 'string', description: 'SHA-256 hash of the script content used by the generated script index.' },
          name: { type: 'string', description: 'Userscript @name metadata, when present.' },
          description: { type: 'string', description: 'Userscript @description metadata, when present.' },
          version: { type: 'string', description: 'Userscript @version metadata, when present.' },
          runAt: { type: 'string', description: 'Userscript @run-at metadata, when present.' },
          icon: { type: 'string', description: 'Userscript @icon metadata, when present.' },
          author: { type: 'string', description: 'Userscript @author metadata, when present.' },
          match: { type: 'array', items: { type: 'string' }, description: 'Userscript @match values.' },
          grants: { type: 'array', items: { type: 'string' }, description: 'Userscript @grant values.' },
          connect: { type: 'array', items: { type: 'string' }, description: 'Userscript @connect values.' },
          aliases: { type: 'array', items: { type: 'string' }, description: 'Human-maintained search aliases preserved from the script index.' },
          keywords: { type: 'array', items: { type: 'string' }, description: 'Human-maintained search keywords preserved from the script index.' },
          updatedAt: { type: 'integer', description: 'Last content change time for this file (epoch ms).' },
        },
        required: ['filename', 'byteLength'],
      },
      ListScriptsResponse: {
        allOf: [
          { $ref: '#/components/schemas/StandardEnvelope' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  files: { type: 'array', items: { $ref: '#/components/schemas/ScriptFileMeta' } },
                  gistUpdatedAt: { type: 'integer' },
                },
                required: ['files', 'gistUpdatedAt'],
              },
            },
          },
        ],
      },
      GetScriptResponse: {
        allOf: [
          { $ref: '#/components/schemas/StandardEnvelope' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  content: { type: 'string' },
                },
                required: ['filename', 'content'],
              },
            },
          },
        ],
      },
      MutationResponse: {
        allOf: [
          { $ref: '#/components/schemas/StandardEnvelope' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  ok: { type: 'boolean' },
                },
                required: ['filename', 'ok'],
              },
            },
          },
        ],
      },
    },
    securitySchemes: {
      ScriptsApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Value must match x-api-key defined in env SCRIPTS_MCP_HEADERS',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'auth_token',
        description: 'Session cookie after admin login',
      },
    },
  },
} as const
