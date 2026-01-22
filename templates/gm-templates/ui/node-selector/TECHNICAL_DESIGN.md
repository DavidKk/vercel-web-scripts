# 节点选择器 UI 组件技术方案

## 一、概述

节点选择器（Node Selector）是一个用于在页面上选择、高亮和标记 DOM 节点的 UI 组件。它主要用于开发工具场景，允许用户通过鼠标悬停和点击来选择页面元素，并显示相关信息。

## 二、核心功能需求

1. **节点选择**：通过鼠标移动检测并选择页面上的 DOM 节点
2. **高亮显示**：鼠标悬停时，使用绝对定位的选中框高亮目标节点
3. **可调整高亮目标**：支持高亮鼠标下节点的父元素（如 React 组件场景），高亮目标由使用方通过回调函数指定
4. **跟随节点**：选中框能够跟随目标节点的位置和大小变化
5. **单实例限制**：同一时间最多只显示一个选中框
6. **点击选中**：点击节点可以选中并标记（可选功能）
7. **信息提示**：悬停时显示节点相关信息，内容由使用方自定义
8. **持久化标记**：标记节点后，添加标记UI（如角标、标签），并持久化存储节点特征
9. **标记恢复**：页面加载时自动恢复之前的标记
10. **稳定选择器**：生成不依赖动态类名的稳定选择器（基于ID、属性、路径等）

## 三、技术架构设计

### 3.1 组件结构

```
templates/ui/node-selector/
├── index.ts          # TypeScript 实现（Custom Element）
├── index.html        # HTML 模板（高亮框、提示框、标记UI）
├── index.css         # 样式文件
├── TECHNICAL_DESIGN.md  # 技术方案文档（本文件）
└── REVIEW.md         # 审查报告（问题修复记录）
```

**HTML模板结构**（在 `index.html` 中，所有UI都在Shadow DOM中统一管理）：

```html
<template>
  <style>
    /* CSS样式在 index.css 中 */
    /* 所有UI元素都使用 position: fixed，相对于视口定位 */
  </style>

  <!-- 高亮框（单个，跟随当前高亮的节点） -->
  <div class="node-selector-highlight" part="highlight"></div>

  <!-- 提示框（单个，跟随鼠标） -->
  <div class="node-selector-tooltip" part="tooltip">
    <div class="node-selector-tooltip__title"></div>
    <div class="node-selector-tooltip__subtitle"></div>
    <div class="node-selector-tooltip__details"></div>
  </div>

  <!-- 标记列表容器（所有标记UI都在这里，动态插入） -->
  <div class="node-selector-markers" part="markers"></div>
</template>
```

**标记UI结构**（动态创建，插入到 Shadow DOM 的 `node-selector-markers` 容器中）：

```html
<!-- 每个标记都是一个独立的元素，插入到 markers 容器中 -->
<div class="node-selector-marker" data-mark-id="..." data-node-selector-marker>
  <div class="node-selector-marker__dot"></div>
  <div class="node-selector-marker__label">Label</div>
  <button class="node-selector-marker__delete" title="删除标记" aria-label="删除标记">×</button>
</div>
```

**实现说明**：

- 所有UI元素（高亮框、提示框、标记列表）都在同一个 Shadow DOM 中
- 高亮框和提示框是单个元素，在模板中定义
- 标记列表是容器，标记UI元素动态创建并插入到这个容器中
- 所有元素都使用 `position: fixed`，通过 JavaScript 计算位置并设置 `top`、`left`、`width`、`height`
- 这样设计的好处：
  - 统一管理，所有UI在一个组件内
  - 样式隔离，不会影响页面
  - 不污染页面DOM，所有元素都在Shadow DOM中
  - 便于清理，组件销毁时所有UI一起清理

### 3.2 核心类设计

#### 3.2.1 NodeSelector 类（Custom Element）

```typescript
class NodeSelector extends HTMLElement {
  // 静态属性
  static TAG_NAME = 'vercel-web-script-node-selector'

  // 私有属性
  #isEnabled: boolean = false
  #currentHoverNode: HTMLElement | null = null // 鼠标下的节点
  #currentHighlightTarget: HTMLElement | null = null // 实际高亮的节点（可能是父元素）
  #highlightBox: HTMLElement | null = null
  #tooltip: HTMLElement | null = null
  #markersContainer: HTMLElement | null = null // 标记列表容器
  #onSelectCallback: ((node: HTMLElement) => void) | null = null
  #getNodeInfoCallback: ((node: HTMLElement) => NodeInfo) | null = null
  #enableClickSelection: boolean = false
  #selectedNode: HTMLElement | null = null
  #resizeObserver: ResizeObserver | null = null
  #mutationObserver: MutationObserver | null = null
  #markedNodes: Record<string, MarkedNodeInfo> = {} // 标记的节点信息（对象格式，便于序列化）
  #markerElements: Map<string, HTMLElement> = new Map() // 标记UI元素
  #markerObservers: Map<string, ResizeObserver> = new Map() // 标记节点的观察器
  #generateNodeSignature: ((node: HTMLElement) => string) | null = null // 节点特征生成函数
  #storageKey: string = 'node-selector-marks' // 存储键名
  #shouldExcludeNode: ((node: HTMLElement) => boolean) | null = null // 节点排除检查函数

  // 核心方法
  enable(options: NodeSelectorOptions): void
  disable(): void
  getSelectedNode(): HTMLElement | null
  clearSelection(): void
  markNode(node: HTMLElement, label?: string): string | null // 标记节点，返回标记ID（label未提供时自动生成哈希）
  unmarkNode(markId: string): boolean // 取消标记
  clearAllMarks(): void // 清除所有标记
  restoreMarks(): void // 恢复标记

  // 私有方法
  #getMarkersContainer(): HTMLElement | null // 获取标记列表容器
  #createMarkerElement(markInfo: MarkedNodeInfo): HTMLElement // 创建标记UI元素
  #updateMarkerPosition(markId: string, node: HTMLElement): void // 更新标记位置
}
```

#### 3.2.2 接口定义

```typescript
/**
 * Node selector configuration options
 */
interface NodeSelectorOptions {
  /** Whether to enable click selection */
  enableClickSelection?: boolean
  /** Callback when a node is selected by click */
  onSelect?: (node: HTMLElement) => void
  /** Callback to get node information for tooltip */
  getNodeInfo?: (node: HTMLElement) => NodeInfo
  /** Custom function to generate stable node signature (default: auto-generate) */
  generateNodeSignature?: (node: HTMLElement) => string
  /** Storage key for persisting marks (default: 'node-selector-marks') */
  storageKey?: string
  /** Whether to auto-restore marks on page load (default: true) */
  autoRestoreMarks?: boolean
  /** Custom function to check if a node should be excluded from selection/marking */
  shouldExcludeNode?: (node: HTMLElement) => boolean
}

/**
 * Node information displayed in tooltip
 */
interface NodeInfo {
  /** Primary information text */
  title: string
  /** Optional secondary information */
  subtitle?: string
  /** Optional additional details */
  details?: string[]
  /** Optional target element to highlight (defaults to the hovered node) */
  highlightTarget?: HTMLElement
}
```

### 3.3 实现细节

#### 3.3.1 节点检测机制

1. **鼠标移动监听**：

   - 在 `document` 上监听 `mousemove` 事件
   - 使用 `document.elementFromPoint()` 获取鼠标下方的元素
   - 过滤掉选择器自身的元素（避免干扰）

2. **元素过滤**：

   - **必须排除的元素**：
     - 选择器组件自身的元素（Shadow DOM 内的元素）
     - 所有插件UI元素（`vercel-web-script-*` 自定义元素）：
       - `vercel-web-script-node-selector`（节点选择器自身）
       - `vercel-web-script-corner-widget`（角标组件）
       - `vercel-web-script-notification`（通知组件）
       - 其他 `vercel-web-script-*` 开头的自定义元素
     - 标记UI元素（`[data-node-selector-marker]`）
   - **排除检查机制**：

     ```typescript
     function isPluginElement(node: HTMLElement): boolean {
       // 检查是否是插件自定义元素
       if (node.tagName.toLowerCase().startsWith('vercel-web-script-')) {
         return true
       }

       // 检查是否是标记UI元素
       if (node.hasAttribute('data-node-selector-marker')) {
         return true
       }

       // 检查是否在插件的 Shadow DOM 内
       let current: Node | null = node
       while (current) {
         if (current instanceof ShadowRoot) {
           const host = current.host
           if (host && host.tagName.toLowerCase().startsWith('vercel-web-script-')) {
             return true
           }
         }
         current = current.parentNode
       }

       return false
     }
     ```

   - **自定义排除规则**：
     - 通过 `shouldExcludeNode` 配置选项提供自定义排除逻辑
     - 如果提供了自定义函数，会先执行自定义检查，再执行默认的插件元素检查
     - 示例：
       ```typescript
       GME_enableNodeSelector({
         shouldExcludeNode: (node) => {
           // 排除特定类名的元素
           if (node.classList.contains('exclude-from-selection')) {
             return true
           }
           // 排除特定data属性的元素
           if (node.hasAttribute('data-exclude-selection')) {
             return true
           }
           return false
         },
       })
       ```

3. **高亮目标确定**：
   - 获取鼠标下的节点作为 `currentHoverNode`
   - 调用 `getNodeInfo` 回调获取节点信息
   - 如果回调返回的 `NodeInfo` 中包含 `highlightTarget`，则使用该元素作为高亮目标
   - 如果没有指定 `highlightTarget`，则默认高亮 `currentHoverNode`
   - 将确定的高亮目标设置为 `currentHighlightTarget`

#### 3.3.2 高亮框实现

1. **绝对定位**：

   - 使用 `position: fixed` 实现绝对定位
   - **容器位置**：高亮框在 Shadow DOM 中（`node-selector-highlight`），与其他UI统一管理
   - 通过 `getBoundingClientRect()` 获取高亮目标节点（`currentHighlightTarget`）的位置和尺寸
   - 考虑页面滚动，使用 `window.scrollX/Y` 或直接使用 `getBoundingClientRect()`
   - **重要**：高亮的是 `highlightTarget`（可能是父元素），而不是鼠标下的节点
   - **Shadow DOM 定位**：`position: fixed` 在 Shadow DOM 中仍然相对于视口定位，不受 Shadow DOM 边界影响

2. **跟随机制**：

   - 使用 `ResizeObserver` 监听高亮目标节点尺寸变化
   - 使用 `MutationObserver` 监听 DOM 结构变化（可选）
   - 在 `scroll` 和 `resize` 事件中更新位置
   - 当高亮目标改变时，需要切换观察器到新的目标节点

3. **样式设计**：
   - 边框高亮（如：2px 蓝色边框）
   - 半透明背景遮罩（可选）
   - 平滑过渡动画

#### 3.3.3 提示框实现

1. **容器位置**：

   - 提示框在 Shadow DOM 中（`node-selector-tooltip`），与其他UI统一管理
   - 使用 `position: fixed` 定位，相对于视口

2. **位置计算**：

   - 默认显示在鼠标位置附近
   - 避免超出视口边界（自动调整位置）
   - 考虑高亮框的位置，避免重叠

3. **内容渲染**：
   - 使用 `getNodeInfo` 回调获取节点信息
   - 支持多行文本显示
   - 支持自定义 HTML 内容（可选）

#### 3.3.4 点击选中功能

1. **点击监听**：

   - 在 `document` 上监听 `click` 事件
   - 仅在 `enableClickSelection` 为 `true` 时启用
   - **排除检查**：点击时，如果点击的是插件元素或被排除的元素，忽略该点击
   - 点击时，传递当前的高亮目标节点（`currentHighlightTarget`）给 `onSelect` 回调
   - 这样选中的是实际高亮的元素（如 React 组件），而不是鼠标下的子节点

2. **选中标记**：
   - 为选中节点（高亮目标）添加特殊样式类
   - 保持选中状态直到调用 `clearSelection()`
   - 选中节点与高亮节点一致（都是 `currentHighlightTarget`）

#### 3.3.5 节点标记功能

1. **标记前检查**：

   - **必须排除**：不能标记插件自身的UI元素（`vercel-web-script-*` 自定义元素）
   - **排除检查**：调用 `markNode` 时，先检查节点是否应该被排除
   - 如果节点是插件元素或被排除的元素，返回 `null` 并记录警告
   - 检查逻辑：

     ```typescript
     function canMarkNode(node: HTMLElement): boolean {
       // 检查是否是插件元素
       if (isPluginElement(node)) {
         return false
       }

       // 检查自定义排除规则
       if (this.#shouldExcludeNode && this.#shouldExcludeNode(node)) {
         return false
       }

       return true
     }
     ```

2. **标记UI实现**：

   - 为标记的节点添加一个标记指示器（marker element）
   - **容器位置**：标记UI直接放在 `document.body` 上（不在 Shadow DOM 内），以便覆盖页面内容
   - **定位方式**：使用 `position: fixed`，通过 `getBoundingClientRect()` 获取节点位置，计算标记UI的位置
   - **视口处理**：使用 `IntersectionObserver` 检测节点是否在视口内，不在视口内时隐藏标记UI
   - 标记指示器包含：标记图标、可选标签文本、删除按钮
   - 标记指示器样式：小圆点/角标，可自定义颜色和样式
   - **样式隔离**：所有UI都在 Shadow DOM 中，天然样式隔离，不会影响页面样式

3. **节点特征生成**：

   - **优先级策略**（生成稳定选择器）：
     1. 如果节点有 `id` 属性，使用 `#id` 选择器
     2. 如果节点有稳定的 `data-*` 属性（如 `data-testid`, `data-id`），使用属性选择器
     3. 如果节点有稳定的 `name` 属性，使用 `[name="..."]` 选择器
     4. 否则，使用路径选择器（基于标签名和位置）
   - **路径选择器生成算法**：

     ```typescript
     /**
      * Generate a stable CSS selector for a node
      * Priority: ID > stable data attributes > name > path selector
      */
     function generateStableSelector(node: HTMLElement): string {
       // 1. ID selector (most stable)
       if (node.id) {
         return `#${node.id}`
       }

       // 2. Stable data attributes
       const stableAttrs = ['data-testid', 'data-id', 'data-component-id']
       for (const attr of stableAttrs) {
         const value = node.getAttribute(attr)
         if (value) {
           return `[${attr}="${value}"]`
         }
       }

       // 3. Name attribute (for form elements)
       if (node.getAttribute('name')) {
         return `[name="${node.getAttribute('name')}"]`
       }

       // 4. Path selector (fallback)
       return generatePathSelector(node)
     }

     /**
      * Generate path-based selector
      */
     function generatePathSelector(node: HTMLElement): string {
       const path: string[] = []
       let current: HTMLElement | null = node

       while (current && current !== document.body) {
         const tag = current.tagName.toLowerCase()
         const parent = current.parentElement

         if (!parent) break

         // 计算在同级元素中的位置（考虑所有子元素）
         const allSiblings = Array.from(parent.children)
         const index = allSiblings.indexOf(current)

         if (allSiblings.length === 1) {
           path.unshift(tag)
         } else {
           // 使用 nth-child 更准确（考虑所有子元素）
           path.unshift(`${tag}:nth-child(${index + 1})`)
         }

         current = parent
       }

       return path.join(' > ')
     }
     ```

   - **选择器验证**：
     - 生成选择器后，使用 `document.querySelector()` 验证是否唯一匹配
     - 如果匹配多个节点，尝试添加更多限定条件：
       - 如果ID选择器匹配多个（不应该发生），添加父元素限定
       - 如果属性选择器匹配多个，添加父元素或路径限定
       - 如果路径选择器匹配多个，向上查找更精确的路径
     - 如果无法生成唯一选择器，记录警告但仍保存标记
     - **注意**：`signature` 用于生成默认标签的哈希输入，`selector` 用于查找节点，两者可以不同

4. **标记持久化**：

   - 使用 `GM_setValue` / `GM_getValue` 存储标记信息
   - **存储格式**：使用对象格式 `Record<string, MarkedNodeInfo>`（不能使用 Map，因为需要 JSON 序列化）
   - 每个标记包含：
     - `markId`: 唯一标识符（UUID）
     - `signature`: 节点特征字符串
     - `selector`: CSS 选择器
     - `label`: 标记名称（如果未提供，自动生成哈希值）
     - `timestamp`: 标记时间
     - `data`: 可选自定义数据
   - **默认名称生成**：
     - 如果调用 `markNode(node)` 时未提供 `label` 参数，自动生成一个哈希值作为默认名称
     - 哈希生成算法：基于节点特征（signature）和时间戳生成短哈希
     - 哈希格式：`#a1b2c3` 或 `#abc123`（6-8位十六进制字符）
     - 示例实现：
       ```typescript
       function generateDefaultLabel(signature: string): string {
         // 简单哈希函数：基于字符串生成短哈希
         let hash = 0
         const str = signature + Date.now().toString()
         for (let i = 0; i < str.length; i++) {
           hash = (hash << 5) - hash + str.charCodeAt(i)
           hash = hash & hash // Convert to 32bit integer
         }
         // 转换为6位十六进制，并添加 # 前缀
         return '#' + Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0')
       }
       ```

5. **标记恢复机制**：

   - 页面加载时（或组件初始化时），从存储中读取标记信息
   - 使用存储的选择器尝试查找节点
   - 如果找到节点，重新创建标记UI
   - 如果节点不存在，标记为"已失效"，可选择清理

6. **标记UI更新**：

   - 使用 `ResizeObserver` 监听标记节点的位置和尺寸变化
   - 使用 `Map<markId, ResizeObserver>` 管理每个标记节点的观察器
   - 当节点位置改变时，更新标记指示器的位置
   - 当节点被删除时，自动移除标记UI、观察器和存储信息
   - 在 `unmarkNode` 时清理对应的观察器
   - 在 `clearAllMarks` 时清理所有观察器
   - 在组件 `disconnectedCallback` 时清理所有观察器，避免内存泄漏

7. **标记恢复机制增强**：
   - 页面加载时（或组件初始化时），从存储中读取标记信息
   - 使用存储的选择器尝试查找节点
   - 如果找到节点，重新创建标记UI和观察器
   - 如果节点不存在，标记为"已失效"（添加 `isValid: false` 字段），但保留在存储中
   - 提供 `cleanupInvalidMarks()` API 清理失效标记
   - 对于 SPA 动态加载的内容，使用 `MutationObserver` 监听 DOM 变化，尝试恢复标记

#### 3.3.6 性能优化

1. **节流处理**：

   - 对 `mousemove` 事件进行节流（如：16ms，约 60fps）
   - 使用 `requestAnimationFrame` 优化位置更新

2. **事件委托**：

   - 在 `document` 级别监听事件，减少事件监听器数量

3. **观察器管理**：
   - 及时清理 `ResizeObserver` 和 `MutationObserver`
   - 仅在需要时创建观察器
   - **重要**：当高亮目标切换时，需要先断开旧目标的观察器，再为新目标创建观察器

#### 3.3.7 高亮目标切换机制

1. **切换流程**：

   ```
   鼠标移动 → 检测鼠标下的节点 (hoverNode)
            → 调用 getNodeInfo(hoverNode) 获取信息
            → 检查返回的 highlightTarget
            → 如果 highlightTarget 与当前高亮目标不同：
               - 断开旧目标的 ResizeObserver 和 MutationObserver
               - 更新 currentHighlightTarget
               - 为新目标创建观察器
               - 更新高亮框位置和尺寸
            → 更新提示框内容
   ```

2. **父子关系验证**（可选但推荐）：

   - 验证 `highlightTarget` 是否是 `hoverNode` 的祖先节点或自身
   - 如果验证失败，回退到使用 `hoverNode` 作为高亮目标
   - 避免高亮不相关的元素导致用户困惑

3. **性能考虑**：
   - 如果 `highlightTarget` 频繁切换，需要优化观察器的创建和销毁
   - 可以考虑复用观察器，只切换观察目标（但 ResizeObserver 不支持切换目标）

## 四、API 设计

### 4.1 全局函数（类似 GME_notification）

```typescript
/**
 * Enable node selector
 * @param options Node selector configuration options
 */
function GME_enableNodeSelector(options?: NodeSelectorOptions): void

/**
 * Disable node selector
 */
function GME_disableNodeSelector(): void

/**
 * Get currently selected node
 * @returns Selected HTMLElement or null
 */
function GME_getSelectedNode(): HTMLElement | null

/**
 * Clear current selection
 */
function GME_clearSelection(): void
```

### 4.2 使用示例

```typescript
// 基本使用：仅高亮，不点击选中
GME_enableNodeSelector({
  getNodeInfo: (node) => ({
    title: node.tagName.toLowerCase(),
    subtitle: node.className || node.id || '',
    details: [`Tag: ${node.tagName}`, `Classes: ${node.className || 'none'}`, `ID: ${node.id || 'none'}`],
  }),
})

// 完整功能：高亮 + 点击选中（React 组件场景）
GME_enableNodeSelector({
  enableClickSelection: true,
  onSelect: (node) => {
    console.log('Selected component:', node)
    GME_notification(`Selected: ${node.getAttribute('data-react-component')}`, 'success')
  },
  getNodeInfo: (node) => {
    // 向上查找 React 组件根节点
    let componentRoot = node
    let current = node

    // 向上遍历查找带有 data-react-component 属性的节点
    while (current && current !== document.body) {
      if (current.hasAttribute('data-react-component')) {
        componentRoot = current
        break
      }
      current = current.parentElement
    }

    // 如果找到了组件根节点，高亮它而不是鼠标下的子节点
    if (componentRoot !== node && componentRoot.hasAttribute('data-react-component')) {
      return {
        title: 'React Component',
        subtitle: componentRoot.getAttribute('data-react-component') || '',
        details: [
          `Component: ${componentRoot.getAttribute('data-react-component')}`,
          `Hovered: ${node.tagName.toLowerCase()}`,
          `Props: ${componentRoot.getAttribute('data-react-props') || 'none'}`,
        ],
        highlightTarget: componentRoot, // 指定高亮组件根节点
      }
    }

    // 普通节点，高亮当前节点
    return {
      title: node.tagName.toLowerCase(),
      subtitle: node.className || '',
      highlightTarget: node, // 明确指定，或省略使用默认值
    }
  },
})

// 禁用选择器
GME_disableNodeSelector()

// 获取选中的节点
const selected = GME_getSelectedNode()
if (selected) {
  console.log('Current selection:', selected)
}

// 清除选中状态
GME_clearSelection()

// 标记节点（点击选中后自动标记，或手动标记）
GME_enableNodeSelector({
  enableClickSelection: true,
  onSelect: (node) => {
    // 自动标记选中的节点（自定义名称）
    const markId = GME_markNode(node, 'React Component')
    if (markId) {
      GME_notification('Node marked successfully', 'success')
    }

    // 或者使用默认哈希名称
    // const markId = GME_markNode(node)  // 会自动生成 "#a1b2c3" 这样的名称
  },
  // 自定义节点特征生成（可选）
  generateNodeSignature: (node) => {
    // 优先使用稳定的属性
    if (node.id) return `id:${node.id}`
    if (node.getAttribute('data-testid')) {
      return `data-testid:${node.getAttribute('data-testid')}`
    }
    if (node.getAttribute('data-react-component')) {
      return `component:${node.getAttribute('data-react-component')}`
    }
    // 使用路径选择器作为后备
    return generatePathSelector(node)
  },
  autoRestoreMarks: true, // 页面加载时自动恢复标记
})

// 手动标记节点（自定义名称）
const markId1 = GME_markNode(document.querySelector('.my-component'), 'My Component')

// 手动标记节点（使用默认哈希名称）
const markId2 = GME_markNode(document.querySelector('.another-component'))
// 会自动生成类似 "#a1b2c3" 的哈希名称

// 尝试标记插件元素会被拒绝
const pluginElement = document.querySelector('vercel-web-script-corner-widget')
const markId3 = GME_markNode(pluginElement) // 返回 null，不能标记插件元素

// 自定义排除规则
GME_enableNodeSelector({
  shouldExcludeNode: (node) => {
    // 排除特定类名
    if (node.classList.contains('exclude-from-selection')) {
      return true
    }
    // 排除特定data属性
    if (node.hasAttribute('data-exclude-selection')) {
      return true
    }
    return false
  },
})

// 取消标记
GME_unmarkNode(markId)

// 清除所有标记
GME_clearAllMarks()

// 获取所有标记
const marks = GME_getMarkedNodes()
console.log('Marked nodes:', marks)

// React 组件场景：高亮组件根节点而不是子节点
GME_enableNodeSelector({
  enableClickSelection: true,
  onSelect: (componentRoot) => {
    // componentRoot 是组件的根节点，不是鼠标下的子节点
    console.log('Selected component:', componentRoot)
  },
  getNodeInfo: (hoveredNode) => {
    // 方法1：通过自定义属性查找组件根节点
    let componentRoot = hoveredNode
    let current = hoveredNode

    while (current && current !== document.body) {
      // 假设组件根节点有 data-react-component 属性
      if (current.hasAttribute('data-react-component')) {
        componentRoot = current
        break
      }
      current = current.parentElement
    }

    // 方法2：通过 React Fiber 查找（需要访问 React 内部）
    // const fiber = getReactFiber(hoveredNode)
    // if (fiber) {
    //   const componentFiber = findComponentFiber(fiber)
    //   if (componentFiber && componentFiber.stateNode) {
    //     componentRoot = componentFiber.stateNode
    //   }
    // }

    if (componentRoot !== hoveredNode) {
      return {
        title: 'React Component',
        subtitle: componentRoot.getAttribute('data-react-component') || 'Unknown',
        details: [
          `Component: ${componentRoot.getAttribute('data-react-component')}`,
          `Hovered element: ${hoveredNode.tagName.toLowerCase()}.${hoveredNode.className}`,
          `Component root: ${componentRoot.tagName.toLowerCase()}.${componentRoot.className}`,
        ],
        highlightTarget: componentRoot, // 高亮组件根节点
      }
    }

    // 普通 DOM 节点
    return {
      title: hoveredNode.tagName.toLowerCase(),
      subtitle: hoveredNode.className || hoveredNode.id || '',
      // highlightTarget 省略，默认使用 hoveredNode
    }
  },
})
```

## 五、样式设计

### 5.1 高亮框样式

- **边框**：2px 实线，颜色可配置（默认蓝色 `#3b82f6`）
- **背景**：半透明遮罩（可选，默认无）
- **圆角**：2px（可选）
- **阴影**：轻微阴影增强视觉层次
- **过渡**：位置和尺寸变化使用 CSS transition

### 5.2 提示框样式

- **背景**：深色半透明背景（`rgba(30, 32, 36, 0.95)`）
- **文字**：白色，清晰易读
- **边框**：1px 边框，轻微圆角
- **阴影**：明显阴影以突出显示
- **位置**：跟随鼠标，但避免超出视口

### 5.3 选中标记样式

- **边框**：与高亮框不同的颜色（如绿色 `#22c55e`）
- **持久显示**：即使鼠标移开也保持显示
- **可区分**：与悬停高亮有明显区别

### 5.4 标记指示器样式

- **容器**：所有标记UI都在 Shadow DOM 的 `node-selector-markers` 容器中，统一管理
- **位置**：使用 `position: fixed`，通过 `getBoundingClientRect()` 计算节点位置，默认显示在节点右上角
- **Shadow DOM 定位**：`position: fixed` 在 Shadow DOM 中仍然相对于视口定位，不受 Shadow DOM 边界影响
- **z-index**：低于高亮框和提示框（如 `2147483646`），确保不遮挡交互
- **形状**：小圆点或角标样式
- **颜色**：可配置（默认橙色 `#f59e0b`）
- **尺寸**：8-12px，不遮挡内容
- **标签显示**：
  - 如果提供了自定义名称，显示自定义名称
  - 如果未提供名称，显示自动生成的哈希值（如 `#a1b2c3`）
  - 标签文本显示在标记旁边或下方
  - 标签可以悬停展开显示完整信息
- **交互**：
  - 悬停显示详细信息（包括标记ID、选择器、时间戳等）
  - 点击删除按钮（×）可取消标记，调用 `GME_unmarkNode(markId)`
  - 暂不支持编辑名称和拖拽（后续扩展）
- **动画**：出现和消失使用过渡动画
- **视口处理**：节点不在视口内时，标记UI自动隐藏（使用 `IntersectionObserver`）

### 5.5 z-index 层级关系

- **组件根元素**：`2147483647`（`vercel-web-script-node-selector` 的 z-index）
- **高亮框**：在 Shadow DOM 中，继承父级 z-index（最高，用户正在交互）
- **提示框**：在 Shadow DOM 中，继承父级 z-index（次高，跟随鼠标）
- **标记UI**：在 Shadow DOM 中，继承父级 z-index（较低，持久显示，不遮挡交互）
- **注意**：由于所有UI都在同一个 Shadow DOM 中，可以通过 CSS 的层叠顺序控制显示优先级

## 六、边界情况处理

1. **节点被删除**：

   - 监听节点移除，自动清理高亮框和观察器

2. **节点被移动**：

   - 通过 `MutationObserver` 检测 DOM 变化
   - 通过 `ResizeObserver` 检测尺寸变化

3. **页面滚动**：

   - 监听 `scroll` 事件，更新高亮框位置
   - 使用 `getBoundingClientRect()` 自动处理滚动偏移

4. **视口变化**：

   - 监听 `resize` 事件，重新计算位置
   - 确保提示框不超出视口

5. **Shadow DOM**：

   - 正确处理 Shadow DOM 内的元素
   - 使用 `composedPath()` 获取事件路径
   - **重要**：排除插件 Shadow DOM 内的所有元素（不能选择或标记）

6. **插件元素排除**：

   - 不能选择或标记任何 `vercel-web-script-*` 自定义元素
   - 不能选择或标记标记UI元素（`[data-node-selector-marker]`）
   - 不能选择或标记插件 Shadow DOM 内的元素
   - 如果尝试标记插件元素，`markNode` 会返回 `null`

7. **iframe**：

   - 可选：支持跨 iframe 选择（需要特殊处理）

8. **标记节点失效**：

   - 当存储的选择器无法找到节点时，标记为失效
   - 提供清理失效标记的机制
   - 在恢复标记时，跳过失效的标记

9. **选择器冲突**：
   - 如果生成的选择器匹配多个节点，使用更精确的选择器
   - 优先使用 ID，其次是稳定的 data 属性
   - 路径选择器作为最后的后备方案

## 七、集成方式

### 7.1 添加到 UI_MODULES

在 `services/tampermonkey/gmCore.ts` 中添加：

```typescript
import nodeSelectorCss from '@templates/ui/node-selector/index.css?raw'
import nodeSelectorHtml from '@templates/ui/node-selector/index.html?raw'
import nodeSelectorTs from '@templates/ui/node-selector/index.ts?raw'

const UI_MODULES: UIModuleConfig[] = [
  // ... existing modules
  {
    name: 'node-selector',
    ts: nodeSelectorTs,
    css: nodeSelectorCss,
    html: nodeSelectorHtml,
    elementName: 'vercel-web-script-node-selector',
  },
]
```

### 7.2 类型定义

在 `templates/editor-typings.d.ts` 中添加类型定义：

```typescript
/**
 * Node information for tooltip display
 */
interface NodeInfo {
  /** Primary information text */
  title: string
  /** Optional secondary information */
  subtitle?: string
  /** Optional additional details */
  details?: string[]
  /** Optional target element to highlight (defaults to the hovered node) */
  highlightTarget?: HTMLElement
}

/**
 * Node selector configuration options
 */
interface NodeSelectorOptions {
  enableClickSelection?: boolean
  onSelect?: (node: HTMLElement) => void
  getNodeInfo?: (node: HTMLElement) => NodeInfo
  generateNodeSignature?: (node: HTMLElement) => string
  storageKey?: string
  autoRestoreMarks?: boolean
  shouldExcludeNode?: (node: HTMLElement) => boolean
}

/**
 * Marked node information
 */
interface MarkedNodeInfo {
  markId: string
  signature: string
  selector: string
  /** Label text for the marker (auto-generated hash if not provided) */
  label: string
  timestamp: number
  /** Whether the mark is still valid (node exists) */
  isValid?: boolean
  data?: Record<string, unknown>
}

/**
 * Enable node selector
 * @param options Node selector configuration options
 */
declare function GME_enableNodeSelector(options?: NodeSelectorOptions): void

/**
 * Disable node selector
 */
declare function GME_disableNodeSelector(): void

/**
 * Get currently selected node
 * @returns Selected HTMLElement or null
 */
declare function GME_getSelectedNode(): HTMLElement | null

/**
 * Clear current selection
 */
declare function GME_clearSelection(): void

/**
 * Mark a node with a persistent marker
 * @param node Node to mark
 * @param label Optional label text for the marker (if not provided, a hash will be generated as default)
 * @returns Mark ID or null if failed (will fail if node is a plugin element or excluded)
 */
declare function GME_markNode(node: HTMLElement, label?: string): string | null

/**
 * Unmark a node by mark ID
 * @param markId Mark ID to remove
 * @returns Whether the mark was successfully removed
 */
declare function GME_unmarkNode(markId: string): boolean

/**
 * Clear all marks
 */
declare function GME_clearAllMarks(): void

/**
 * Get all marked nodes
 * @returns Array of marked node information
 */
declare function GME_getMarkedNodes(): MarkedNodeInfo[]

/**
 * Clean up invalid marks (nodes that no longer exist)
 * @returns Number of marks cleaned up
 */
declare function GME_cleanupInvalidMarks(): number
```

## 八、实现优先级

### Phase 1: 核心功能

1. ✅ 节点检测和高亮
2. ✅ 可调整高亮目标（支持高亮父元素）
3. ✅ 高亮框跟随节点
4. ✅ 基础提示框

### Phase 2: 增强功能

5. ✅ 点击选中功能
6. ✅ 选中标记
7. ✅ 自定义信息回调
8. ✅ 节点标记功能（标记UI + 持久化）

### Phase 3: 优化和边界处理

9. ✅ 性能优化（节流、RAF）
10. ✅ 边界情况处理（高亮目标切换时的观察器管理）
11. ✅ 标记恢复机制
12. ✅ 稳定选择器生成
13. ✅ 样式完善

## 九、注意事项

1. **z-index**：确保选择器组件的 z-index 足够高（如 `2147483647`）
2. **事件穿透**：高亮框和提示框应设置 `pointer-events: none`，避免阻挡页面交互
3. **性能**：在复杂页面上，需要合理节流以避免性能问题
4. **兼容性**：确保 `ResizeObserver` 和 `MutationObserver` 的浏览器兼容性
5. **样式隔离**：所有UI都在 Shadow DOM 中，天然样式隔离，不会影响页面样式
6. **统一管理**：
   - 所有UI（高亮框、提示框、标记列表）都在 `vercel-web-script-node-selector` 的 Shadow DOM 中
   - 不直接插入到 `document.body`，统一在组件内管理
   - 标记UI插入到 `node-selector-markers` 容器中，而不是分散在页面各处
7. **Shadow DOM 定位**：
   - `position: fixed` 在 Shadow DOM 中仍然相对于视口定位
   - 不受 Shadow DOM 边界影响，可以正常覆盖页面内容
   - 所有UI元素都使用 `position: fixed`，通过计算目标节点的 `getBoundingClientRect()` 来定位
8. **高亮目标切换**：当 `highlightTarget` 改变时，需要及时更新 `ResizeObserver` 和 `MutationObserver` 的观察目标，避免内存泄漏
9. **父子关系验证**：确保 `highlightTarget` 是 `hoverNode` 的祖先节点（或自身），避免高亮不相关的元素
10. **标记持久化**：
    - 使用 `GM_setValue` / `GM_getValue` 存储标记，注意存储大小限制（通常5MB）
    - 使用对象格式 `Record<string, MarkedNodeInfo>` 而不是 Map（需要 JSON 序列化）
    - 建议限制标记数量（如最多100个），定期清理失效标记
11. **选择器稳定性**：避免使用动态类名（哈希生成），优先使用 ID、稳定的 data 属性、路径选择器
12. **标记UI管理**：
    - **统一容器**：所有标记UI都在 Shadow DOM 的 `node-selector-markers` 容器中，统一管理
    - 标记指示器需要跟随节点位置，使用 `ResizeObserver` 和 `IntersectionObserver`
    - 节点删除时自动清理标记UI、观察器和存储信息
    - 使用 `Map<markId, ResizeObserver>` 管理观察器，及时清理避免内存泄漏
    - **优势**：所有UI在Shadow DOM中，样式隔离更好，管理更统一，不会污染页面DOM
13. **禁用选择器时的行为**：禁用选择器只影响高亮和点击选中功能，标记UI应该保留（因为它们是持久化的）
14. **页面动态加载**：对于 SPA，使用 `MutationObserver` 监听 DOM 变化，尝试恢复标记
15. **插件元素保护**：
    - 必须排除所有插件UI元素（`vercel-web-script-*`），防止标记或选择插件自身
    - 在节点检测、高亮、点击选中、标记时都要进行排除检查
    - 提供 `shouldExcludeNode` 配置选项，允许自定义排除规则
    - 如果尝试标记插件元素，会返回 `null` 并记录警告

## 十、后续扩展（可选）

1. **多节点选择**：支持按住 Ctrl/Cmd 选择多个节点
2. **键盘快捷键**：支持 ESC 取消选择等
3. **选择器生成**：自动生成 CSS 选择器或 XPath
4. **节点路径显示**：显示节点在 DOM 树中的路径
5. **属性面板**：显示节点的所有属性和样式
