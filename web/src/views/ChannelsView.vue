<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import ChannelCard from '@/components/ChannelCard.vue'
import ThemeEditor from '@/components/ThemeEditor.vue'
import SkeletonBox from '@/components/SkeletonBox.vue'
import EmptyBox from '@/components/EmptyBox.vue'
import { PROVIDERS } from '@/constants/providers'
import { MODEL_CATALOG } from '@/constants/catalog'
import { PROMPT_PRESETS } from '@/constants/prompts'
import { per1MTo1k, fmtUsd } from '@/utils/format'
import { API_STYLES, STYLE_DEFAULT_PATH } from '@/constants/apiStyles'
import api from '@/api'

const loading = ref(false)
const channels = ref<any[]>([])
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = ref<any>({})

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com/v1',
  bytedance: 'https://ark.cn-beijing.volces.com/api/v3',
  qq: 'https://api.hunyuan.cloud.tencent.com/v1',
  baidu: 'https://qianfan.baidubce.com/v2',
  microsoft: 'https://your-resource.openai.azure.com/openai/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  supabase: 'https://api.supabase.com/ai/v1',
  cloudflare: 'https://api.cloudflare.com/client/v4/ai',
  minimax: 'https://api.minimax.chat/v1',
  alibabacloud: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  mistralai: 'https://api.mistral.ai/v1',
  kimi: 'https://api.moonshot.cn/v1',
  x: 'https://api.x.ai/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  siliconflow: 'https://api.siliconflow.cn/v1',
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/channels')
    channels.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  // 从模型目录跳转过来的草稿:直接打开新建弹窗并带好提供商/模型/价格
  const draft = sessionStorage.getItem('lapi-draft')
  if (draft) {
    sessionStorage.removeItem('lapi-draft')
    try {
      const d = JSON.parse(draft)
      openCreate()
      form.value.provider = d.provider
      form.value.theme.provider = d.provider
      form.value.theme.icon_svg = d.provider
      form.value.base_url = PROVIDER_BASE_URLS[d.provider] ?? form.value.base_url
      form.value.models = d.model ? [d.model] : []
      if (d.price_in) form.value.price_in = d.price_in
      if (d.price_out) form.value.price_out = d.price_out
      form.value.name = d.model ? `我的 ${PROVIDERS[d.provider]?.name ?? ''} ${d.model}` : ''
    } catch {
      // 草稿解析失败忽略
    }
  }
})

function openCreate() {
  editingId.value = null
  form.value = {
    name: '',
    provider: 'openai',
    base_url: PROVIDER_BASE_URLS.openai,
    api_key: '',
    api_style: 'chat',
    api_path: STYLE_DEFAULT_PATH.chat,
    models: [],
    price_in: 0,
    price_out: 0,
    credit: 0,
    billing_endpoint: '',
    theme: { provider: 'openai', theme_name: '默认', theme_color: '#412991', icon_svg: 'openai' },
    inject_system_preset: '',
    inject_system_enabled: false,
    inject_system_prompt: '',
  }
  dialogVisible.value = true
}

function openEdit(ch: any) {
  editingId.value = ch.id
  form.value = {
    name: ch.name,
    provider: ch.provider || 'openai',
    base_url: ch.base_url,
    api_key: '',
    api_style: ch.api_style || 'chat',
    api_path: ch.api_path || STYLE_DEFAULT_PATH[ch.api_style || 'chat'] || '',
    models: [...ch.models],
    price_in: ch.price_in,
    price_out: ch.price_out,
    credit: ch.credit,
    billing_endpoint: ch.billing_endpoint,
    theme: {
      provider: ch.provider || 'openai',
      theme_name: ch.theme_name,
      theme_color: ch.theme_color,
      icon_svg: ch.icon_svg || ch.provider || 'openai',
    },
    inject_system_preset: '',
    inject_system_enabled: !!ch.inject_system_enabled,
    inject_system_prompt: ch.inject_system_prompt || '',
  }
  dialogVisible.value = true
}

function onStyleChange(style: string) {
  // 只在用户还没改过路径时,自动带出该协议的默认路由
  if (!form.value.api_path || form.value.api_path === STYLE_DEFAULT_PATH.chat) {
    form.value.api_path = STYLE_DEFAULT_PATH[style] || ''
  }
}

function onProviderPick(p: string) {
  const prev = form.value.theme.provider || ''
  form.value.provider = p
  // 只有接口地址还是自动值(或空)时才跟着换,用户改过地址就尊重用户的
  if (!form.value.base_url || form.value.base_url === (PROVIDER_BASE_URLS[prev] ?? '')) {
    form.value.base_url = PROVIDER_BASE_URLS[p] ?? form.value.base_url
  }
}

function applyCatalogModel(m: { id: string; provider: string; input1M: number; output1M: number }) {
  if (!form.value.models.includes(m.id)) form.value.models.push(m.id)
  if (m.input1M > 0) form.value.price_in = per1MTo1k(m.input1M)
  if (m.output1M > 0) form.value.price_out = per1MTo1k(m.output1M)
  if (form.value.provider !== m.provider) {
    form.value.provider = m.provider
    form.value.theme.provider = m.provider
    form.value.theme.icon_svg = m.provider
    onProviderPick(m.provider)
  }
  ElMessage.success(`已导入 ${m.id},价格已按目录自动填好`)
}

function usePromptPreset(id: string) {
  const p = PROMPT_PRESETS.find((x) => x.id === id)
  if (p) {
    form.value.inject_system_prompt = p.system
  }
}

const catalogForProvider = computed(() => MODEL_CATALOG.filter((m) => m.provider === form.value?.provider))

async function save() {
  const f = form.value
  if (!f.name.trim() || !f.base_url.trim()) {
    ElMessage.warning('名称和接口地址必填')
    return
  }
  const payload: any = {
    name: f.name.trim(),
    provider: f.provider,
    base_url: f.base_url.trim(),
    api_style: f.api_style || 'chat',
    api_path: (f.api_path || '').trim(),
    models: f.models,
    price_in: Number(f.price_in),
    price_out: Number(f.price_out),
    credit: Number(f.credit),
    billing_endpoint: f.billing_endpoint.trim(),
    theme_name: f.theme.theme_name,
    theme_color: f.theme.theme_color,
    icon_svg: f.theme.icon_svg,
    inject_system_prompt: f.inject_system_prompt,
    inject_system_enabled: f.inject_system_enabled ? 1 : 0,
  }
  if (f.api_key.trim()) payload.api_key = f.api_key.trim()

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
      <span class="muted">渠道 = 上游供应商。API Key、模型、价格全部在这里录入,不走 .env</span>
    </div>

    <SkeletonBox v-if="loading" type="cards" :count="3" />
    <template v-else>
      <div>
        <el-row v-if="channels.length" :gutter="16">
          <el-col v-for="ch in channels" :key="ch.id" :span="8" :md="12" :xs="24" class="mb16">
            <ChannelCard :channel="ch" @edit="openEdit" @changed="load" />
          </el-col>
        </el-row>
        <EmptyBox v-else title="还没有渠道" desc="点击右上角「添加渠道」,选一个提供商并填上你的密钥,先跑通第一个供应商" />
      </div>
    </template>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑渠道' : '添加渠道'" width="640px" top="6vh">
      <el-form :model="form" label-width="96px">
        <el-form-item label="提供商">
          <ThemeEditor v-model="form.theme" @pick="onProviderPick" />
          <div class="muted mt4">选提供商自动带出官方接口地址;也可以改地址指向别的模型服务</div>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="渠道显示名,如 我的 DeepSeek" />
        </el-form-item>
        <el-form-item label="接口地址">
          <el-input v-model="form.base_url" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item label="API 协议">
          <el-select v-model="form.api_style" style="width: 100%" @change="onStyleChange">
            <el-option v-for="s in API_STYLES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
          <div class="muted mt4">{{ API_STYLES.find((s) => s.value === form.api_style)?.desc }}</div>
        </el-form-item>
        <el-form-item label="路由路径">
          <el-input v-model="form.api_path" :placeholder="STYLE_DEFAULT_PATH[form.api_style] || '自定义路径,相对接口地址'" />
          <div class="muted mt4">最终请求: {接口地址}/{路由路径}.Responses/Claude 协议会由中转自动转换</div>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.api_key" :placeholder="editingId ? '留空保持不变' : '粘贴你在这个供应商申请的密钥'" show-password />
        </el-form-item>
        <el-form-item label="模型">
          <div class="models-wrap">
            <el-select
              v-model="form.models"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="从下方模型库导入,或直接输入模型名回车"
              style="width: 100%"
            >
              <el-option v-for="m in catalogForProvider" :key="m.id" :label="`${m.id}  (入$${fmtUsd(m.input1M, 3)}/出$${fmtUsd(m.output1M, 3)}/M)`" :value="m.id" />
            </el-select>
            <div class="catalog-strip">
              <span class="muted">模型库快选:</span>
              <el-tag
                v-for="m in catalogForProvider.slice(0, 8)"
                :key="m.id"
                class="clickable"
                type="info"
                effect="plain"
                @click="applyCatalogModel(m)"
              >{{ m.id }}</el-tag>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="单价(/k)">
          <div class="price-row">
            <el-input-number v-model="form.price_in" :controls="false" :precision="6" placeholder="输入价" />
            <span>入</span>
            <el-input-number v-model="form.price_out" :controls="false" :precision="6" placeholder="输出价" />
            <span>出</span>
            <span class="muted">导入模型库会自动填</span>
          </div>
        </el-form-item>
        <el-form-item label="额度">
          <el-input-number v-model="form.credit" :controls="false" placeholder="用于本地估算余额" />
        </el-form-item>
        <el-form-item label="查余额接口">
          <el-input v-model="form.billing_endpoint" placeholder="留空自动拼 /dashboard/billing/credit_grants" />
        </el-form-item>
        <el-form-item label="系统提示">
          <div class="prompt-wrap">
            <div class="prompt-row">
              <el-select v-model="form.inject_system_preset" placeholder="内置提示词(可选)" style="width: 180px" @change="usePromptPreset">
                <el-option v-for="p in PROMPT_PRESETS" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
              <el-switch v-model="form.inject_system_enabled" />
              <span class="muted">{{ form.inject_system_enabled ? '开启注入(请求缺 system 时补上)' : '关闭(请求 100% 原样透传)' }}</span>
            </div>
            <el-input v-model="form.inject_system_prompt" type="textarea" :rows="3" placeholder="要注入的系统提示词,可编辑" />
          </div>
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

.mt4 {
  margin-top: 4px;
}

.models-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.catalog-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  .clickable {
    cursor: pointer;

    &:hover {
      border-color: var(--brand);
      color: var(--brand);
    }
  }
}

.price-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.prompt-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>