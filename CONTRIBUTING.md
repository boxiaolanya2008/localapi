# 贡献指南 / Contributing

## 提交 issue

- bug 用 [bug report 模板](.github/ISSUE_TEMPLATE/bug_report.md)，feature 用 [feature request 模板](.github/ISSUE_TEMPLATE/feature_request.md)
- 标题一句话说清现象或诉求，正文给复现步骤或用例

## 提 PR

1. 从 main 切分支：`feat/<描述>`、`fix/<描述>`、`docs/<描述>`
2. 改代码，跑测试：`pnpm test`
3. 提交信息用 conventional 格式：`feat: 新增 xxx`、`fix: 修复 xxx`、`docs: 更新 xxx`
4. push 后开 PR，用 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md)，描述写清改了什么、为什么、怎么验证

## 代码规范

- 无装饰注释；注释只写为什么，不写是什么
- 代码里禁止 emoji，图标用 SVG（项目里走 iconify）
- 语法极简，先跑起来再说
- 包内改动需同步维护对应包的 README 与 AGENTS.md