<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import SkeletonBox from '@/components/SkeletonBox.vue'
import EmptyBox from '@/components/EmptyBox.vue'
import api from '@/api'

const loading = ref(false)
const presets = ref<any[]>([])
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = ref<any>({})

const TAG_META: Record<string, { label: string; type: 'danger' | 'warning' | 'primary' | 'info' }> = {
  armor: { label: '破甲专用', type: 'danger' },
  coding: { label: '编码专用', type: 'warning' },
  ultimate: { label: '极致专用', type: 'primary' },
  custom: { label: '自定义', type: 'info' },
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/params')
    presets.value = data
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  editingId.value = null
  form.value = blank()
  dialogVisible.value = true
}

function openEdit(p: any) {
  editingId.value = p.id
  form.value = {
    name: p.name,
    tag: p.tag || 'custom',
    note: p.note || '',
    system: p.system || '',
    params: { ...p.params },
  }
  dialogVisible.value = true
}

function blank() {
  return {
    name: '',
    tag: 'custom',
    note: '',
    system: '',
    params: { temperature: 0.7, top_p: 1, top_k: 0, frequency_penalty: 0, presence_penalty: 0, max_tokens: 0, reasoning_effort: '', response_format: '', stop: [] },
  }
}

function normParam(v: unknown): unknown {
  if (typeof v === 'number' && !Number.isFinite(v)) return 0
  if (v === null || v === undefined || v === '') return null
  if (Array.isArray(v)) return v.filter(Boolean)
  return v
}

// 提交前把空值清掉,只保留真正要覆盖的参数
function buildParams() {
  const p: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(form.value.params)) {
    const n = normParam(v)
    if (n !== null && !(Array.isArray(n) && n.length === 0)) p[k] = n
  }
  return p
}

async function save() {
  if (!form.value.name.trim()) {
    ElMessage.warning('填个模板名')
    return
  }
  const payload = {
    name: form.value.name.trim(),
    tag: form.value.tag,
    note: form.value.note,
    system: form.value.system,
    params: buildParams(),
  }
  if (editingId.value) {
    await api.patch(`/admin/params/${editingId.value}`, payload)
    ElMessage.success('已保存')
  } else {
    await api.post('/admin/params', payload)
    ElMessage.success('模板已创建')
  }
  dialogVisible.value = false
  load()
}

async function remove(p: any) {
  await ElMessageBox.confirm(`删除模板「${p.name}」?引用它的分组会自动回落到不覆盖参数`, '删除模板', { type: 'warning' })
  await api.delete(`/admin/params/${p.id}`)
  ElMessage.success('已删除')
  load()
}

function paramChips(params: Record<string, unknown>) {
  return Object.entries(params || {}).filter(([, v]) => v !== undefined)
}

function fmtParam(k: string, v: unknown): string {
  if (Array.isArray(v)) return `${k}=[${v.join(',')}]`
  return `${k}=${String(v)}`
}

// 模板应用到请求时,请求没显式给出的采样/结构/进阶参数都会用它补齐
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">
        <el-icon class="mr8"><Icon icon="mdi:plus" /></el-icon>新建模板
      </el-button>
      <span class="muted">参数模板 = 一组采样/结构化/进阶设置。在分组里绑定后,该分组密钥的请求未显式给出的参数自动用模板补齐</span>
    </div>

    <SkeletonBox v-if="loading" type="cards" :count="3" />
    <template v-else>
      <el-row v-if="presets.length" :gutter="16">
        <el-col v-for="p in presets" :key="p.id" :span="8" :md="12" :xs="24" class="mb16">
          <div class="card preset-card">
          <div class="head">
            <span class="name">{{ p.name }}</span>
            <el-tag :type="TAG_META[p.tag]?.type || 'info'" effect="dark" size="small">{{ TAG_META[p.tag]?.label || p.tag }}</el-tag>
          </div>
          <div class="chips">
            <el-tag v-for="[k, v] in paramChips(p.params)" :key="k" size="small" effect="plain" class="chip">{{ fmtParam(k, v) }}</el-tag>
            <span v-if="!paramChips(p.params).length" class="muted">无参数覆盖</span>
          </div>
          <div v-if="p.system" class="system mono">{{ p.system }}</div>
          <div v-if="p.note" class="note muted">{{ p.note }}</div>
          <div class="actions">
            <el-button size="small" type="primary" plain @click="openEdit(p)">
              <el-icon class="mr8"><Icon icon="mdi:pencil-outline" /></el-icon>编辑
            </el-button>
            <el-button size="small" type="danger" plain @click="remove(p)">
              <el-icon class="mr8"><Icon icon="mdi:trash-can-outline" /></el-icon>删除
            </el-button>
          </div>
        </div>
      </el-col>
      </el-row>
      <EmptyBox v-if="!presets.length" title="还没有参数模板" desc="点右上角「新建模板」,配置采样/结构化/进阶参数,再在分组里绑定" />
    </template>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑参数模板' : '新建参数模板'" width="620px" top="5vh">
      <el-form :model="form" label-width="108px">
        <el-row :gutter="12">
          <el-col :span="14">
            <el-form-item label="模板名">
              <el-input v-model="form.name" placeholder="如:极致专用" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="分类">
              <el-select v-model="form.tag" style="width: 100%">
                <el-option v-for="(m, k) in TAG_META" :key="k" :label="m.label" :value="k" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">采样参数(控制随机性与创造性)</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="temperature">
              <el-slider v-model="form.params.temperature" :min="0" :max="2" :step="0.1" show-input :show-input-controls="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="top_p">
              <el-slider v-model="form.params.top_p" :min="0" :max="1" :step="0.05" show-input :show-input-controls="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="top_k">
              <el-input-number v-model="form.params.top_k" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="seed">
              <el-input-number v-model="form.params.seed" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">结构化参数(约束输出格式)</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="response_format">
              <el-select v-model="form.params.response_format" clearable placeholder="不约束" style="width: 100%">
                <el-option label="json_object" value="json_object" />
                <el-option label="json_schema" value="json_schema" />
                <el-option label="text" value="text" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="reasoning">
              <el-select v-model="form.params.reasoning_effort" clearable placeholder="默认" style="width: 100%">
                <el-option label="low" value="low" />
                <el-option label="medium" value="medium" />
                <el-option label="high" value="high" />
                <el-option label="none" value="none" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="stop">
              <el-select v-model="form.params.stop" multiple filterable allow-create default-first-option placeholder="停止序列(可选)" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">进阶参数(生成长度与频率)</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="max_tokens">
              <el-input-number v-model="form.params.max_tokens" :min="0" :step="512" :max="131072" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="frequency_penalty">
              <el-slider v-model="form.params.frequency_penalty" :min="0" :max="2" :step="0.1" show-input :show-input-controls="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="presence_penalty">
              <el-slider v-model="form.params.presence_penalty" :min="0" :max="2" :step="0.1" show-input :show-input-controls="false" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="section-title">附带系统提示词(可选,请求无 system 时注入)</div>
        <el-form-item label="system">
          <el-input v-model="form.system" type="textarea" :rows="3" placeholder="可选,留空不注入" />
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
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.mb16 {
  margin-bottom: 16px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .chip {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.system {
  font-size: 12px;
  color: var(--text-main);
  background: var(--app-bg);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 8px 10px;
  max-height: 60px;
  overflow: auto;
  word-break: break-all;
}

.note {
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
}

.section-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-sub);
  margin: 6px 0 12px;
  padding-left: 8px;
  border-left: 3px solid var(--brand);
}
</style>