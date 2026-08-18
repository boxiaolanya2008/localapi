<script setup lang="ts">
import { Icon } from '@iconify/vue'

const theme = defineModel<any>({ required: true })

const iconOptions = [
  'mdi:server-network',
  'mdi:cloud-outline',
  'mdi:chip',
  'mdi:robot-outline',
  'mdi:cube-outline',
  'mdi:lightning-bolt-outline',
  'mdi:database-outline',
  'mdi:web',
]
</script>

<template>
  <div class="theme-editor">
    <div class="row">
      <span class="label">主题色</span>
      <el-color-picker v-model="theme.theme_color" />
    </div>
    <div class="row">
      <span class="label">主题名</span>
      <el-select v-model="theme.theme_name" style="width: 160px">
        <el-option label="默认" value="默认" />
        <el-option label="极光" value="极光" />
        <el-option label="霓虹" value="霓虹" />
        <el-option label="森林" value="森林" />
        <el-option label="海洋" value="海洋" />
      </el-select>
    </div>
    <div class="row">
      <span class="label">图标</span>
      <div class="icons">
        <button
          v-for="ic in iconOptions"
          :key="ic"
          type="button"
          class="icon-btn"
          :class="{ active: theme.icon_svg === ic }"
          @click="theme.icon_svg = ic"
        >
          <Icon :icon="ic" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.theme-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  width: 56px;
  color: var(--text-sub);
  font-size: 13px;
}

.icons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 18px;

  &.active {
    border-color: var(--brand);
    color: var(--brand);
    background: color-mix(in srgb, var(--brand) 12%, transparent);
  }
}
</style>