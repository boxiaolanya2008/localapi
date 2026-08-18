<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import ChannelCard from '@/components/ChannelCard.vue'
import ThemeEditor from '@/components/ThemeEditor.vue'
import api from '@/api'

const loading = ref(false)
const channels = ref<any[]>([])
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = ref<any>({})

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/channels')
    channels.value = data
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  editingId.value = null
  form.value = {
    name: '',
    base_url: '',
    api_key: '',
    models: [],
    price_in: 0,
    price_out: 0,
    credit: 0,
    billing_endpoint: '',
    theme: { theme_name: '默认', theme_color: '#10b981', icon_svg: 'mdi:server-network' },
  }
  dialogVisible.value = true
}

function openEdit(ch: any) {
  editingId.value = ch.id
  form.value = {
    name: ch.name,
    base_url: ch.base_url,
    api_key: '',
    models: [...ch.models],
    price_in: ch.price_in,
    price_out: ch.price_out,
    credit: ch.credit,
    billing_endpoint: ch.billing_endpoint,
    theme: { theme_name: ch.theme_name, theme_color: ch.theme_color, icon_svg: ch.icon_svg },
  }
  dialogVisible.value = true
}

async function save() {
  const payload: any = {
    name: form.value.name,
    base_url: form.value.base_url,
    models: Array.isArray(form.value.models) ? form.value.models : form.value.models.split(','),
    price_in: Number(form.value.price_in),
    price_out: Number(form.value.price_out),
    credit: Number(form.value.credit),
    billing_endpoint: form.value.billing_endpoint,
    theme_name: form.value.theme.theme_name,
    theme_color: form.value.theme.theme_color,
    icon_svg: form.value.theme.icon_svg,
  }
  if (form.value.api_key.trim()) payload.api_key = form.value.api_key.trim()

  if (editingId.value) {
    await api.patch(`/admin/channels/${editingId.value}`, payload)
    ElMessage.success('已保存')
  } else {
    await api.post('/admin/channels', payload)
    ElMessage.success('渠道已添加')
  }
  dialogVisible.value = false
  load()
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">
        <el-icon class="mr8"><Icon icon="mdi:plus" /></el-icon>添加渠道
      </el-button>
      <span class="muted">渠道 = 上游供应商。主题色与图标会在管理台各处展示</span>
    </div>

    <div v-loading="loading">
      <el-row v-if="channels.length" :gutter="16">
        <el-col v-for="ch in channels" :key="ch.id" :span="8" :md="12" :xs="24" class="mb16">
          <ChannelCard :channel="ch" @edit="openEdit" @changed="load" />
        </el-col>
      </el-row>
      <el-empty v-else description="还没有渠道,点右上角添加" />
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑渠道' : '添加渠道'" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="渠道显示名,如 deepseek" />
        </el-form-item>
        <el-form-item label="接口地址">
          <el-input v-model="form.base_url" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item label="上游密钥">
          <el-input v-model="form.api_key" :placeholder="editingId ? '留空保持不变' : 'sk-...'" show-password />
        </el-form-item>
        <el-form-item label="模型列表">
          <el-select v-model="form.models" multiple filterable allow-create default-first-option placeholder="逗号或回车输入模型名" style="width: 100%">
            <el-option v-for="m in form.models" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="单价(/k)">
          <div class="price-row">
            <el-input-number v-model="form.price_in" :controls="false" placeholder="输入价" />
            <span class="muted">输入</span>
            <el-input-number v-model="form.price_out" :controls="false" placeholder="输出价" />
            <span class="muted">输出</span>
          </div>
        </el-form-item>
        <el-form-item label="额度">
          <el-input-number v-model="form.credit" :controls="false" placeholder="估算余额的初始额度" />
        </el-form-item>
        <el-form-item label="查余额接口">
          <el-input v-model="form.billing_endpoint" placeholder="留空自动拼 /dashboard/billing/credit_grants" />
        </el-form-item>
        <el-form-item label="主题">
          <ThemeEditor v-model="form.theme" />
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

.price-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>