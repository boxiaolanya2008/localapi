<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'

const auth = useAuthStore()
const router = useRouter()
const token = ref('')
const loading = ref(false)

async function login() {
  if (!token.value.trim()) return
  loading.value = true
  try {
    await api.get('/admin/settings', { headers: { 'x-admin-token': token.value.trim() } })
    auth.setToken(token.value.trim())
    router.push({ name: 'dashboard' })
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-bg">
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
    <div class="login-card">
      <div class="login-logo">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l8 4v12l-8 4-8-4V6l8-4zm0 2.2L6 7.2v9.6l6 3 6-3V7.2l-6-3z" />
        </svg>
      </div>
      <h1>LocalAPI 中转站</h1>
      <p class="sub">输入 .env 里的 ADMIN_TOKEN 登录管理台</p>
      <el-input
        v-model="token"
        type="password"
        size="large"
        placeholder="ADMIN_TOKEN"
        show-password
        @keyup.enter="login"
      />
      <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="login">
        进入控制台
      </el-button>
      <div class="tips">
        <div><Icon icon="mdi:lock-outline" /> 默认只监听 127.0.0.1</div>
        <div><Icon icon="mdi:chart-line" /> 中转 + 记账一体的本地服务</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-bg {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.5;
  animation: float 9s ease-in-out infinite;
}

.blob-1 {
  width: 340px;
  height: 340px;
  background: #10b981;
  top: -70px;
  left: -70px;
}

.blob-2 {
  width: 280px;
  height: 280px;
  background: #3b82f6;
  bottom: -50px;
  right: -50px;
  animation-delay: -3s;
}

.blob-3 {
  width: 200px;
  height: 200px;
  background: #8b5cf6;
  top: 40%;
  left: 60%;
  animation-delay: -6s;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(34px);
  }
}

.login-card {
  position: relative;
  z-index: 1;
  width: 380px;
  padding: 40px 36px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  animation: cardIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  text-align: center;
  color: #fff;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.login-logo svg {
  width: 52px;
  height: 52px;
  fill: #34d399;
}

h1 {
  font-size: 22px;
  margin: 14px 0 6px;
  letter-spacing: 1px;
}

.sub {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  margin: 0 0 24px;
}

.login-btn {
  width: 100%;
  margin-top: 16px;
}

.tips {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 22px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);

  div {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}
</style>