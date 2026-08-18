<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
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
const summary = ref<any>(null)
const loadRange = ref('all') // all | today | 7d | 30d | custom

async function setRange(days: number) {
  const end = dayjs()
  const start = dayjs().subtract(days - 1, 'day')
  dateRange.value = [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  loadRange.value = days === 1 ? 'today' : days === 7 ? '7d' : '30d'
  page.value = 1
  load()
}

function onDateChange() {
  loadRange.value = dateRange.value?.length === 2 ? 'custom' : 'all'
  page.value = 1
  load()
}

function params() {
  const p: Record<string, unknown> = {}
  if (dateRange.value?.length === 2) {
    p.from = dayjs(dateRange.value[0]).startOf('day').valueOf()
    p.to = dayjs(dateRange.value[1]).endOf('day').valueOf()
  }
  if (keyId.value) p.keyId = keyId.value
  if (channelId.value) p.channelId = channelId.value
  return p
}

async function load() {
  loading.value = true
  try {
    const base = { page: page.value, size: size.value, ...params() }
    const [u, s] = await Promise.all([api.get('/admin/usage', { params: base }), api.get('/admin/usage/summary', { params: params() })])
    rows.value = u.data.rows
    total.value = u.data.total
    summary.value = s.data
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

watch([keyId, channelId], () => {
  page.value = 1
  load()
})

function reset() {
  page.value = 1
  dateRange.value = []
  keyId.value = ''
  channelId.value = undefined
  loadRange.value = 'all'
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

const rangeLabel = computed(() => {
  switch (loadRange.value) {
    case 'today': return '今日'
    case '7d': return '近 7 天'
    case '30d': return '近 30 天'
    case 'custom': return `自选 ${dateRange.value?.[0]} → ${dateRange.value?.[1]}`
    default: return '全部时间'
  }
})

const statCards = computed(() => {
  const s = summary.value ?? {}
  const ratio = s.tokens ? (s.cache_hit / s.tokens) * 100 : 0
  return {
    requests: s.requests ?? 0,
    tokens: s.tokens ?? 0,
    cacheRatio: ratio,
    cacheTokens: s.cache_hit ?? 0,
    cost: s.cost ?? 0,
  }
})

async function exportCsv() {
  const { data } = await api.get('/admin/usage/export', { params: params(), responseType: 'blob' })
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
    <div class="range-bar">
      <div class="range-chip">{{ rangeLabel }}用量</div>
      <el-button-group>
        <el-button :type="loadRange === 'today' ? 'primary' : ''" @click="setRange(1)">今日</el-button>
        <el-button :type="loadRange === '7d' ? 'primary' : ''" @click="setRange(7)">近 7 天</el-button>
        <el-button :type="loadRange === '30d' ? 'primary' : ''" @click="setRange(30)">近 30 天</el-button>
        <el-button :type="loadRange === 'all' ? 'primary' : ''" @click="reset">全部</el-button>
      </el-button-group>
    </div>

    <el-row :gutter="16" class="stats-row">
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon green"><el-icon :size="20"><Icon icon="mdi:send-check-outline" /></el-icon></div>
          <div><div class="mini-label">请求数</div><div class="mini-value">{{ statCards.requests }}</div></div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon blue"><el-icon :size="20"><Icon icon="mdi:lightning-bolt-outline" /></el-icon></div>
          <div><div class="mini-label">Token 用量</div><div class="mini-value">{{ statCards.tokens.toLocaleString() }}</div></div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon purple"><el-icon :size="20"><Icon icon="mdi:cached" /></el-icon></div>
          <div><div class="mini-label">缓存命中</div><div class="mini-value">{{ statCards.cacheRatio.toFixed(1) }}% <span class="mini-sub">{{ statCards.cacheTokens.toLocaleString() }}</span></div></div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="mini-stat">
          <div class="mini-icon orange"><el-icon :size="20"><Icon icon="mdi:currency-cny" /></el-icon></div>
          <div><div class="mini-label">费用</div><div class="mini-value">{{ Number(statCards.cost).toFixed(4) }}</div></div>
        </div>
      </el-col>
    </el-row>

    <div class="card filter-card">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        style="width: 240px"
        @change="onDateChange"
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
      <el-button @click="exportCsv">
        <el-icon class="mr8"><Icon icon="mdi:download-outline" /></el-icon>导出 CSV
      </el-button>
    </div>

    <div class="card table-card">
      <SkeletonBox v-if="loading" type="table" :count="6" />
      <el-table v-else :data="rows" stripe class="modern-table">
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
.range-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.range-chip {
  padding: 7px 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 14%, transparent);
  color: var(--brand);
  font-weight: 600;
  font-size: 13px;
}

.stats-row {
  margin-bottom: 8px;
}

.mini-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: $radius-md;
  background: var(--card-bg);
  border: 1px solid var(--glass-border);
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

.t-time { font-variant-numeric: tabular-nums; }
.t-model { font-size: 12px; }
.t-key { font-size: 12px; }
.t-cost { color: var(--brand); font-weight: 600; }

.cache-cell { display: flex; align-items: center; gap: 8px; }

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

.cache-text { font-size: 12px; }

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

  &.ok { color: var(--brand); .dot { background: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent); } }
  &.err { color: #ef4444; .dot { background: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18); } }
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 14px 8px 4px;
}
</style>