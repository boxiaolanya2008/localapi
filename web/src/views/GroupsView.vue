<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import api from '@/api'

const loading = ref(false)
const groups = ref<any[]>([])
const usageMap = ref<Record<string, { tokens: number; requests: number; cost: number }>>({})

async function load() {
  loading.value = true
  try {
    const [g, s] = await Promise.all([api.get('/admin/groups'), api.get('/admin/stats')])
    groups.value = g.data
    usageMap.value = {}
    for (const u of s.data.byGroup ?? []) usageMap.value[u.group_name] = u
  } finally {
    loading.value = false
  }
}

onMounted(load)

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = ref<any>({})

function openCreate() {
  editingId.value = null
  form.value = { name: '', multiplier: 1, model_limit: [], note: '' }
  dialogVisible.value = true
}

function openEdit(g: any) {
  editingId.value = g.id
  form.value = {
    name: g.name,
    multiplier: g.multiplier,
    model_limit: g.model_limit ? [...g.model_limit] : [],
    note: g.note,
  }
  dialogVisible.value = true
}

async function save() {
  if (!form.value.name.trim()) {
    ElMessage.warning('填个分组名')
    return
  }
  const payload = {
    name: form.value.name.trim(),
    multiplier: Number(form.value.multiplier),
    model_limit: form.value.model_limit,
    note: form.value.note,
  }
  if (editingId.value) {
    await api.patch(`/admin/groups/${editingId.value}`, payload)
    ElMessage.success('已保存')
  } else {
    await api.post('/admin/groups', payload)
    ElMessage.success('分组已创建')
  }
  dialogVisible.value = false
  load()
}

async function remove(g: any) {
  if (g.id === 1) {
    ElMessage.warning('默认分组不可删除')
    return
  }
  await ElMessageBox.confirm(`删除分组「${g.name}」?其下的密钥会回到默认分组`, '删除分组', { type: 'warning' })
  await api.delete(`/admin/groups/${g.id}`)
  ElMessage.success('已删除')
  load()
}

function multLabel(m: number): string {
  if (m === 0) return '免费(破甲)'
  if (m < 1) return `官方 ${(m * 100).toFixed(0)}%`
  if (m === 1) return '官方原价'
  return `官方 ${m} 倍`
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">
        <el-icon class="mr8"><Icon icon="mdi:plus" /></el-icon>新建分组
      </el-button>
      <span class="muted">分组定义计费倍率。倍率 0 = 免费;小于 1 = 比官方便宜;密钥创建时归属某个分组</span>
    </div>

    <el-row v-loading="loading" :gutter="16">
      <el-col v-for="g in groups" :key="g.id" :span="8" :md="8" :xs="24" class="mb16">
        <div class="card group-card">
          <div class="head">
            <span class="name">{{ g.name }}</span>
            <el-tag :type="g.multiplier === 0 ? 'danger' : g.multiplier < 1 ? 'success' : 'info'" effect="dark">
              {{ multLabel(g.multiplier) }}
            </el-tag>
          </div>
          <div class="mult">
            <span class="label">计费倍率</span>
            <span class="value mono">{{ g.multiplier }}</span>
          </div>
          <div class="limits">
            <template v-if="g.model_limit && g.model_limit.length">
              <el-tag v-for="m in g.model_limit.slice(0, 6)" :key="m" size="small" type="warning" effect="plain" class="tag">{{ m }}</el-tag>
            </template>
            <span v-else class="muted">不限模型</span>
          </div>
          <div v-if="usageMap[g.name]" class="usage">
            <span>请求 {{ usageMap[g.name].requests }}</span>
            <span>Token {{ usageMap[g.name].tokens.toLocaleString() }}</span>
            <span>消费 {{ Number(usageMap[g.name].cost).toFixed(4) }}</span>
          </div>
          <div v-else class="usage muted">暂无用量</div>
          <div class="actions">
            <el-button size="small" type="primary" plain @click="openEdit(g)">
              <el-icon class="mr8"><Icon icon="mdi:pencil-outline" /></el-icon>编辑
            </el-button>
            <el-button size="small" type="danger" plain @click="remove(g)">
              <el-icon class="mr8"><Icon icon="mdi:trash-can-outline" /></el-icon>删除
            </el-button>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑分组' : '新建分组'" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="分组名">
          <el-input v-model="form.name" placeholder="如:内部测试" />
        </el-form-item>
        <el-form-item label="计费倍率">
          <div class="mult-row">
            <el-input-number v-model="form.multiplier" :min="0" :max="100" :step="0.1" :precision="2" />
            <span class="muted">0 = 免费破甲,0.5 = 半价,1 = 原价</span>
          </div>
        </el-form-item>
        <el-form-item label="模型限制">
          <el-select
            v-model="form.model_limit"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="留空=不限模型;可输入任意模型名"
            style="width: 100%"
          >
            <el-option v-for="m in form.model_limit" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.mb16 {
  margin-bottom: 16px;
}

.group-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  @include hover-lift;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.name {
  font-weight: 600;
  font-size: 15px;
}

.mult {
  display: flex;
  align-items: baseline;
  gap: 8px;

  .label {
    color: var(--text-faint);
    font-size: 12px;
  }

  .value {
    font-size: 22px;
    font-weight: 700;
  }
}

.limits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  .tag {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.usage {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--text-sub);
  border-top: 1px dashed var(--border-soft);
  padding-top: 10px;
}

.actions {
  display: flex;
  gap: 8px;
}

.mult-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>