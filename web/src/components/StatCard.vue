<script setup lang="ts">
import { computed } from 'vue'
import { TransitionPresets, useTransition } from '@vueuse/core'
import { Icon } from '@iconify/vue'

const props = withDefaults(
  defineProps<{
    title: string
    value: number
    suffix?: string
    icon: string
    color?: string
    hint?: string
    digits?: number
  }>(),
  { suffix: '', color: '#10b981', hint: '', digits: 0 },
)

const animated = useTransition(computed(() => props.value), {
  duration: 900,
  transition: TransitionPresets.easeOutExpo,
})

const text = computed(() => animated.value.toFixed(props.digits) + props.suffix)
</script>

<template>
  <div class="stat-card" :style="{ '--accent': color }">
    <div class="stat-icon">
      <el-icon :size="26"><Icon :icon="icon" /></el-icon>
    </div>
    <div class="stat-body">
      <div class="stat-title">{{ title }}</div>
      <div class="stat-value">{{ text }}</div>
      <div v-if="hint" class="stat-hint">{{ hint }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: $radius-md;
  background: var(--card-bg);
  border: 1px solid var(--border-soft);
  @include hover-lift;
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #3b82f6));
}

.stat-title {
  color: var(--text-sub);
  font-size: 13px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 2px;
}

.stat-hint {
  font-size: 12px;
  color: var(--text-faint);
}
</style>