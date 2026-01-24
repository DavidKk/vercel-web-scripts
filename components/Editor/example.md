# CodeEditor Usage Guide

## 重要变更

为了解决光标跳跃和组件重载问题，CodeEditor 不再自动同步 `content` prop 的变化。

## 正确使用方式

### 1. 基本用法（单文件编辑）

```tsx
function BasicEditor() {
  const [content, setContent] = useState('// Initial content')

  return (
    <CodeEditor
      content={content} // 仅用于初始化
      onChange={setContent} // 用户编辑时更新状态
      onSave={() => console.log('Save:', content)}
    />
  )
}
```

### 2. 文件切换（多文件编辑器）

```tsx
function MultiFileEditor() {
  const editorRef = useRef<CodeEditorRef>(null)
  const [currentFile, setCurrentFile] = useState('file1.ts')
  const [files, setFiles] = useState({
    'file1.ts': '// File 1 content',
    'file2.ts': '// File 2 content',
  })

  const switchFile = (fileName: string) => {
    if (editorRef.current && currentFile !== fileName) {
      // 保存当前文件内容
      const currentContent = editorRef.current.getContent()
      setFiles((prev) => ({
        ...prev,
        [currentFile]: currentContent,
      }))

      // 切换到新文件
      setCurrentFile(fileName)
      // 使用 forceUpdate=true 确保切换到新文件时重新设置内容
      editorRef.current.setContent(files[fileName] || '', true)
    }
  }

  const handleContentChange = (newContent: string) => {
    // 实时更新当前文件内容（用于语法高亮、错误检查等）
    setFiles((prev) => ({
      ...prev,
      [currentFile]: newContent,
    }))
  }

  return (
    <div>
      <div>
        {Object.keys(files).map((fileName) => (
          <button key={fileName} onClick={() => switchFile(fileName)} className={currentFile === fileName ? 'active' : ''}>
            {fileName}
          </button>
        ))}
      </div>

      <CodeEditor
        editorRef={editorRef}
        content={files[currentFile]} // 初始内容
        onChange={handleContentChange} // 实时更新
        path={currentFile}
      />
    </div>
  )
}
```

### 3. 可用的 Ref 方法

```tsx
interface CodeEditorRef {
  /** 导航到指定行号并高亮 */
  navigateToLine: (lineNumber: number) => void

  /** 设置编辑器内容（用于文件切换） */
  setContent: (content: string, forceUpdate?: boolean) => void

  /** 获取当前编辑器内容 */
  getContent: () => string
}
```

#### setContent 方法说明

- `content`: 要设置的新内容
- `forceUpdate`: 是否强制更新（可选，默认 false）
  - `false`: 只有当内容不同时才更新
  - `true`: 无论内容是否相同都重新设置，适用于文件切换场景

## 核心原则

1. **初始化**：`content` prop 仅用于编辑器初始化
2. **用户编辑**：通过 `onChange` 回调处理内容变化
3. **文件切换**：使用 `ref.setContent()` 方法显式更新内容
4. **内容获取**：使用 `ref.getContent()` 获取最新内容
5. **避免重载**：永远不要在 useEffect 中自动同步 content 变化

## 错误的做法 ❌

```tsx
// 这会导致光标跳跃！
useEffect(() => {
  if (editorRef.current) {
    editorRef.current.setContent(content) // ❌ 错误
  }
}, [content])
```

## 正确的做法 ✅

```tsx
// 明确的文件切换操作
const handleFileSwitch = (newContent: string) => {
  if (editorRef.current) {
    // 文件切换时建议使用 forceUpdate=true
    editorRef.current.setContent(newContent, true) // ✅ 推荐
  }
}

// 或者简单内容更新
const handleContentUpdate = (newContent: string) => {
  if (editorRef.current) {
    editorRef.current.setContent(newContent) // ✅ 正确
  }
}
```

### 使用场景区别

**文件切换 (forceUpdate=true)**:

```tsx
editorRef.current.setContent(newFileContent, true)
```

- 光标重置到文档开头（对于大幅变化的内容）
- 强制刷新编辑器状态
- 适用于切换到不同的文件

**内容更新 (forceUpdate=false 或不传)**:

```tsx
editorRef.current.setContent(updatedContent)
```

- 尝试保持当前光标和滚动位置
- 只在内容真正改变时更新
- 适用于同一文件的内容修改
