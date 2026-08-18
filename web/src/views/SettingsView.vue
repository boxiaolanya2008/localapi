<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { PROMPT_PRESETS } from '@/constants/prompts'
import api from '@/api'

const loading = ref(true)
const info = ref<any>(null)
const priceIn = ref('')
const priceOut = ref('')

const groups = ref<any[]>([])
const armorForm = ref({ prompt: '', enabled: true, force: true })
const armorGroup = computed(
  () => groups.value.find((g) => g.inject_system === 1) ?? groups.value.find((g) => g.name === '破甲') ?? null,
)

async function load() {
  loading.value = true
  try {
    const [s, g] = await Promise.all([api.get('/admin/settings'), api.get('/admin/groups')])
    info.value = s.data
    priceIn.value = s.data.defaults.priceIn
    priceOut.value = s.data.defaults.priceOut
    groups.value = g.data
    const ag = g.data.find((x: any) => x.inject_system === 1) ?? g.data.find((x: any) => x.name === '破甲')
    if (ag) {
      armorForm.value = { prompt: ag.system_prompt || '', enabled: !!ag.inject_system, force: !!ag.force_obey }
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

function useArmorPreset(id: string) {
  const p = PROMPT_PRESETS.find((x) => x.id === id)
  if (p) armorForm.value.prompt = p.system
}

async function saveArmor() {
  const g = armorGroup.value
  if (!g) {
    ElMessage.warning('没有可配置的注入分组,请先在分组管理创建一个并开启提示词注入')
    return
  }
  await api.patch(`/admin/groups/${g.id}`, {
    system_prompt: armorForm.value.prompt,
    inject_system: armorForm.value.enabled ? 1 : 0,
    force_obey: armorForm.value.force ? 1 : 0,
  })
  ElMessage.success(`已保存到分组「${g.name}」,该分组密钥的请求立即生效`)
}

async function saveDefaults() {
  await api.patch('/admin/settings', { price_in: Number(priceIn.value), price_out: Number(priceOut.value) })
  ElMessage.success('默认单价已保存,新建渠道时生效')
}

const env = () => info.value?.env ?? {}
const modelMapEntries = computed(() => Object.entries(info.value?.env?.modelMap ?? {}))
const armorPresetId = ref('')
</script>

<template>
  <div v-loading="loading" class="page">
    <el-row :gutter="16">
      <el-col :span="12" :xs="24">
        <div class="card">
          <div class="card-title"><el-icon class="mr8"><Icon icon="mdi:information-outline" /></el-icon>运行环境</div>
          <div class="kv">
            <div class="kv-row"><span class="k">监听地址</span><span class="v mono">{{ env().host }}:{{ env().port }}</span></div>
            <div class="kv-row"><span class="k">管理令牌</span>
              <span class="v"><el-tag size="small" :type="env().adminToken === 'set' ? 'success' : 'danger'" effect="plain">{{ env().adminToken === 'set' ? '已配置' : '未配置' }}</el-tag></span>
            </div>
            <div class="kv-row"><span class="k">数据目录</span><span class="v mono">{{ env().dataDir }}</span></div>
            <div class="kv-row"><span class="k">模型映射</span>
              <span class="v">
                <template v-if="modelMapEntries.length">
                  <el-tag v-for="[k, v] in modelMapEntries" :key="k" size="small" effect="plain" class="mr8">{{ k }} → {{ v }}</el-tag>
                </template>
                <span v-else class="muted">无,原样转发</span>
              </span>
            </div>
          </div>
        </div>

        <div class="card mt16">
          <div class="card-title"><el-icon class="mr8"><Icon icon="mdi:shield-alert-outline" /></el-icon>破解提示词(破甲组)</div>
          <p class="muted">只保留一个提示词注入的破解分组。该分组密钥的请求会自动注入下面的 system 提示词(请求自带 system 消息时不注入);开启「强制遵守」会在提示词末尾追加最高优先级指令。</p>
          <div class="prompt-row">
            <el-select v-model="armorPresetId" placeholder="内置提示词(可选)" style="width: 180px" @change="useArmorPreset">
              <el-option v-for="p in PROMPT_PRESETS" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <el-switch v-model="armorForm.enabled" active-text="开启注入" />
            <el-switch v-model="armorForm.force" active-text="强制遵守" />
          </div>
          <el-input v-model="armorForm.prompt" type="textarea" :rows="5" class="mt16" placeholder="自定义破解提示词,模型必须遵守" />
          <div class="mt16">
            <el-button type="primary" @click="saveArmor">保存破解提示词</el-button>
            <span v-if="armorGroup" class="muted ml">生效分组:{{ armorGroup.name }} ×{{ armorGroup.multiplier }}</span>
          </div>
        </div>

        <div class="card mt16">
          <div class="card-title"><el-icon class="mr8"><Icon icon="mdi:currency-cny" /></el-icon>默认单价</div>
          <p class="muted">此处设新建渠道时的默认单价;已有渠道在「渠道管理」里单独改</p>
          <div class="price-row">
            <span>输入 ¥</span>
            <el-input-number v-model="priceIn" :controls="false" :precision="6" :step="0.0001" />
            <span>/千 token</span>
            <span class="ml">输出 ¥</span>
            <el-input-number v-model="priceOut" :controls="false" :precision="6" :step="0.0001" />
            <span>/千 token</span>
          </div>
          <el-button type="primary" class="mt16" @click="saveDefaults">保存默认单价</el-button>
        </div>
      </el-col>

      <el-col :span="12" :xs="24">
        <div class="card">
          <div class="card-title"><el-icon class="mr8"><Icon icon="mdi:server-outline" /></el-icon>中转接口</div>
          <p class="muted">把 CLI 工具指到下面这个地址,用管理台里创建的密钥认证</p>
          <div class="endpoint mono">http://127.0.0.1:{{ env().port }}/v1</div>
          <div class="api-list">
            <div class="api-item mono">POST /v1/chat/completions</div>
            <div class="api-item mono">POST /v1/completions</div>
            <div class="api-item mono">POST /v1/embeddings</div>
            <div class="api-item mono">GET  /v1/models</div>
          </div>
          <p class="muted">均支持 stream 流式;鉴权头 <span class="mono">Authorization: Bearer sk-lapi-xxx</span></p>
        </div>

        <div class="card mt16">
          <div class="card-title"><el-icon class="mr8"><Icon icon="mdi:information-outline" /></el-icon>关于</div>
          <div class="kv">
            <div class="kv-row"><span class="k">版本</span><span class="v mono">{{ info?.version }}</span></div>
            <div class="kv-row"><span class="k">许可证</span><span class="v">GPL-3.0</span></div>
            <div class="kv-row"><span class="k">技术栈</span><span class="v">Node 内置 node:sqlite · Express · Vue 3 · Element Plus · ECharts</span></div>
          </div>
          <p class="muted mt16">本地工具,默认只监听 127.0.0.1。余额为「上游实时查询失败时按 额度-累计消耗 估算」。</p>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.card-title {
  display: flex;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
}

.kv {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kv-row {
  display: flex;
  gap: 12px;
  font-size: 13px;

  .k {
    color: var(--text-faint);
    width: 80px;
    min-width: 80px;
  }
}

.endpoint {
  padding: 12px;
  border-radius: 8px;
  background: var(--app-bg);
  border: 1px dashed var(--border-soft);
  margin: 8px 0 14px;
}

.api-list {
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.api-item {
  padding: 8px 12px;
  font-size: 12px;

  &:not(:last-child) {
    border-bottom: 1px solid var(--border-soft);
  }
}

.price-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}

.ml {
  margin-left: 8px;
}

.mt16 {
  margin-top: 16px;
}

.prompt-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.ml {
  margin-left: 10px;
}
</style>