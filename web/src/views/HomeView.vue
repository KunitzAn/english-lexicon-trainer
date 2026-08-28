<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'

type Health = {
  ok: boolean
  db_ok: boolean
  db_error?: string
  time: string
}

const health = ref<Health | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    health.value = await api<Health>('/health')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <main class="home">
    <h1>English Lexicon Trainer</h1>
    <p class="muted">Этап 0 — каркас</p>

    <section class="card">
      <h2>Проверка бэкенда</h2>
      <p v-if="error" class="err">Ошибка запроса: {{ error }}</p>
      <template v-else-if="health">
        <p>API: <strong>{{ health.ok ? 'ок' : '—' }}</strong></p>
        <p>
          Neon:
          <strong :class="{ err: !health.db_ok }">
            {{ health.db_ok ? 'ок' : 'нет связи' }}
          </strong>
        </p>
        <p v-if="health.db_error" class="err small">{{ health.db_error }}</p>
        <p class="muted small">{{ health.time }}</p>
      </template>
      <p v-else class="muted">загрузка…</p>
    </section>
  </main>
</template>
