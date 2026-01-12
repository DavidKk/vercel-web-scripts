/**
 * GEMINI API service for AI code rewriting
 */

interface GeminiRewriteRequest {
  /** Current file content */
  content: string
  /** File path/name */
  filePath: string
  /** User's rewrite instruction */
  instruction: string
  /** Available Tampermonkey API types */
  tampermonkeyTypings?: string
  /** File language (typescript or javascript) */
  language: 'typescript' | 'javascript'
}

/**
 * Rewrite code using GEMINI API
 * @param request Request parameters for code rewriting
 * @returns Rewritten code content
 */
export async function rewriteCodeWithGemini(request: GeminiRewriteRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  const { content, filePath, instruction, tampermonkeyTypings, language } = request

  // Build system prompt for Tampermonkey script context
  const systemPrompt = `You are an expert TypeScript/JavaScript developer specializing in Tampermonkey user scripts.

Context:
- This is a Tampermonkey user script file
- File path: ${filePath}
- Language: ${language}
${tampermonkeyTypings ? `- Available Tampermonkey APIs: The script has access to GM_* APIs (GM_xmlhttpRequest, GM_setValue, GM_getValue, etc.)` : ''}

Requirements:
1. Maintain the original code structure and style
2. Preserve all Tampermonkey metadata headers (// ==UserScript== ... // ==/UserScript==)
3. Keep the code functional and compatible with Tampermonkey environment
4. Follow TypeScript/JavaScript best practices
5. Only modify the code according to the user's instruction
6. If the instruction is unclear, make reasonable improvements while keeping the original intent

Important:
- Do NOT remove or modify the Tampermonkey metadata block
- Do NOT change the overall structure unless explicitly requested
- Ensure the code remains valid ${language === 'typescript' ? 'TypeScript' : 'JavaScript'}`

  const userPrompt = `Please rewrite the following code according to this instruction: "${instruction}"

Current code:
\`\`\`${language}
${content}
\`\`\`

Please provide only the rewritten code without any explanation or markdown formatting. Return the complete file content including the Tampermonkey metadata if present.`

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemPrompt}\n\n${userPrompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new Error(`GEMINI API error: ${response.status} ${errorText}`)
    }

    const data = await response.json()

    // Check for API errors
    if (data.error) {
      throw new Error(`GEMINI API error: ${data.error.message || JSON.stringify(data.error)}`)
    }

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response from GEMINI API: No candidates found')
    }

    const content = data.candidates[0].content
    if (!content.parts || !content.parts[0] || !content.parts[0].text) {
      throw new Error('Invalid response from GEMINI API: No text content found')
    }

    const generatedText = content.parts[0].text

    // Extract code from markdown code blocks if present
    let rewrittenCode = generatedText.trim()

    // Remove markdown code block syntax if present
    const codeBlockRegex = /```(?:typescript|javascript|ts|js)?\n?([\s\S]*?)```/
    const match = rewrittenCode.match(codeBlockRegex)
    if (match) {
      rewrittenCode = match[1].trim()
    }

    return rewrittenCode
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Failed to rewrite code: ${String(error)}`)
  }
}
