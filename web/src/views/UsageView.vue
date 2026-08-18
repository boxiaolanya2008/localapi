<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import api from '@/api'

const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const dateRange = ref<string[]>([])
const keyId = ref('')
const channelId = ref<number>()
const keys = ref<any[]>([])
const channels = ref<any[]>([])
const stats = ref<any>(null)

async function load() {
  loading.value = true
  try {
    const params: Record<string, unknown> = { page: page.value, size: size.value }
    if (dateRange.value?.length === 2) {
      params.from = dayjs(dateRange.value[0]).startOf('day').valueOf()
      params.to = dayjs(dateRange.value[1]).endOf('day').valueOf()
    }
    if (keyId.value) params.keyId = keyId.value
    if (channelId.value) params.channelId = channelId.value
    const [u, s] = await Promise.all([api.get('/admin/usage', { params }), api.get('/admin/stats')])
    rows.value = u.data.rows
    total.value = u.data.total
    stats.value = s.data
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  load()
  const [k, c] = await Promise.all([api.get('/admin/keys'), api.get('/admin/channels')])
  keys.value = k.data
  channels.value = c.data
})

function quickRange(days: number) {
  const end = dayjs()
  const start = dayjs().subtract(days - 1, 'day')
  dateRange.value = [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  page.value = 1
  load()
}

function reset() {
  page.value = 1
  dateRange.value = []
  keyId.value = ''
  channelId.value = undefined
  load()
}

function onPage(p: number) {
  page.value = p
  load()
}

function hitRatio(cached: number, prompt: number): number {
  return prompt > 0 ? Math.min(100, (cached / prompt) * 100) : 0
}

function hitLabel(cached: number, prompt: number): string {
  if (!cached || !prompt) return '-'
  return `${cached} (${hitRatio(cached, prompt).toFixed(0)}%)`
}

const summary = computed(() => {
  const t = stats.value?.total ?? {}
  const today = stats.value?.today ?? {}
  const ratio = t.tokens ? ((t.cache_hit ?? 0) / t.tokens) * 100 : 0
  return {
    todayRequests: today.requests ?? 0,
    todayTokens: today.tokens ?? 0,
    cacheRatio: ratio,
    cacheTokens: t.cache_hit ?? 0,
    totalCost: t.cost ?? 0,
  }
})

async function exportCsv() {
  const params: Record<string, unknown> = {}
  if (dateRange.value?.length === 2) {
    params.from = dayjs(dateRange.value[0]).startOf('day').valueOf()
    params.to = dayjs(dateRange.value[1]).endOf('day').valueOf()
  }
  if (keyId.value) params.keyId = keyId.value
  if (channelId.value) params.channelId = channelId.value
  const { data } = await api.get('/admin/usage/export', { params, responseType: 'blob' })
  const url = URL.createObjectURL(data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `usage-${dayjs().format('YYYYMMDD-HHmm')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="page">
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon green"><el-icon :size="20"><Icon icon="mdi:send-check-outline" /></el-icon></div>
          <div><div class="mini-label">今日请求</div><div class="mini-value">{{ summary.todayRequests }}</div></div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon blue"><el-icon :size="20"><Icon icon="mdi:lightning-bolt-outline" /></el-icon></div>
          <div><div class="mini-label">今日 Token</div><div class="mini-value">{{ summary.todayTokens.toLocaleString() }}</div></div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon purple"><el-icon :size="20"><Icon icon="mdi:cached" /></el-icon></div>
          <div><div class="mini-label">累计缓存命中</div><div class="mini-value">{{ summary.cacheRatio.toFixed(1) }}% <span class="mini-sub">{{ summary.cacheTokens.toLocaleString() }} tokens</span></div></div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon orange"><el-icon :size="20"><Icon icon="mdi:currency-cny" /></el-icon></div>
          <div><div class="mini-label">总费用</div><div class="mini-value">{{ Number(summary.totalCost).toFixed(4) }}</div></div>
        </div>
      </el-col>
    </el-row>

    <div class="card filter-card">
      <el-button-group>
        <el-button size="default" :type="dateRange?.length === 2 && dayjs(dateRange[0]).isSame(dayjs().startOf('day')) ? 'primary' : ''" @click="quickRange(1)">今天</el-button>
        <el-button size="default" :type="dateRange?.length === 2 && dayjs(dateRange[0]).isSame(dayjs().subtract(6, 'day').startOf('day')) ? 'primary' : ''" @click="quickRange(7)">近 7 天</el-button>
        <el-button size="default" :type="dateRange?.length === 2 && dayjs(dateRange[0]).isSame(dayjs().subtract(29, 'day').startOf('day')) ? 'primary' : ''" @click="quickRange(30)">近 30 天</el-button>
      </el-button-group>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        style="width: 240px"
      />
      <el-select v-model="keyId" placeholder="按密钥" clearable style="width: 150px">
        <el-option v-for="k in keys" :key="k.id" :label="k.name" :value="k.id" />
      </el-select>
      <el-select v-model="channelId" placeholder="按渠道" clearable style="width: 150px">
        <el-option v-for="c in channels" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-button type="primary" @click="page = 1; load()">
        <el-icon class="mr8"><Icon icon="mdi:magnify" /></el-icon>查询
      </el-button>
      <el-button @click="reset">重置</el-button>
      <el-button @click="exportCsv">
        <el-icon class="mr8"><Icon icon="mdi:download-outline" /></el-icon>导出 CSV
      </el-button>
    </div>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" stripe class="modern-table">
        <el-table-column label="时间" width="140">
          <template #default="{ row }">
            <div class="t-time">{{ dayjs(row.ts).format('MM-DD HH:mm:ss') }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="channel_name" label="渠道" width="100" />
        <el-table-column prop="model" label="模型" width="140">
          <template #default="{ row }"><span class="t-model mono">{{ row.model }}</span></template>
        </el-table-column>
        <el-table-column prop="key_name" label="密钥" width="96">
          <template #default="{ row }"><span class="t-key">{{ row.key_name }}</span></template>
        </el-table-column>
        <el-table-column prop="prompt_tokens" label="输入" width="72" align="right" />
        <el-table-column label="缓存命中" width="150">
          <template #default="{ row }">
            <div v-if="row.cached_tokens > 0" class="cache-cell">
              <div class="cache-bar"><div class="cache-fill" :style="{ width: hitRatio(row.cached_tokens, row.prompt_tokens) + '%' }"></div></div>
              <span class="cache-text mono">{{ hitLabel(row.cached_tokens, row.prompt_tokens) }}</span>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="completion_tokens" label="输出" width="72" align="right" />
        <el-table-column prop="total_tokens" label="合计" width="76" align="right" />
        <el-table-column label="费用" width="86" align="right">
          <template #default="{ row }"><span class="t-cost mono">{{ Number(row.cost).toFixed(4) }}</span></template>
        </el-table-column>
        <el-table-column prop="latency_ms" label="耗时(ms)" width="82" align="right" />
        <el-table-column label="状态" width="72" align="center">
          <template #default="{ row }">
            <span class="status" :class="row.status === 0 ? 'ok' : 'err'">
              <i class="dot"></i>{{ row.status === 0 ? '成功' : '失败' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="request_id" label="request_id" min-width="200">
          <template #default="{ row }"><span class="mono muted">{{ row.request_id }}</span></template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          layout="total, prev, pager, next"
          :total="total"
          :page-size="size"
          :current-page="page"
          background
          @current-change="onPage"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stats-row {
  margin-bottom: 16px;
}

.mini-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: $radius-md;
  background: var(--card-bg);
  border: 1px solid var(--border-soft);
  @include hover-lift;
}

.mini-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;

  &.green { background: linear-gradient(135deg, #10b981, #34d399); }
  &.blue { background: linear-gradient(135deg, #3b82f6, #60a5fa); }
  &.purple { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }
  &.orange { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
}

.mini-label {
  color: var(--text-faint);
  font-size: 12px;
}

.mini-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.mini-sub {
  font-size: 12px;
  color: var(--text-faint);
  font-weight: 400;
}

.filter-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px;
  border-radius: $radius-md;
}

.table-card {
  padding: 8px;
  border-radius: $radius-md;
  overflow: hidden;
}

.modern-table :deep(.el-table__row) {
  transition: background 0.2s ease;
}

.t-time {
  font-variant-numeric: tabular-nums;
}

.t-model {
  font-size: 12px;
}

.t-key {
  font-size: 12px;
}

.t-cost {
  color: var(--brand);
  font-weight: 600;
}

.cache-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cache-bar {
  width: 52px;
  height: 6px;
  border-radius: 3px;
  background: var(--border-soft);
  overflow: hidden;
  flex-shrink: 0;
}

.cache-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #10b981, #34d399);
  transition: width 0.3s ease;
}

.cache-text {
  font-size: 12px;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
  }

  &.ok {
    color: var(--brand);

    .dot {
      background: var(--brand);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent);
    }
  }

  &.err {
    color: #ef4444;

    .dot {
      background: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18);
    }
  }
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 14px 8px 4px;
}
</style>