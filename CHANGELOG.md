# Changelog

## 0.2.1 - 2026-08-18

- 使用记录新增真实缓存命中列:从上游返回的 usage 提取缓存 token(兼容 prompt_tokens_details.cached_tokens / prompt_cache_hit_tokens / cache_read_input_tokens),流式与非流式均记录,含整体命中率汇总
- 分组支持系统提示词注入(优先于渠道注入),「破甲」分组自动注入授权安全测试提示词(老库自动回填)
- 仪表盘统计卡片等高
- 修复分组消费历史数据空名显示

## 0.2.0 - 2026-08-18

- 渠道/API Key/模型改为界面录入,去除 .env 注入渠道
- 内置 2026 热门模型价格目录(百万 token 输入/输出/缓存命中)与 19 家提供商 logo
- 新增分组管理:自定义计费倍率(免费破甲/半价/原价/加价)+ 模型限制,密钥绑定分组
- 内置系统提示词预设,渠道可选注入(默认关闭=100% 透传)
- 修复对话框被背景遮挡(页面动画残留 transform 导致弹窗遮罩定位异常)
- 修复今日 Token 图标不显示(无效的 iconify 图标名)

## 0.1.0 - 2026-08-18

- 初始版本:OpenAI 兼容中转(/v1/chat/completions、completions、embeddings、models,支持流式)
- Vue 3 管理台:密钥、渠道主题、使用记录、统计图表、余额(上游实时 + 本地估算双源)
- SQLite 持久化(node:sqlite),env 渠道首启种子
- 默认监听 127.0.0.1,管理接口 X-Admin-Token 校验