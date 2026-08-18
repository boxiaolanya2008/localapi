# @example/example-plugin

## Overview / 概述

Example Cordis plugin demonstrating the Simple Dev preset conventions.

## Code / 代码

```typescript
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
/* jscpd:ignore-end */

/** Register adapter for mock models. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    ctx.llm.registerAdapter(['mock'], adapter)
    return () => ctx.llm.unregisterAdapter(['mock'])
  }, 'example-plugin: adapter')
}

/** Plugin manifest. */
export const name = 'example-plugin'

/** Injection requirements. */
export inject = ['llm']
```

## Comments Example / 注释示例

```typescript
// BAD (禁止)
/** This initializes the system */
// TODO: clean up later
/** @deprecated Use newInit */

// GOOD (推荐)
/** Initialize system services. */
/** Register adapter. */
/** Validate config schema. */
```

## SVG Icon Example / SVG图标示例

```typescript
// Instead of emoji
const checkIcon = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
const crossIcon = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
```
