<script setup lang="ts">
import { PROVIDERS } from '@/constants/providers'

// v-model 对象结构: { provider, theme_name, theme_color, icon_svg }
const theme = defineModel<any>({ required: true })
const emit = defineEmits<{ (e: 'pick', provider: string): void }>()

const providerKeys = Object.keys(PROVIDERS)

function pick(p: string) {
  theme.value.provider = p
  theme.value.icon_svg = p
  theme.value.theme_color = PROVIDERS[p]?.color || '#10b981'
  emit('pick', p)
}
</script>

<template>
  <div class="theme-editor">
    <div class="block">
      <div class="label">提供商</div>
      <div class="logos">
        <button
          v-for="p in providerKeys"
          :key="p"
          type="button"
          class="logo-btn"
          :class="{ active: theme.icon_svg === p }"
          :title="PROVIDERS[p].name"
          :style="{ color: PROVIDERS[p].color }"
          @click="pick(p)"
          v-html="PROVIDERS[p].svg"
        ></button>
      </div>
      <div class="muted">{{ PROVIDERS[theme.icon_svg]?.name || '自定义' }}</div>
    </div>
    <div class="row">
      <span class="label">主题色</span>
      <el-color-picker v-model="theme.theme_color" />
      <span class="muted ml">主题名</span>
      <el-select v-model="theme.theme_name" style="width: 120px">
        <el-option label="默认" value="默认" />
        <el-option label="极光" value="极光" />
        <el-option label="霓虹" value="霓虹" />
        <el-option label="森林" value="森林" />
        <el-option label="海洋" value="海洋" />
      </el-select>
    </div>
  </div>
</template>

<style scoped lang="scss">
.theme-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  color: var(--text-sub);
  font-size: 13px;
}

.logos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.logo-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 2px solid var(--border-soft);
  background: var(--card-bg);
  cursor: pointer;
  padding: 0;
  font-size: 26px;
  transition: all 0.2s ease;

  :deep(svg) {
    width: 26px;
    height: 26px;
  }

  &.active {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 25%, transparent);
  }

  &:hover {
    transform: translateY(-2px);
  }
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ml {
  margin-left: 8px;
}

.muted {
  font-size: 12px;
  color: var(--text-faint);
}
</style>