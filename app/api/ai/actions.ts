'use server'

import { withAuthAction } from '@/initializer/wrapper'
import { rewriteCodeWithGemini } from '@/services/ai/gemini'

/**
 * Rewrite code using GEMINI API (server action)
 * @param content Current file content
 * @param filePath File path/name
 * @param instruction User's rewrite instruction
 * @param tampermonkeyTypings Available Tampermonkey API types
 * @param language File language (typescript or javascript)
 * @returns Rewritten code content
 */
export const rewriteCode = withAuthAction(
  async (content: string, filePath: string, instruction: string, tampermonkeyTypings: string | undefined, language: 'typescript' | 'javascript'): Promise<string> => {
    // Validate required fields
    if (!content || typeof content !== 'string') {
      throw new Error('Content is required and must be a string')
    }

    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required and must be a string')
    }

    if (!instruction || typeof instruction !== 'string') {
      throw new Error('Instruction is required and must be a string')
    }

    if (!language || (language !== 'typescript' && language !== 'javascript')) {
      throw new Error('Language must be either "typescript" or "javascript"')
    }

    // Call GEMINI API to rewrite code
    const rewrittenContent = await rewriteCodeWithGemini({
      content,
      filePath,
      instruction,
      tampermonkeyTypings: tampermonkeyTypings || undefined,
      language,
    })

    return rewrittenContent
  }
)
