<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { PROVIDERS } from '@/constants/providers'
import { MODEL_CATALOG } from '@/constants/catalog'
import { fmtUsd } from '@/utils/format'

const router = useRouter()
const q = ref('')
const onlyProvider = ref('')
const providerKeys = Object.keys(PROVIDERS)

const list = computed(() =>
  MODEL_CATALOG.filter(
    (m) =>
      (!q.value || m.id.toLowerCase().includes(q.value.toLowerCase()) || m.name.toLowerCase().includes(q.value.toLowerCase())) &&
      (!onlyProvider.value || m.provider === onlyProvider.value),
  ),
)

function goAdd(m: { id: string; provider: string; input1M: number; output1M: number }) {
  sessionStorage.setItem(
    'lapi-draft',
    JSON.stringify({ provider: m.provider, model: m.id, price_in: m.input1M / 1000, price_out: m.output1M / 1000 }),
  )
  router.push('/channels')
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-input v-model="q" placeholder="搜模型名 / ID" clearable style="width: 220px">
        <template #prefix><el-icon><Icon icon="mdi:magnify" /></el-icon></template>
      </el-input>
      <el-select v-model="onlyProvider" placeholder="按提供商筛选" clearable style="width: 180px">
        <el-option v-for="p in providerKeys" :key="p" :label="PROVIDERS[p].name" :value="p" />
      </el-select>
      <span class="muted">价格单位:$ / 1M tokens。绿标=官方页已联网核实;灰标=参考价,以实际账单为准</span>
    </div>

    <div class="card table-card">
      <el-table :data="list" stripe>
        <el-table-column label="提供商" width="130">
          <template #default="{ row }">
            <span class="prov" :style="{ color: PROVIDERS[row.provider]?.color }" v-html="PROVIDERS[row.provider]?.svg"></span>
          </template>
        </el-table-column>
        <el-table-column label="模型" width="200">
          <template #default="{ row }">
            <div class="mid">{{ row.name }}</div>
            <div class="mono muted">{{ row.id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="输入 $/1M" align="right" width="110">
          <template #default="{ row }">{{ fmtUsd(row.input1M, 3) }}</template>
        </el-table-column>
        <el-table-column label="输出 $/1M" align="right" width="110">
          <template #default="{ row }">{{ fmtUsd(row.output1M, 3) }}</template>
        </el-table-column>
        <el-table-column label="缓存命中 $/1M" align="right" width="130">
          <template #default="{ row }">{{ row.cacheRead1M !== null ? fmtUsd(row.cacheRead1M, 4) : '未单列' }}</template>
        </el-table-column>
        <el-table-column prop="context" label="上下文" width="80" align="center" />
        <el-table-column label="来源" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.source === 'official' ? 'success' : 'info'" effect="plain">
              {{ row.source === 'official' ? '已核实' : '参考' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="goAdd(row)">
              <el-icon class="mr8"><Icon icon="mdi:plus" /></el-icon>添加为渠道
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.table-card {
  padding: 8px;
}

.prov {
  width: 26px;
  height: 26px;
  display: inline-flex;

  :deep(svg) {
    width: 26px;
    height: 26px;
  }
}

.mid {
  font-weight: 600;
  font-size: 13px;
}
</style>