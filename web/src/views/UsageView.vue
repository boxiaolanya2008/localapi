<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
const cacheStats = ref<any>(null)

function hitRatio(cacheHit: number, promptTokens: number): string {
  if (!cacheHit || !promptTokens) return '-'
  return `${cacheHit} (${((cacheHit / promptTokens) * 100).toFixed(0)}%)`
}

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
    cacheStats.value = s.data
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
    <div class="card filter-card">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        style="width: 240px"
      />
      <el-select v-model="keyId" placeholder="按密钥" clearable style="width: 160px">
        <el-option v-for="k in keys" :key="k.id" :label="k.name" :value="k.id" />
      </el-select>
      <el-select v-model="channelId" placeholder="按渠道" clearable style="width: 160px">
        <el-option v-for="c in channels" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-button type="primary" @click="page = 1; load()">
        <el-icon class="mr8"><Icon icon="mdi:magnify" /></el-icon>查询
      </el-button>
      <el-button @click="reset">重置</el-button>
      <el-button @click="exportCsv">
        <el-icon class="mr8"><Icon icon="mdi:download-outline" /></el-icon>导出 CSV
      </el-button>
      <el-tag v-if="cacheStats?.total?.cache_hit" type="success" effect="plain" class="cache-chip">
        累计缓存命中 {{ ((cacheStats.total.cache_hit / cacheStats.total.tokens) * 100).toFixed(1) }}% ({{ cacheStats.total.cache_hit.toLocaleString() }} tokens)
      </el-tag>
      <el-tag v-if="cacheStats?.today?.cache_hit" type="success" effect="plain" class="cache-chip">
        今日缓存命中 {{ ((cacheStats.today.cache_hit / cacheStats.today.tokens) * 100).toFixed(1) }}%
      </el-tag>
    </div>

    <div class="card table-card">
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ dayjs(row.ts).format('MM-DD HH:mm:ss') }}</template>
        </el-table-column>
        <el-table-column prop="channel_name" label="渠道" width="110" />
        <el-table-column prop="model" label="模型" width="140" />
        <el-table-column prop="key_name" label="密钥" width="100" />
        <el-table-column prop="prompt_tokens" label="输入" width="80" align="right" />
        <el-table-column label="缓存命中" width="120" align="right">
          <template #default="{ row }">
            <span class="mono">{{ hitRatio(row.cached_tokens, row.prompt_tokens) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="completion_tokens" label="输出" width="80" align="right" />
        <el-table-column prop="total_tokens" label="合计" width="80" align="right" />
        <el-table-column label="费用" width="90" align="right">
          <template #default="{ row }">{{ Number(row.cost).toFixed(4) }}</template>
        </el-table-column>
        <el-table-column prop="latency_ms" label="耗时(ms)" width="90" align="right" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 0 ? 'success' : 'danger'" effect="plain">
              {{ row.status === 0 ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="request_id" label="request_id" min-width="220">
          <template #default="{ row }"><span class="mono">{{ row.request_id }}</span></template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          layout="total, prev, pager, next"
          :total="total"
          :page-size="size"
          :current-page="page"
          @current-change="onPage"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.filter-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px;
}

.cache-chip {
  margin-left: auto;
}

.table-card {
  padding: 8px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 14px 8px 4px;
}
</style>