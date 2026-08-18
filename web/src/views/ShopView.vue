<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import api from '@/api'

const channels = ref<any[]>([])
const channelId = ref<number>()
const amount = ref(50)
const customAmount = ref(0)
const charging = ref(false)
const unlocked = ref(false)
const activating = ref(false)

const PACKS = [
  { label: '¥10', value: 10, icon: 'mdi:coffee-outline' },
  { label: '¥50', value: 50, icon: 'mdi:rocket-outline' },
  { label: '¥100', value: 100, icon: 'mdi:star-four-points-outline' },
]

async function load() {
  const [c, s] = await Promise.all([api.get('/admin/channels'), api.get('/admin/settings')])
  channels.value = c.data
  unlocked.value = !!s.data.features?.premiumUnlocked
  if (!channelId.value && c.data.length) channelId.value = c.data[0].id
}

onMounted(load)

function chooseAmount(v: number) {
  amount.value = v
  customAmount.value = 0
}

async function recharge() {
  const c = amount.value === -1 ? customAmount.value : amount.value
  if (!channelId.value) {
    ElMessage.warning('先选一个渠道(额度存到该渠道)')
    return
  }
  if (!c || c <= 0) {
    ElMessage.warning('输入有效金额')
    return
  }
  charging.value = true
  try {
    const { data } = await api.post(`/admin/channels/${channelId.value}/credit`, { delta: c })
    const ch = channels.value.find((x) => x.id === channelId.value)
    if (ch) ch.credit = data.credit
    ElMessage.success(`已到账 ¥${c},渠道「${ch?.name}」当前额度 ¥${data.credit}`)
  } catch {
    // 拦截器已提示
  } finally {
    charging.value = false
  }
}

async function unlockNow() {
  activating.value = true
  try {
    const { data } = await api.post('/admin/settings/activate', { activate_key: 'LP-VIP-LOCAL-2026' })
    if (data.unlocked) {
      unlocked.value = true
      ElMessage.success('高级功能已解锁')
    }
  } catch {
    // 拦截器已提示
  } finally {
    activating.value = false
  }
}
</script>

<template>
  <div class="page">
    <el-row :gutter="16">
      <el-col :span="14" :xs="24">
        <div class="card">
          <div class="card-title"><el-icon class="mr8"><Icon icon="mdi:wallet-plus-outline" /></el-icon>充值中心</div>
          <p class="muted">本地版:充多少到账多少,无需扫码、不走任何支付通道。充入的余额会加到所选渠道的额度(credit),用于本地估算剩余余额。</p>

          <div class="form-row">
            <span class="label">存入渠道</span>
            <el-select v-model="channelId" placeholder="选择渠道" style="width: 280px">
              <el-option v-for="c in channels" :key="c.id" :label="`${c.name} (当前额度 ¥${c.credit ?? 0})`" :value="c.id" />
            </el-select>
          </div>

          <div class="packs">
            <button
              v-for="p in PACKS"
              :key="p.value"
              type="button"
              class="pack"
              :class="{ active: amount === p.value && customAmount === 0 }"
              @click="chooseAmount(p.value)"
            >
              <el-icon :size="22"><Icon :icon="p.icon" /></el-icon>
              <span class="pv">{{ p.label }}</span>
            </button>
            <button type="button" class="pack" :class="{ active: amount === -1 }" @click="amount = -1">
              <el-icon :size="22"><Icon icon="mdi:pencil-outline" /></el-icon>
              <span class="pv">自定义</span>
            </button>
          </div>

          <div v-if="amount === -1" class="custom">
            <el-input-number v-model="customAmount" :min="1" :precision="0" :controls="false" placeholder="金额(¥)" style="width: 180px" />
            <span class="muted">¥</span>
          </div>

          <el-button type="primary" size="large" class="charge-btn" :loading="charging" @click="recharge">
            <el-icon class="mr8"><Icon icon="mdi:bank-transfer-in" /></el-icon>立即充值
          </el-button>
        </div>
      </el-col>

      <el-col :span="10" :xs="24">
        <div class="card">
          <div class="card-title"><el-icon class="mr8"><Icon icon="mdi:diamond-stone" /></el-icon>功能商店</div>
          <div class="feature" :class="{ unlocked }">
            <div>
              <div class="f-name">高级提示词(付费)</div>
              <div class="muted">越狱·授权安全 / 极致编码·人类化 / 深度反思专家</div>
            </div>
            <el-tag v-if="unlocked" type="success" effect="dark">已解锁</el-tag>
            <el-button v-else type="warning" plain :loading="activating" @click="unlockNow">一键解锁</el-button>
          </div>
          <div class="notice">本地直通,领取即到,不扫码、不联网支付。</div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.card-title {
  display: flex;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0;

  .label {
    color: var(--text-sub);
    font-size: 13px;
    min-width: 64px;
  }
}

.packs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.pack {
  width: 108px;
  padding: 14px 0;
  border-radius: 12px;
  border: 2px solid var(--border-soft);
  background: var(--card-bg);
  color: var(--text-main);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;

  .pv {
    font-weight: 700;
  }

  &.active {
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-3px);
    box-shadow: 0 8px 20px color-mix(in srgb, var(--brand) 30%, transparent);
  }

  &:hover {
    transform: translateY(-2px);
  }
}

.custom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.charge-btn {
  margin-top: 20px;
  width: 220px;
}

.feature {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, #8b5cf6 8%, transparent);

  .f-name {
    font-weight: 600;
    font-size: 14px;
  }

  &.unlocked {
    background: color-mix(in srgb, #10b981 8%, transparent);
  }
}

.notice {
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  border: 1px dashed var(--border-soft);
  color: var(--text-sub);
  font-size: 12px;
}
</style>