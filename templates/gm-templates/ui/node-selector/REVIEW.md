# 技术方案审查报告

## 发现的问题和遗漏

### 1. 存储格式问题 ⚠️ **重要**

**问题**：技术方案中提到使用 `Map<markId, MarkedNodeInfo>` 存储，但 `GM_setValue` 需要序列化，Map 不能直接序列化为 JSON。

**修复**：应该使用对象格式 `Record<string, MarkedNodeInfo>` 或数组格式存储。

```typescript
// 错误
const marks: Map<string, MarkedNodeInfo> = new Map()

// 正确
const marks: Record<string, MarkedNodeInfo> = {}
// 或
const marks: MarkedNodeInfo[] = []
```

### 2. 标记UI容器位置 ❓ **需要明确**

**问题**：标记指示器应该放在哪里？Shadow DOM 内还是直接放在 body？

**建议**：

- 标记UI应该直接放在 `document.body` 上，而不是 Shadow DOM 内
- 原因：标记UI需要覆盖在页面内容上，且需要跟随节点位置
- 但样式应该通过 Shadow DOM 隔离，避免影响页面

### 3. 标记UI定位机制 ❓ **需要详细说明**

**问题**：标记指示器使用绝对定位，但需要明确：

- 相对于哪个元素定位？（应该是相对于标记的节点）
- 节点不在视口内时如何处理？
- 节点被滚动出视口时，标记UI是否隐藏？

**建议**：

- 使用 `position: fixed`，通过 `getBoundingClientRect()` 获取节点位置
- 当节点不在视口内时，标记UI可以隐藏或显示在视口边缘
- 使用 `IntersectionObserver` 检测节点是否在视口内

### 4. 多个观察器的管理 ⚠️ **需要补充**

**问题**：每个标记节点都需要 `ResizeObserver`，需要管理多个观察器。

**建议**：

- 使用 `Map<markId, ResizeObserver>` 管理观察器
- 在 `unmarkNode` 时清理对应的观察器
- 在 `clearAllMarks` 时清理所有观察器
- 在组件 `disconnectedCallback` 时清理所有观察器

### 5. 路径选择器生成算法 ⚠️ **可能有bug**

**问题**：`generatePathSelector` 中使用 `nth-of-type` 可能不准确。

**分析**：

- `nth-of-type` 只考虑相同标签名的元素，但实际DOM中可能有其他元素
- 应该使用 `nth-child` 或更精确的方法

**建议**：

```typescript
// 当前实现（可能有问题）
const siblings = Array.from(parent.children).filter((el) => el.tagName.toLowerCase() === tag)
const index = siblings.indexOf(current)
path.unshift(`${tag}:nth-of-type(${index + 1})`)

// 更准确的实现
const allSiblings = Array.from(parent.children)
const index = allSiblings.indexOf(current)
path.unshift(`${tag}:nth-child(${index + 1})`)
```

### 6. 标记恢复的错误处理 ❓ **需要补充**

**问题**：如果选择器找不到节点，应该如何处理？

**建议**：

- 记录失效的标记（添加 `isValid: false` 字段）
- 提供清理失效标记的API
- 在恢复时跳过失效标记，但保留在存储中（用户可能手动清理）

### 7. 标记UI的HTML结构 ❓ **需要补充**

**问题**：没有详细说明标记UI的HTML结构。

**建议**：

```html
<div class="node-selector-marker" data-mark-id="...">
  <div class="node-selector-marker__dot"></div>
  <div class="node-selector-marker__label">Label</div>
  <button class="node-selector-marker__delete" title="删除标记">×</button>
</div>
```

### 8. 禁用选择器时的行为 ❓ **需要明确**

**问题**：禁用选择器时，标记UI是否应该保留？

**建议**：

- 标记UI应该保留（因为它们是持久化的）
- 禁用选择器只影响高亮和点击选中功能
- 标记UI可以独立管理

### 9. 标记UI的z-index层级 ⚠️ **需要明确**

**问题**：标记UI、高亮框、提示框的z-index层级关系。

**建议**：

- 高亮框：最高（用户正在交互）
- 提示框：次高（跟随鼠标）
- 标记UI：较低（持久显示，不遮挡交互）

### 10. 选择器验证机制 ❓ **需要详细说明**

**问题**：如果选择器匹配多个节点，如何添加更多限定条件？

**建议**：

- 如果ID选择器匹配多个（不应该发生），添加父元素限定
- 如果属性选择器匹配多个，添加父元素或路径限定
- 如果路径选择器匹配多个，向上查找更精确的路径

### 11. 节点特征生成函数 ⚠️ **需要明确**

**问题**：`generateNodeSignature` 和 `generateStableSelector` 的关系？

**分析**：

- `signature` 是用于生成默认标签的哈希输入
- `selector` 是用于查找节点的CSS选择器
- 两者可能不同

**建议**：

- `signature` 应该包含节点的稳定特征（ID、data属性等）
- `selector` 是用于查找节点的CSS选择器
- 两者可以相同，也可以不同

### 12. 标记UI的交互细节 ❓ **需要补充**

**问题**：

- 如何删除标记？（点击删除按钮）
- 如何编辑标记名称？（可能需要双击或右键菜单）
- 标记UI是否可以拖拽？

**建议**：

- 点击删除按钮：调用 `GME_unmarkNode(markId)`
- 编辑名称：暂不实现（后续扩展）
- 拖拽：暂不实现（后续扩展）

### 13. 页面动态加载 ❓ **需要处理**

**问题**：如果页面是SPA，动态加载内容后，标记可能失效。

**建议**：

- 使用 `MutationObserver` 监听DOM变化
- 当新内容加载时，尝试恢复标记
- 或者提供手动恢复标记的API

### 14. 标记UI的样式隔离 ⚠️ **需要明确**

**问题**：标记UI放在body上，如何确保样式不影响页面？

**建议**：

- 使用 Shadow DOM 包裹标记UI
- 或者使用非常具体的选择器（如 `[data-node-selector-marker]`）
- 使用 CSS 变量和命名空间

### 15. 存储大小限制 ⚠️ **需要注意**

**问题**：GM_setValue 可能有存储大小限制（通常5MB）。

**建议**：

- 限制标记数量（如最多100个）
- 定期清理失效标记
- 压缩存储数据（移除不必要的字段）

## 需要补充的内容

### 1. HTML模板结构

需要详细说明：

- 高亮框的HTML结构
- 提示框的HTML结构
- 标记UI的HTML结构

### 2. CSS样式细节

需要说明：

- 各个组件的具体样式值
- 动画效果
- 响应式处理

### 3. 错误处理

需要说明：

- 各种错误情况的处理方式
- 错误提示机制

### 4. 性能优化细节

需要说明：

- 节流的具体实现
- 观察器的创建和销毁时机
- 内存泄漏的预防

### 5. 测试场景

需要列出：

- 各种边界情况的测试场景
- 性能测试场景

## 新增功能（已添加）

### 插件元素排除功能 ✅

- **需求**：不能标记或选择插件自身的内容（如 `templates/ui` 中的其他插件UI）
- **实现**：
  - 自动排除所有 `vercel-web-script-*` 自定义元素
  - 排除标记UI元素（`[data-node-selector-marker]`）
  - 排除插件 Shadow DOM 内的元素
  - 提供 `shouldExcludeNode` 配置选项，支持自定义排除规则
  - 在节点检测、高亮、点击选中、标记时都进行排除检查
- **状态**：✅ 已添加到技术方案

## 建议的修复优先级

### 高优先级（必须修复）

1. ✅ 存储格式问题（Map → Object/Array）
2. ✅ 路径选择器算法bug
3. ✅ 标记UI容器位置和定位机制
4. ✅ 多个观察器的管理
5. ✅ 插件元素排除功能（新增）

### 中优先级（建议补充）

5. ✅ 标记恢复的错误处理
6. ✅ 标记UI的HTML结构
7. ✅ z-index层级关系
8. ✅ 选择器验证机制

### 低优先级（可选优化）

9. ✅ 页面动态加载处理
10. ✅ 标记UI的交互细节
11. ✅ 存储大小限制处理
