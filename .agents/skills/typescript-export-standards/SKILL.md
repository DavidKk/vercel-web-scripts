---
name: typescript-export-standards
description: Enforces TypeScript/React function export format standards. Use when exporting functions, creating React components, writing custom hooks, or when code review requires proper export syntax.
---

# TypeScript/React Function Export Standards

## Function Export Format (Critical)

**All exported functions must use `export function xxx() {}` format.**  
**Do not use `export const functionName = () => {}` to export functions.**

**Correct Examples:**

```typescript
export function calculateTotal(price: number, quantity: number): number {
  return price * quantity
}
```

**Incorrect Examples:**

```typescript
// ❌ Incorrect: Using export const to export functions
export const calculateTotal = (price: number, quantity: number): number => {
  return price * quantity
}
```

## React Component Standards

- **Page components**: Use `export default function PageName()`
- **Reusable components**: Use `export function ComponentName()`

**Correct Examples:**

```tsx
// Page component
export default function NotificationTestPage() {
  return <div>...</div>
}

// Reusable component
export function NotificationItem({ message }: { message: string }) {
  return <div>{message}</div>
}
```

## Custom Hook Standards

**All custom Hooks must use `export function useXxx() {}` format.**  
**Do not use `export const useXxx = () => {}` to declare Hooks.**

Hook return values should maintain a flat structure, avoiding deep nesting.

**Correct Examples:**

```typescript
export function useCounter(initialValue: number = 0) {
  const [count, setCount] = useState(initialValue)

  function increment() {
    setCount((c) => c + 1)
  }

  function decrement() {
    setCount((c) => c - 1)
  }

  return {
    count,
    increment,
    decrement,
  }
}
```

**Incorrect Examples:**

```typescript
// ❌ Incorrect: Using export const to declare Hook
export const useCounter = (initialValue: number = 0) => {
  // ...
}

// ❌ Incorrect: Return value is too deeply nested
export function useApi() {
  return {
    actions: {
      fetch: () => {}, // Should be flat, directly return fetch
      update: () => {},
    },
  }
}
```

## Utility Function Standards

- Utility functions should be placed in dedicated directories (e.g., `utils/`)
- Reusable utility functions use `export function`
- Internal helper functions are not exported

**Correct Examples:**

```typescript
// utils/format.ts

// Internal helper function, not exported
function padZero(num: number): string {
  return num.toString().padStart(2, '0')
}

// Exported utility functions
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function formatTime(date: Date): string {
  const hours = padZero(date.getHours())
  const minutes = padZero(date.getMinutes())
  return `${hours}:${minutes}`
}
```

## Common Mistakes to Avoid

1. ❌ **Do not use `export const` to export functions**: All function exports must use `export function` syntax
2. ❌ **Do not use deeply nested return values**: Hook and utility function return values should maintain a flat structure
3. ❌ **Do not over-export**: Only export functions that truly need to be used by other modules
