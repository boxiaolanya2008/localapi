<script setup lang="ts">
withDefaults(defineProps<{ type?: 'cards' | 'table' | 'list' | 'detail'; count?: number }>(), { type: 'cards', count: 3 })
</script>

<template>
  <div class="sk-wrap" :class="type">
    <!-- 卡片骨架 -->
    <template v-if="type === 'cards'">
      <div v-for="i in count" :key="i" class="card sk-card">
        <div class="sk" style="width: 42%; height: 20px"></div>
        <div class="sk" style="width: 100%; height: 14px; margin-top: 14px"></div>
        <div class="sk" style="width: 72%; height: 14px; margin-top: 8px"></div>
        <div class="sk" style="width: 52%; height: 14px; margin-top: 8px"></div>
        <div class="sk" style="width: 34%; height: 32px; margin-top: 16px"></div>
      </div>
    </template>
    <!-- 表格骨架 -->
    <template v-else-if="type === 'table'">
      <div class="card" style="padding: 8px">
        <div v-for="i in count" :key="i" class="sk" style="height: 44px; margin: 8px"></div>
      </div>
    </template>
    <!-- 列表骨架 -->
    <template v-else-if="type === 'list'">
      <div class="card" style="padding: 8px 16px">
        <div v-for="i in count" :key="i" class="sk" style="height: 42px; margin: 10px 0"></div>
      </div>
    </template>
    <!-- 详情/仪表盘骨架 -->
    <template v-else>
      <div class="card">
        <div class="sk" style="height: 22px; width: 30%"></div>
        <div class="sk" style="height: 14px; margin-top: 16px"></div>
        <div class="sk" style="height: 14px; margin-top: 8px; width: 82%"></div>
        <div class="sk" style="height: 14px; margin-top: 8px; width: 60%"></div>
        <div class="sk" style="height: 130px; margin-top: 18px; border-radius: 12px"></div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.sk-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sk-wrap.cards {
  flex-direction: row;
  flex-wrap: wrap;
}

.sk-wrap.cards .card {
  width: calc((100% - 32px) / 3);
}

.sk-card {
  padding: 18px;
  min-height: 160px;
}
</style>