import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'animate.css'
import '@/styles/main.scss'
import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  app.use(pinia)

  // 桌面端自动注入 ADMIN_TOKEN，避免 403
  try {
    const token = await window.localapi?.getAdminToken?.()
    if (token) {
      const auth = useAuthStore(pinia)
      auth.setToken(token)
    }
  } catch {}

  app.use(router)
  app.use(ElementPlus, { locale: zhCn })
  app.mount('#app')
}

void bootstrap()