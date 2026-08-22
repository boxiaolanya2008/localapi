# AGENTS.md

## 代理指令 / Agent Instructions

### 编码风格 / Coding Style

- 无装饰注释 / No ornamental comments — 注释只写为什么，不写是什么
- 禁止 emoji，图标用 SVG / No emoji, use SVG (iconify)
- 语法极简 / Minimal syntax — 先跑起来再谈优化
- JSDoc 仅用于非显而易见的契约 / JSDoc for non-obvious contracts
- 标准库够用不引第三方，一个文件搞定不用两个 / Prefer stdlib

### 自动 PR 工作流 / Auto PR Workflow

1. 创建分支：`feat/<name>` / `fix/<name>` / `docs/<name>`
2. 提交信息带 issue 编号：`feat: add xxx (#123)`
3. Push 并开 PR，用 `.github/PULL_REQUEST_TEMPLATE.md`
4. CI 通过后合并

### 技能调用 / Skill Invocation

主动加载：
- Code review → `dsh-code-review`
- Doc changes → `dsh-doc-standards`
- Before push → `dsh-pre-push-checks`

### 包结构 / Package Structure

```
server/   后端：Express + node:sqlite
  src/    config / db / relay / protocol / billing / admin
  tests/  api.test.ts / protocol.test.ts
web/      前端：Vue 3 + Element Plus + ECharts
  src/constants/  catalog / providers / prompts
tools/    mock 上游与验证脚本
```

详见 `server/AGENTS.md` 与 `web/AGENTS.md`。

### 双语 / Bilingual

- 代码与文档用英文，注释可双语 / English for code/docs
- 使用提示语言回复 / Respond in prompt language

### 运营约束 / Ops Notes

- 默认监听 `127.0.0.1`，`ADMIN_TOKEN` 必须改
- 图片处理图文分离：视觉仅提取物体场景颜色布局，文字仅作纹理理解，不转录到代码输出
