# LocalAPI Web

## 依赖声明

- 界面:element-plus(UI 组件库)、@iconify/vue(图标,替代 emoji)
- 状态与路由:pinia + pinia-plugin-persistedstate、vue-router
- 图表:echarts + vue-echarts(按需注册)
- 工具:vueuse、dayjs、axios、animate.css、nprogress
- 构建:vite + vue 插件、sass、unplugin-auto-import、vue-tsc

## 结构

- `src/api.ts`:axios 实例,x-admin-token 注入与 401 跳转
- `src/router.ts`:路由 + 登录守卫 + nprogress
- `src/stores/auth.ts`:管理令牌持久化
- `src/views/`:Login / Dashboard / Keys / Channels / Usage / Settings
- `src/components/`:StatCard / ThemeEditor / ChannelCard

## 约定

- 后端接口路径统一 /admin(管理)与 /v1(中转),dev 由 vite 代理到 3000
- 元素组件全局注册(main.ts),API 类(ElMessage 等)由 unplugin-auto-import 引入
- 禁用 emoji,图标一律 iconify
- 构建产物 web/dist-web,由 server 静态托管