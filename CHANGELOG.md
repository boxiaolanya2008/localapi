# Changelog

## 0.1.0 - 2026-08-18

- 初始版本:OpenAI 兼容中转(/v1/chat/completions、completions、embeddings、models,支持流式)
- Vue 3 管理台:密钥、渠道主题、使用记录、统计图表、余额(上游实时 + 本地估算双源)
- SQLite 持久化(node:sqlite),env 渠道首启种子
- 默认监听 127.0.0.1,管理接口 X-Admin-Token 校验