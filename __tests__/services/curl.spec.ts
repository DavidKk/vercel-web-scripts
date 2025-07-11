import { parseCurlCommand, curlToFetch, executeCurlAsFetch, validateCurlCommand, type CurlParsedData } from '@/services/curl'

describe('CURL Parser', () => {
  describe('parseCurlCommand', () => {
    it('should parse basic GET request', () => {
      const curlCommand = 'curl https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
      })
    })

    it('should parse POST request with data', () => {
      const curlCommand = 'curl -X POST -H "Content-Type: application/json" -d "{\\"name\\":\\"John\\"}" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"name":"John"}',
      })
    })

    it('should parse request with multiple headers', () => {
      const curlCommand = 'curl -H "Authorization: Bearer token123" -H "Accept: application/json" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          Authorization: 'Bearer token123',
          Accept: 'application/json',
        },
      })
    })

    it('should parse request with form data', () => {
      const curlCommand = 'curl -X POST -F "name=John" -F "email=john@example.com" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=John&email=john%40example.com',
      })
    })

    it('should parse request with basic authentication', () => {
      const curlCommand = 'curl -u "username:password" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          Authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        },
      })
    })

    it('should parse request with cookies', () => {
      const curlCommand = 'curl -b "session=abc123; user=john" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          Cookie: 'session=abc123; user=john',
        },
      })
    })

    it('should parse JSON data with --json flag', () => {
      const curlCommand = 'curl --json "{\\"name\\":\\"John\\"}" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"name":"John"}',
      })
    })

    it('should parse binary data', () => {
      const curlCommand = 'curl --data-binary "binary data" https://api.example.com/upload'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/upload',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: 'binary data',
      })
    })

    it('should handle quoted URLs', () => {
      const curlCommand = 'curl "https://api.example.com/users"'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
      })
    })

    it('should handle escaped characters in data', () => {
      const curlCommand = 'curl -d "name=John\\&Doe" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=John&Doe',
      })
    })

    it('should handle PUT request', () => {
      const curlCommand = 'curl -X PUT -H "Content-Type: application/json" -d "{\\"name\\":\\"Jane\\"}" https://api.example.com/users/1'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'PUT',
        url: 'https://api.example.com/users/1',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"name":"Jane"}',
      })
    })

    it('should handle DELETE request', () => {
      const curlCommand = 'curl -X DELETE https://api.example.com/users/1'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'DELETE',
        url: 'https://api.example.com/users/1',
        headers: {},
      })
    })
  })

  describe('curlToFetch', () => {
    it('should convert parsed CURL data to fetch config', () => {
      const parsedData: CurlParsedData = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        },
        body: '{"name":"John"}',
      }

      const result = curlToFetch(parsedData)

      expect(result).toEqual({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        },
        body: { name: 'John' },
      })
    })

    it('should parse JSON body when Content-Type is application/json', () => {
      const parsedData: CurlParsedData = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"name":"John","age":30}',
      }

      const result = curlToFetch(parsedData)

      expect(result).toEqual({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: { name: 'John', age: 30 },
      })
    })

    it('should handle invalid JSON gracefully', () => {
      const parsedData: CurlParsedData = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      }

      const result = curlToFetch(parsedData)

      expect(result).toEqual({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      })
    })

    it('should handle form-urlencoded data', () => {
      const parsedData: CurlParsedData = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=John&email=john@example.com',
      }

      const result = curlToFetch(parsedData)

      expect(result).toEqual({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=John&email=john@example.com',
      })
    })

    it('should handle request without body', () => {
      const parsedData: CurlParsedData = {
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          Authorization: 'Bearer token123',
        },
      }

      const result = curlToFetch(parsedData)

      expect(result).toEqual({
        method: 'GET',
        headers: {
          Authorization: 'Bearer token123',
        },
      })
    })
  })

  describe('validateCurlCommand', () => {
    it('should validate correct CURL command', () => {
      const curlCommand = 'curl https://api.example.com/users'
      const result = validateCurlCommand(curlCommand)

      expect(result).toEqual({
        isValid: true,
      })
    })

    it('should reject command without URL', () => {
      const curlCommand = 'curl -H "Content-Type: application/json"'
      const result = validateCurlCommand(curlCommand)

      expect(result).toEqual({
        isValid: false,
        error: 'URL is required',
      })
    })

    it('should reject invalid URL format', () => {
      const curlCommand = 'curl invalid-url'
      const result = validateCurlCommand(curlCommand)

      expect(result).toEqual({
        isValid: false,
        error: 'Invalid URL format',
      })
    })

    it('should handle malformed CURL command', () => {
      const curlCommand = 'curl -X INVALID_METHOD https://api.example.com/users'
      const result = validateCurlCommand(curlCommand)

      expect(result.isValid).toBe(true) // Method validation is not strict
    })
  })

  describe('executeCurlAsFetch', () => {
    it('should execute CURL command as fetch request', async () => {
      // Mock fetch
      const mockResponse = { ok: true, json: () => Promise.resolve({ success: true }) }
      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      const curlCommand = 'curl -X POST -H "Content-Type: application/json" -d "{\\"name\\":\\"John\\"}" https://api.example.com/users'

      await executeCurlAsFetch(curlCommand)

      expect(fetch).toHaveBeenCalledWith('https://api.example.com/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: { name: 'John' },
      })
    })

    it('should handle GET request without body', async () => {
      const mockResponse = { ok: true, json: () => Promise.resolve({ users: [] }) }
      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      const curlCommand = 'curl -H "Authorization: Bearer token123" https://api.example.com/users'

      await executeCurlAsFetch(curlCommand)

      expect(fetch).toHaveBeenCalledWith('https://api.example.com/users', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token123',
        },
      })
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle empty CURL command', () => {
      const curlCommand = ''
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: '',
        headers: {},
      })
    })

    it('should handle CURL command with only whitespace', () => {
      const curlCommand = '   '
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: '',
        headers: {},
      })
    })

    it('should handle malformed header', () => {
      const curlCommand = 'curl -H "malformed-header" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
      })
    })

    it('should handle multiple data parameters', () => {
      const curlCommand = 'curl -d "name=John" -d "age=30" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'age=30', // Last data parameter wins
      })
    })

    it('should handle complex quoted strings', () => {
      const curlCommand = 'curl -d "name=\\"John Doe\\"" https://api.example.com/users'
      const result = parseCurlCommand(curlCommand)

      expect(result).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name="John Doe"',
      })
    })
  })
})
