<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDark, useToggle } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isDark = useDark()
const toggleDark = useToggle(isDark)

const isLogin = computed(() => route.name === 'login')

const menus = [
  { name: 'dashboard', path: '/', label: '仪表盘', icon: 'mdi:view-dashboard-outline' },
  { name: 'keys', path: '/keys', label: '密钥管理', icon: 'mdi:key-outline' },
  { name: 'channels', path: '/channels', label: '渠道管理', icon: 'mdi:server-network' },
  { name: 'groups', path: '/groups', label: '分组管理', icon: 'mdi:account-group-outline' },
  { name: 'catalog', path: '/catalog', label: '模型目录', icon: 'mdi:book-open-page-variant-outline' },
  { name: 'params', path: '/params', label: '参数模板', icon: 'mdi:tune-variant' },
  { name: 'shop', path: '/shop', label: '商城', icon: 'mdi:storefront-outline' },
  { name: 'usage', path: '/usage', label: '使用记录', icon: 'mdi:chart-timeline-variant' },
  { name: 'settings', path: '/settings', label: '设置', icon: 'mdi:cog-outline' },
]

function toggleTheme() {
  // 用浏览器原生 View Transitions API 做整页主题切换过渡(最新 Chrome/Edge 支持)
  const apply = () => toggleDark()
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    ;(document as Document & { startViewTransition?: (fn: () => void) => void }).startViewTransition?.(apply)
  } else {
    apply()
  }
}

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <router-view v-if="isLogin" />
  <el-container v-else class="layout" direction="horizontal">
    <div class="ambient" aria-hidden="true">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>
    <el-aside width="230px" class="aside">
      <div class="brand">
        <svg viewBox="0 0 24 24" class="logo" aria-hidden="true">
          <path d="M12 2l8 4v12l-8 4-8-4V6l8-4zm0 2.2L6 7.2v9.6l6 3 6-3V7.2l-6-3z" />
        </svg>
        <span class="brand-text">LocalAPI</span>
      </div>
      <el-menu :default-active="route.path" router class="menu">
        <el-menu-item v-for="m in menus" :key="m.name" :index="m.path">
          <el-icon><Icon :icon="m.icon" /></el-icon>
          <span>{{ m.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header" height="60px">
        <div class="header-title">{{ route.meta.title || '' }}</div>
        <div class="header-actions">
          <el-button circle :title="isDark ? '切换到亮色' : '切换到暗色'" @click="toggleTheme()">
            <el-icon :size="18"><Icon :icon="isDark ? 'mdi:white-balance-sunny' : 'mdi:weather-night'" /></el-icon>
          </el-button>
          <el-button text type="danger" @click="logout">
            <el-icon class="mr8"><Icon icon="mdi:logout" /></el-icon>
            退出
          </el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
.layout {
  height: 100%;
  position: relative;
}

.aside {
  position: relative;
  z-index: 1;
  background: var(--glass-bg-strong);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(160%);
  backdrop-filter: blur(var(--glass-blur)) saturate(160%);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-weight: 700;
  font-size: 18px;
}

.logo {
  width: 28px;
  height: 28px;
  fill: var(--brand);
}

.menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border-bottom: 1px solid var(--glass-border);
  padding: 0 28px;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.main {
  overflow-y: auto;
  padding: 28px 32px 40px;
  position: relative;
  z-index: 1;
}
</style>