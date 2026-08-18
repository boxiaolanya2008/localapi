import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const api = axios.create({ timeout: 30_000 })

api.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) config.headers['x-admin-token'] = auth.token
  return config
})

api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const status = err.response?.status
    if (status === 401 || status === 403) {
      const auth = useAuthStore()
      if (auth.token) {
        auth.logout()
        router.push({ name: 'login' })
      }
    }
    const msg =
      err.response?.data?.message || err.response?.statusText || err.message || 'request failed'
    ElMessage.error(String(msg))
    return Promise.reject(err)
  },
)

export default api