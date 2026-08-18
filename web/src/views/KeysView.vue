<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import api from '@/api'

const loading = ref(false)
const keys = ref<any[]>([])
const groups = ref<any[]>([])
const dialogVisible = ref(false)
const resultVisible = ref(false)
const createdKey = ref<any>(null)
const form = ref({ name: '', note: '', groupId: 1 })

async function load() {
  loading.value = true
  try {
    const [k, g] = await Promise.all([api.get('/admin/keys'), api.get('/admin/groups')])
    keys.value = k.data
    groups.value = g.data
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  form.value = { name: '', note: '', groupId: 1 }
  dialogVisible.value = true
}

async function create() {
  if (!form.value.name.trim()) {
    ElMessage.warning('填个名字')
    return
  }
  const { data } = await api.post('/admin/keys', {
    name: form.value.name.trim(),
    note: form.value.note,
    groupId: Number(form.value.groupId),
  })
  createdKey.value = data
  dialogVisible.value = false
  resultVisible.value = true
  load()
}

async function changeGroup(row: any) {
  await api.patch(`/admin/keys/${row.id}`, { groupId: row.group_id })
  row.group_name = groups.value.find((g) => g.id === row.group_id)?.name ?? row.group_name
}

async function toggle(row: any) {
  await api.patch(`/admin/keys/${row.id}`, { status: row.status ? 0 : 1 })
  row.status = row.status ? 0 : 1
}

async function remove(row: any) {
  await ElMessageBox.confirm(`确定删除密钥 ${row.name}?使用该密钥的历史记录仍保留`, '删除密钥', { type: 'warning' })
  await api.delete(`/admin/keys/${row.id}`)
  ElMessage.success('已删除')
  load()
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    ElMessage.success('已复制')
  }
}

function mask(k: string): string {
  if (k.length <= 14) return k.slice(0, 8) + '****'
  return k.slice(0, 14) + '****' + k.slice(-6)
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">
        <el-icon class="mr8"><Icon icon="mdi:plus" /></el-icon>新建密钥
      </el-button>
      <span class="muted">密钥开放给 CLI 工具使用,形如 sk-lapi-xxx</span>
    </div>

    <div class="card table-card">
      <el-table v-loading="loading" :data="keys" stripe>
        <el-table-column prop="name" label="名称" width="140" />
        <el-table-column label="分组" width="140">
          <template #default="{ row }">
            <el-select v-model="row.group_id" size="small" style="width: 118px" @change="changeGroup(row)">
              <el-option v-for="g in groups" :key="g.id" :label="g.name + (g.multiplier !== 1 ? ' ×' + g.multiplier : '')" :value="g.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="密钥" min-width="300">
          <template #default="{ row }">
            <span class="mono">{{ mask(row.key) }}</span>
            <el-button link type="primary" @click="copy(row.key)">复制</el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 1" @change="toggle(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="request_count" label="请求数" width="90" align="right" />
        <el-table-column label="Token 用量" width="130" align="right">
          <template #default="{ row }">
            {{ (row.total_prompt_tokens + row.total_completion_tokens).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ dayjs(row.created_at).format('YYYY-MM-DD HH:mm') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新建密钥" width="420px">
      <el-form :model="form" label-width="60px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如：本机 CLI" />
        </el-form-item>
        <el-form-item label="分组">
          <el-select v-model="form.groupId" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name + (g.multiplier === 0 ? '(免费破甲)' : g.multiplier !== 1 ? ' ×' + g.multiplier : '(原价)')" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="create">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resultVisible" title="密钥已创建" width="520px">
      <el-alert type="success" :closable="false" show-icon title="请立即复制保存,后续不再完整展示" />
      <div class="key-box mono">{{ createdKey?.key }}</div>
      <template #footer>
        <el-button type="primary" @click="copy(createdKey?.key ?? '')">复制密钥</el-button>
        <el-button @click="resultVisible = false">关闭</el-button>
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

.table-card {
  padding: 8px;
}

.key-box {
  margin-top: 14px;
  padding: 14px;
  border-radius: 8px;
  background: var(--app-bg);
  border: 1px dashed var(--border-soft);
  word-break: break-all;
  user-select: all;
}
</style>