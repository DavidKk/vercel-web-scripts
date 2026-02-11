/**
 * Locator JSON 生成与回放定位工具
 * 基于语义指纹的多策略节点定位方案，适配动态 DOM 和 SPA 场景
 */

import { generateXPath, isHashLike } from './xpath'

/**
 * Locator JSON 数据结构
 */
export interface LocatorJSON {
  /** 标签名，限定候选范围 */
  tag?: string
  /** ARIA role，语义稳定定位 */
  role?: string
  /** 节点文本内容（innerText，截断 ≤120 字符） */
  text?: string
  /** 稳定属性集合 */
  attributes?: Record<string, string>
  /** 稳定 class 列表（过滤动态 hash） */
  stableClasses?: string[]
  /** 邻近语义文本（上下文匹配） */
  nearText?: string[]
  /** DOM 深度 */
  domDepth?: number
  /** 位置提示 */
  positionHint?: {
    /** 同类标签中的索引 */
    indexAmongSameTag?: number
  }
  /** XPath 兜底策略 */
  xpathFallback?: string
  /** 创建时间戳 */
  createdAt?: number
  /** 版本号 */
  version?: number
  /** 稳定性等级（A-E） */
  stabilityLevel?: 'A' | 'B' | 'C' | 'D' | 'E'
}

/**
 * 匹配评分结果
 */
interface MatchScore {
  /** 匹配的节点 */
  node: HTMLElement
  /** 评分总分 */
  score: number
  /** 评分详情 */
  details: {
    testIdMatch?: number
    roleMatch?: number
    textExactMatch?: number
    textFuzzyMatch?: number
    stableClassMatch?: number
    nearTextMatch?: number
    depthMatch?: number
  }
}

/**
 * 评分权重配置
 */
const SCORE_WEIGHTS = {
  testIdMatch: 100,
  roleMatch: 60,
  textExactMatch: 50,
  textFuzzyMatch: 30,
  stableClassMatch: 20,
  nearTextMatch: 15,
  depthMatch: 10,
}

/**
 * 检查 class 是否为 hash class（动态生成）
 * @param className Class 名称
 * @returns 是否为 hash class
 */
function isHashClass(className: string): boolean {
  if (!className || className.length >= 20) {
    return false
  }
  // 匹配常见的 hash 模式：css-xxx, sc-xxx, jsx-xxx, 或纯 hash
  const hashPattern = /^css-|^sc-|^jsx-|^[a-z0-9]{6,}$/i
  return hashPattern.test(className)
}

/**
 * 提取稳定 class（过滤动态 hash）
 * @param node DOM 节点
 * @returns 稳定 class 列表
 */
function extractStableClasses(node: HTMLElement): string[] {
  const className = node.className
  if (!className || typeof className !== 'string') {
    return []
  }

  const classes = className.split(/\s+/).filter((c) => c.trim().length > 0 && !isHashClass(c.trim()) && !isHashLike(c.trim()))

  return classes
}

/**
 * 提取稳定属性
 * @param node DOM 节点
 * @returns 稳定属性对象
 */
function extractStableAttributes(node: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {}

  // 优先检查高优先级属性
  const priorityAttrs = ['data-testid', 'data-id', 'data-component-id', 'name', 'role', 'type', 'placeholder', 'title', 'href', 'src', 'alt', 'aria-label', 'aria-labelledby']

  for (const attrName of priorityAttrs) {
    const value = node.getAttribute(attrName)
    if (value && typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed && !isHashLike(trimmed)) {
        attrs[attrName] = trimmed
      }
    }
  }

  // 检查其他 data-* 属性
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i]
    const name = attr.name.toLowerCase()
    const value = attr.value.trim()

    if (name.startsWith('data-') && value && !isHashLike(value)) {
      // 跳过已添加的属性
      if (!attrs[name]) {
        attrs[name] = value
      }
    }
  }

  return attrs
}

/**
 * 提取节点文本内容
 * @param node DOM 节点
 * @returns 文本内容（截断 ≤120 字符）
 */
function extractText(node: HTMLElement): string | undefined {
  const text = node.innerText || node.textContent || ''
  const trimmed = text.trim()
  if (!trimmed) {
    return undefined
  }
  // 截断到 120 字符
  return trimmed.length > 120 ? trimmed.substring(0, 120) : trimmed
}

/**
 * 提取邻近语义文本（从父节点和兄弟节点）
 * @param node DOM 节点
 * @returns 邻近文本列表
 */
function extractNearText(node: HTMLElement): string[] {
  const nearText: string[] = []
  const maxLength = 50
  const maxCount = 5

  // 从父节点提取
  let parent = node.parentElement
  let parentCount = 0
  while (parent && parentCount < 2 && nearText.length < maxCount) {
    const text = (parent.innerText || parent.textContent || '').trim()
    if (text && text.length <= maxLength && text !== (node.innerText || node.textContent || '').trim()) {
      nearText.push(text.substring(0, maxLength))
    }
    parent = parent.parentElement
    parentCount++
  }

  // 从兄弟节点提取
  const siblings = Array.from(node.parentElement?.children || [])
  for (const sibling of siblings) {
    if (sibling === node || nearText.length >= maxCount) {
      continue
    }
    const text = ((sibling as HTMLElement).innerText || sibling.textContent || '').trim()
    if (text && text.length <= maxLength) {
      nearText.push(text.substring(0, maxLength))
    }
  }

  return nearText.slice(0, maxCount)
}

/**
 * 计算 DOM 深度
 * @param node DOM 节点
 * @returns DOM 深度
 */
function calculateDomDepth(node: HTMLElement): number {
  let depth = 0
  let current: HTMLElement | null = node
  while (current && current !== document.documentElement) {
    depth++
    current = current.parentElement
  }
  return depth
}

/**
 * 计算同类标签中的索引
 * @param node DOM 节点
 * @returns 索引位置
 */
function calculateIndexAmongSameTag(node: HTMLElement): number {
  const tag = node.tagName.toLowerCase()
  const siblings = Array.from(node.parentElement?.children || [])
  const sameTagSiblings = siblings.filter((s) => s.tagName.toLowerCase() === tag)
  return sameTagSiblings.indexOf(node)
}

/**
 * 评估稳定性等级
 * @param locator Locator JSON
 * @returns 稳定性等级
 */
function evaluateStabilityLevel(locator: LocatorJSON): 'A' | 'B' | 'C' | 'D' | 'E' {
  // A: testId / aria 可用
  if (locator.attributes?.['data-testid'] || locator.attributes?.['aria-label'] || locator.attributes?.['aria-labelledby']) {
    return 'A'
  }
  // B: role + text
  if (locator.role && locator.text) {
    return 'B'
  }
  // C: 仅 text
  if (locator.text) {
    return 'C'
  }
  // D: 结构 fallback
  if (locator.stableClasses || locator.nearText || locator.domDepth !== undefined) {
    return 'D'
  }
  // E: XPath only
  return 'E'
}

/**
 * 生成 Locator JSON（从 DOM 节点）
 * @param node DOM 节点
 * @returns Locator JSON
 */
export function generateLocatorJSON(node: HTMLElement): LocatorJSON {
  const tag = node.tagName.toLowerCase()
  const role = node.getAttribute('role') || undefined
  const text = extractText(node)
  const attributes = extractStableAttributes(node)
  const stableClasses = extractStableClasses(node)
  const nearText = extractNearText(node)
  const domDepth = calculateDomDepth(node)
  const indexAmongSameTag = calculateIndexAmongSameTag(node)
  const xpathFallback = generateXPath(node) || undefined

  const locator: LocatorJSON = {
    tag,
    role,
    text,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    stableClasses: stableClasses.length > 0 ? stableClasses : undefined,
    nearText: nearText.length > 0 ? nearText : undefined,
    domDepth,
    positionHint:
      indexAmongSameTag >= 0
        ? {
            indexAmongSameTag,
          }
        : undefined,
    xpathFallback,
    createdAt: Date.now(),
    version: 1,
  }

  // 评估稳定性等级
  locator.stabilityLevel = evaluateStabilityLevel(locator)

  return locator
}

/**
 * 计算节点匹配评分
 * @param node 候选节点
 * @param locator Locator JSON
 * @returns 匹配评分
 */
function calculateMatchScore(node: HTMLElement, locator: LocatorJSON): MatchScore {
  const details: MatchScore['details'] = {}
  let score = 0

  // 1. testId 匹配（+100）
  if (locator.attributes?.['data-testid']) {
    const nodeTestId = node.getAttribute('data-testid')
    if (nodeTestId === locator.attributes['data-testid']) {
      details.testIdMatch = SCORE_WEIGHTS.testIdMatch
      score += SCORE_WEIGHTS.testIdMatch
    }
  }

  // 2. role 匹配（+60）
  if (locator.role) {
    const nodeRole = node.getAttribute('role')
    if (nodeRole === locator.role) {
      details.roleMatch = SCORE_WEIGHTS.roleMatch
      score += SCORE_WEIGHTS.roleMatch
    }
  }

  // 3. text 精确匹配（+50）
  if (locator.text) {
    const nodeText = (node.innerText || node.textContent || '').trim()
    if (nodeText === locator.text) {
      details.textExactMatch = SCORE_WEIGHTS.textExactMatch
      score += SCORE_WEIGHTS.textExactMatch
    } else if (nodeText.includes(locator.text) || locator.text.includes(nodeText)) {
      // 4. text 模糊匹配（+30）
      details.textFuzzyMatch = SCORE_WEIGHTS.textFuzzyMatch
      score += SCORE_WEIGHTS.textFuzzyMatch
    }
  }

  // 5. stable class 命中（+20）
  if (locator.stableClasses && locator.stableClasses.length > 0) {
    const nodeClasses = extractStableClasses(node)
    const matchedClasses = locator.stableClasses.filter((c) => nodeClasses.includes(c))
    if (matchedClasses.length > 0) {
      details.stableClassMatch = SCORE_WEIGHTS.stableClassMatch
      score += SCORE_WEIGHTS.stableClassMatch
    }
  }

  // 6. nearText 命中（+15）
  if (locator.nearText && locator.nearText.length > 0) {
    const parentText = (node.parentElement?.innerText || node.parentElement?.textContent || '').trim()
    const hasNearText = locator.nearText.some((nt) => parentText.includes(nt))
    if (hasNearText) {
      details.nearTextMatch = SCORE_WEIGHTS.nearTextMatch
      score += SCORE_WEIGHTS.nearTextMatch
    }
  }

  // 7. depth 接近（+10）
  if (locator.domDepth !== undefined) {
    const nodeDepth = calculateDomDepth(node)
    const depthDiff = Math.abs(nodeDepth - locator.domDepth)
    if (depthDiff <= 2) {
      details.depthMatch = SCORE_WEIGHTS.depthMatch - depthDiff * 2
      score += Math.max(0, SCORE_WEIGHTS.depthMatch - depthDiff * 2)
    }
  }

  return {
    node,
    score,
    details,
  }
}

/**
 * 查找匹配的节点（基于 Locator JSON）
 * @param locator Locator JSON
 * @returns 匹配的节点，如果未找到返回 null
 */
export function locateNodeByJSON(locator: LocatorJSON): HTMLElement | null {
  // 1. 精确属性命中（优先级最高）
  if (locator.attributes?.['data-testid']) {
    const node = document.querySelector(`[data-testid="${locator.attributes['data-testid']}"]`) as HTMLElement | null
    if (node) {
      return node
    }
  }

  // 2. 语义 role + aria-label
  if (locator.role && locator.attributes?.['aria-label']) {
    const node = document.querySelector(`[role="${locator.role}"][aria-label="${locator.attributes['aria-label']}"]`) as HTMLElement | null
    if (node) {
      return node
    }
  }

  // 3. role + text
  if (locator.role && locator.text) {
    const candidates = Array.from(document.querySelectorAll(`[role="${locator.role}"]`)) as HTMLElement[]
    for (const candidate of candidates) {
      const text = (candidate.innerText || candidate.textContent || '').trim()
      if (text === locator.text || text.includes(locator.text)) {
        return candidate
      }
    }
  }

  // 4. text 模糊匹配
  if (locator.text) {
    const tag = locator.tag || '*'
    const candidates = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
    for (const candidate of candidates) {
      const text = (candidate.innerText || candidate.textContent || '').trim()
      if (text.includes(locator.text) || locator.text.includes(text)) {
        return candidate
      }
    }
  }

  // 5. 评分匹配（多策略综合）
  const tag = locator.tag || '*'
  const candidates = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
  const scores: MatchScore[] = []

  for (const candidate of candidates) {
    const matchScore = calculateMatchScore(candidate, locator)
    if (matchScore.score > 0) {
      scores.push(matchScore)
    }
  }

  // 按评分排序，返回最高分的节点
  if (scores.length > 0) {
    scores.sort((a, b) => b.score - a.score)
    return scores[0].node
  }

  // 6. XPath fallback
  if (locator.xpathFallback) {
    try {
      const result = document.evaluate(locator.xpathFallback, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      return (result.singleNodeValue as HTMLElement) || null
    } catch (e) {
      // XPath 解析失败，继续返回 null
    }
  }

  return null
}

/**
 * 查找所有匹配的节点（基于 Locator JSON，返回评分排序的列表）
 * @param locator Locator JSON
 * @param maxResults 最大返回结果数
 * @returns 匹配的节点列表（按评分降序）
 */
export function locateAllNodesByJSON(locator: LocatorJSON, maxResults = 10): Array<{ node: HTMLElement; score: number; details: MatchScore['details'] }> {
  const tag = locator.tag || '*'
  const candidates = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
  const scores: MatchScore[] = []

  for (const candidate of candidates) {
    const matchScore = calculateMatchScore(candidate, locator)
    if (matchScore.score > 0) {
      scores.push(matchScore)
    }
  }

  // 按评分排序
  scores.sort((a, b) => b.score - a.score)

  // 返回前 N 个结果
  return scores.slice(0, maxResults).map((s) => ({
    node: s.node,
    score: s.score,
    details: s.details,
  }))
}
