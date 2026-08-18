<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { PROVIDERS } from '@/constants/providers'
import api from '@/api'

const props = defineProps<{ channel: any }>()
const emit = defineEmits<{ (e: 'changed'): void; (e: 'edit', channel: any): void }>()

const testing = ref(false)

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

async function toggle() {
  try {
    await api.patch(`/admin/channels/${props.channel.id}`, { enabled: props.channel.enabled ? 0 : 1 })
    props.channel.enabled = props.channel.enabled ? 0 : 1
    emit('changed')
  } catch {
    // 拦截器已提示
  }
}

async function test() {
  testing.value = true
  try {
    const { data } = await api.post(`/admin/channels/${props.channel.id}/test`)
    if (data.ok) ElMessage.success(`${props.channel.name} 正常,延迟 ${data.latencyMs} ms`)
    else ElMessage.error(`${props.channel.name} 不可用:${data.error || 'HTTP ' + data.status}`)
  } catch {
    // 拦截器已提示
  } finally {
    testing.value = false
  }
}

async function remove() {
  await ElMessageBox.confirm(`确定删除渠道 ${props.channel.name}?历史用量会保留`, '删除渠道', { type: 'warning' })
  await api.delete(`/admin/channels/${props.channel.id}`)
  ElMessage.success('已删除')
  emit('changed')
}
</script>

<template>
  <div class="chan-card card">
    <div class="topbar" :style="{ background: `linear-gradient(90deg, ${channel.theme_color}, transparent)` }"></div>
<div class="head">
        <div class="icon-badge" :style="{ background: channel.theme_color + '22', color: channel.theme_color }">
          <span v-if="PROVIDERS[channel.provider]" class="prov-logo" :style="{ color: PROVIDERS[channel.provider].color }" v-html="PROVIDERS[channel.provider].svg"></span>
          <el-icon v-else :size="22"><Icon :icon="channel.icon_svg || 'mdi:server-network'" /></el-icon>
        </div>
      <div class="name-wrap">
        <div class="name">{{ channel.name }}
          <el-tag v-if="channel.balance?.source === 'live'" size="small" type="success" effect="plain">实时余额</el-tag>
          <el-tag v-else size="small" type="warning" effect="plain">估算余额</el-tag>
        </div>
        <div class="tags">
          <el-tag v-for="m in channel.models.slice(0, 4)" :key="m" size="small" type="info" effect="plain" class="tag">{{ m }}</el-tag>
        </div>
      </div>
      <el-switch :model-value="channel.enabled === 1" @change="toggle" />
    </div>
    <div class="meta mono">
      <div class="meta-row"><span class="k">地址</span><span class="v">{{ channel.base_url }}</span></div>
      <div class="meta-row"><span class="k">密钥</span><span class="v">{{ channel.api_key_masked }}</span></div>
      <div class="meta-row"><span class="k">计费</span><span class="v">入 {{ channel.price_in }}/kToken · 出 {{ channel.price_out }}/kToken</span></div>
      <div class="meta-row"><span class="k">余额</span><span class="v">{{ fmt(channel.balance?.amount ?? 0) }} <span class="muted">(额度 {{ fmt(channel.credit) }})</span></span></div>
    </div>
    <div class="actions">
      <el-button size="small" :loading="testing" @click="test">
        <el-icon class="mr8"><Icon icon="mdi:access-point" /></el-icon>延迟测试
      </el-button>
      <el-button size="small" type="primary" plain @click="emit('edit', channel)">
        <el-icon class="mr8"><Icon icon="mdi:pencil-outline" /></el-icon>编辑
      </el-button>
      <el-button size="small" type="danger" plain @click="remove">
        <el-icon class="mr8"><Icon icon="mdi:trash-can-outline" /></el-icon>删除
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chan-card {
  position: relative;
  overflow: hidden;
  @include hover-lift;
}

.topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-badge {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prov-logo {
  width: 26px;
  height: 26px;
  display: inline-flex;

  :deep(svg) {
    width: 26px;
    height: 26px;
  }
}

.name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.meta {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-row {
  display: flex;
  gap: 8px;
  font-size: 12px;

  .k {
    color: var(--text-faint);
    width: 34px;
    min-width: 34px;
  }

  .v {
    word-break: break-all;
  }
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
</style>