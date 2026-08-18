import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  { path: '/', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '仪表盘' } },
  { path: '/keys', name: 'keys', component: () => import('@/views/KeysView.vue'), meta: { title: '密钥管理' } },
  { path: '/channels', name: 'channels', component: () => import('@/views/ChannelsView.vue'), meta: { title: '渠道管理' } },
  { path: '/groups', name: 'groups', component: () => import('@/views/GroupsView.vue'), meta: { title: '分组管理' } },
  { path: '/catalog', name: 'catalog', component: () => import('@/views/CatalogView.vue'), meta: { title: '模型目录' } },
  { path: '/usage', name: 'usage', component: () => import('@/views/UsageView.vue'), meta: { title: '使用记录' } },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  NProgress.start()
  const auth = useAuthStore()
  if (to.name !== 'login' && !auth.token) return { name: 'login' }
  if (to.name === 'login' && auth.token) return { name: 'dashboard' }
  return true
})

router.afterEach((to) => {
  NProgress.done()
  document.title = (to.meta.title ? to.meta.title + ' · ' : '') + 'LocalAPI 中转站'
})

export default router