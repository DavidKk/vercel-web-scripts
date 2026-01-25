---
name: typescript-jsdoc-standards
description: Enforces TypeScript/React code comment standards and JSDoc formatting requirements. Use when writing TypeScript or React code, adding comments, documenting functions, or when code review requires proper JSDoc comments.
---

# TypeScript/React Code Comment and JSDoc Standards

## Comment Language

**All code comments must be in English.** Do not use Chinese or other languages for comments.

## Comment Format

- Use `/** */` format for comments (JSDoc style)
- Comments should be placed above the code being commented
- Use single-line format for single-line comments, multi-line format for multi-line comments

## Function Comment Requirements

**All exported functions must include complete JSDoc comments** with:

- Function description
- `@param` parameter descriptions (every parameter must be described)
- `@returns` return value description

**Correct Example:**

```typescript
/**
 * Calculate the total price with tax
 * @param price Base price of the item
 * @param taxRate Tax rate as a decimal (e.g., 0.08 for 8%)
 * @param quantity Number of items
 * @returns Total price including tax
 */
export function calculateTotalWithTax(price: number, taxRate: number, quantity: number = 1): number {
  const subtotal = price * quantity
  return subtotal * (1 + taxRate)
}
```

**Incorrect Examples:**

```typescript
// ❌ Incorrect: Using Chinese comments
// 计算商品总价
export function calculateTotal(price: number, quantity: number): number {
  return price * quantity
}

// ❌ Incorrect: Missing JSDoc comments
export function calculateArea(width: number, height: number): number {
  return width * height
}

// ❌ Incorrect: Incomplete comments
/**
 * @param data
 * @returns
 */
export function processUserData(data: any) {}
```

## Variable and Property Comments

- Complex or non-self-explanatory variables and properties should be commented
- Constants must be commented to explain their purpose
- Simple, self-explanatory variables may not need comments

**Correct Examples:**

```typescript
/** Maximum number of retry attempts for API calls */
const MAX_RETRY_ATTEMPTS = 3

/** User authentication token */
let authToken: string | null = null
```

## Class and Interface Comments

- All exported classes and interfaces must include descriptive comments
- Public methods of classes should be commented
- Properties of interfaces should be commented

**Correct Examples:**

```typescript
/**
 * User service for managing user data
 * Provides methods for user authentication and profile management
 */
export class UserService {
  /**
   * Authenticate user with email and password
   * @param email User's email address
   * @param password User's password
   * @returns Promise that resolves to authentication token
   */
  async authenticate(email: string, password: string): Promise<string> {
    // ...
  }
}

/**
 * User profile information
 */
export interface UserProfile {
  /** Unique user identifier */
  id: string

  /** User's email address */
  email: string
}
```

## Common Mistakes to Avoid

1. ❌ **Do not use Chinese comments**: All comments must be in English
2. ❌ **Do not omit JSDoc comments**: All exported functions must have complete JSDoc comments
3. ❌ **Do not use incomplete JSDoc**: Every `@param` and `@returns` must have descriptions
