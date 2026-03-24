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
      'CRUD for user script files stored in the configured GitHub Gist. Only .ts/.js files outside generated entry/rules are writable. Authenticate with session cookie or SCRIPTS_API_KEY (Bearer or x-api-key).',
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
                        files: [{ filename: 'demo.ts', byteLength: 128 }],
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
        type: 'http',
        scheme: 'bearer',
        description: 'Value must match env SCRIPTS_API_KEY',
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
