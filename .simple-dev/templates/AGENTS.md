# AGENTS.md

## Agent Instructions / 代理指令

### Coding Style / 编码风格

- No ornamental comments / 禁止装饰注释
- No emoji, use SVG / 禁止emoji，使用SVG
- Minimal syntax / 语法极简
- JSDoc for non-obvious contracts / JSDoc仅用于非显而易见的契约

### Auto PR Workflow / 自动PR工作流

1. Create branch: `feat/<name>` or `fix/<name>`
2. Commit with conventional message
3. Push and create PR
4. Auto-merge if checks pass

### Skill Invocation / 技能调用

Load skills proactively:
- Code review → `dsh-code-review`
- Doc changes → `dsh-doc-standards`
- Before push → `dsh-pre-push-checks`

### Package Structure / 包结构

```
packages/
  <group>/
    <pkg>/
      src/
      tests/
      package.json
      README.md
      AGENTS.md
```

### Bilingual / 双语

- English for code/docs / 英文用于代码/文档
- Comments may be bilingual / 注释可双语
- Respond in prompt language / 使用提示语言回复
