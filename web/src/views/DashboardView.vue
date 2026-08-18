<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useDark } from '@vueuse/core'
import { fmtBig } from '@/utils/format'
import StatCard from '@/components/StatCard.vue'
import SkeletonBox from '@/components/SkeletonBox.vue'
import api from '@/api'

use([CanvasRenderer, LineChart, PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent])

const isDark = useDark()
const chartTheme = computed(() => (isDark.value ? 'dark' : 'default'))

const PALETTE = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

const loading = ref(true)
const stats = ref<any>(null)

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/stats')
    stats.value = data
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

onMounted(load)

function fmt(n: number, digits = 2): string {
  return (Number.isFinite(n) ? n : 0).toFixed(digits)
}

const totalTokens = computed(() => stats.value?.total.tokens ?? 0)
const totalCost = computed(() => (stats.value?.total.cost ?? 0))
const balance = computed(() =>
  (stats.value?.channels ?? []).reduce((s: number, c: any) => s + (c.balance?.amount ?? 0), 0),
)

const cards = computed(() => [
  { title: '今日 Token', value: stats.value?.today.tokens ?? 0, icon: 'mdi:lightning-bolt-outline', color: '#10b981', hint: `累计 ${fmt(totalTokens.value, 0)}` },
  { title: '今日请求', value: stats.value?.today.requests ?? 0, icon: 'mdi:send-check-outline', color: '#3b82f6', hint: `累计 ${fmt(stats.value?.total.requests ?? 0, 0)} 次` },
  { title: '总消耗', value: totalCost.value, digits: 4, icon: 'mdi:currency-cny', color: '#f59e0b', hint: '按单价折算' },
  { title: '当前余额', value: balance.value, digits: 2, icon: 'mdi:wallet-outline', color: '#8b5cf6', hint: '实时/估算混合' },
])

const lineOption = computed<any>(() => {
  const series = stats.value?.series ?? []
  const days = series.map((s: any) => s.date)
  const tokens = series.map((s: any) => s.tokens)
  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) => fmtBig(Number(v ?? 0)) + ' tokens',
    },
    grid: { left: 56, right: 16, top: 30, bottom: 28 },
    xAxis: { type: 'category', data: days, boundaryGap: false },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => fmtBig(v) },
    },
    series: [
      {
        name: 'Token',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: tokens,
        lineStyle: { width: 2.5, color: '#10b981' },
        itemStyle: { color: '#10b981' },
        areaStyle: { opacity: 0.15 },
      },
    ],
  }
})

const pieOption = computed<any>(() => {
  const data = (stats.value?.byChannel ?? []).map((c: any) => ({ name: c.channel_name, value: c.tokens }))
  return {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', right: 6, top: 'center' },
    color: PALETTE,
    series: [
      {
        name: '渠道',
        type: 'pie',
        radius: ['42%', '70%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 600 } },
        data,
      },
    ],
  }
})

const barOption = computed<any>(() => {
  const data = (stats.value?.byModel ?? []).slice(0, 8).reverse()
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 10, right: 40, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.map((m: any) => m.model) },
    series: [
      {
        name: 'Token',
        type: 'bar',
        data: data.map((m: any) => m.tokens),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0], color: '#3b82f6' },
      },
    ],
  }
})
</script>

<template>
  <div class="page">
    <SkeletonBox v-if="loading" type="detail" />
    <template v-else>
    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.title" :span="6" :xs="12">
        <div class="mb16">
          <StatCard v-bind="card" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14" :xs="24">
        <div class="card chart-card">
          <div class="card-title">7 日 Token 用量</div>
          <VChart class="chart" :option="lineOption" :theme="chartTheme" autoresize />
        </div>
      </el-col>
      <el-col :span="10" :xs="24">
        <div class="card chart-card">
          <div class="card-title">渠道占比</div>
          <VChart class="chart" :option="pieOption" :theme="chartTheme" autoresize />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt16 eq-cards">
      <el-col :span="12" :xs="24">
        <div class="card chart-card">
          <div class="card-title">模型用量 TOP</div>
          <VChart class="chart" :option="barOption" :theme="chartTheme" autoresize />
        </div>
      </el-col>
      <el-col :span="6" :xs="24">
        <div class="card">
          <div class="card-title">分组消费</div>
          <div v-if="!stats?.byGroup?.length" class="muted">暂无数据</div>
          <div v-for="g in stats?.byGroup" :key="g.group_name" class="chan-row">
            <span class="dot" style="background: #f59e0b"></span>
            <span class="chan-name">{{ g.group_name || '未知' }}</span>
            <span class="muted">{{ g.requests }} 次</span>
            <span class="chan-balance mono">{{ fmt(g.cost) }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="6" :xs="24">
        <div class="card">
          <div class="card-title">渠道余额</div>
          <div v-if="!stats?.channels?.length" class="muted">暂无渠道,去渠道管理添加</div>
          <div v-for="c in stats?.channels" :key="c.id" class="chan-row">
            <span class="dot" :style="{ background: c.theme_color }"></span>
            <span class="chan-name">{{ c.name }}</span>
            <el-tag size="small" :type="c.balance?.source === 'live' ? 'success' : 'warning'" effect="plain">
              {{ c.balance?.source === 'live' ? '实时' : '估算' }}
            </el-tag>
            <span class="chan-balance mono">{{ fmt(c.balance?.amount ?? 0) }}</span>
          </div>
        </div>
      </el-col>
    </el-row>
    </template>
  </div>
</template>

<style scoped lang="scss">
.mb16 {
  margin-bottom: 16px;
}

.mt16 {
  margin-top: 16px;
}

// 三张卡片等高:行内 col 拉伸,卡片占满
.eq-cards {
  .el-col {
    display: flex;
  }

  .card {
    width: 100%;
  }
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.chart {
  height: 300px;
}

.chan-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border-soft);

  &:last-child {
    border-bottom: none;
  }
}

.dot {
  width: 10px;
  height: 10px;
  min-width: 10px;
  border-radius: 50%;
}

.chan-name {
  flex: 1;
  font-size: 14px;
}

.chan-balance {
  font-weight: 600;
}
</style>