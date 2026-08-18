<script setup lang="ts">
defineProps<{ title: string; desc?: string }>()
</script>

<template>
  <div class="empty-box card">
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ebg1" x1="0" y1="0" x2="120" y2="120">
          <stop offset="0" stop-color="#34d399" />
          <stop offset="1" stop-color="#60a5fa" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill="url(#ebg1)" opacity="0.08" />
      <path d="M28 44h64a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6V50a6 6 0 0 1 6-6z" fill="#fff" opacity="0.85" />
      <path d="M34 44l26 22L86 44" stroke="#34d399" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M92 34l-3 6-6 3 6 3 3 6 3-6 6-3-6-3z" fill="#60a5fa" />
      <path d="M26 92c6-14 30-20 52-12 8 3 14 8 18 12" stroke="#60a5fa" stroke-width="4" stroke-linecap="round" opacity="0.7" />
    </svg>
    <div class="eb-title">{{ title }}</div>
    <div v-if="desc" class="eb-desc">{{ desc }}</div>
    <slot />
  </div>
</template>