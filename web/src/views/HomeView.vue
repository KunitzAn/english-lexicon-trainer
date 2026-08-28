<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { auth, logout } from '@/auth'

type Health = { ok: boolean; db_ok: boolean; db_error?: string; time: string }
type WhoAmI = { userId: number }

const router = useRouter()
const health = ref<Health | null>(null)
const whoami = ref<WhoAmI | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    health.value = await api<Health>('/health')
    whoami.value = await api<WhoAmI>('/whoami')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

async function onLogout() {
  await logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <main class="home">
    <div class="row">
      <h1>English Lexicon Trainer</h1>
      <button class="link" @click="onLogout">выйти</button>
    </div>
    <p class="muted">
      Этап 1 — авторизация.
      <span v-if="auth.user">
        Вошли как <strong>{{ auth.user.name ?? auth.user.telegram_id }}</strong>
        <span v-if="auth.user.is_owner"> (владелец)</span>
      </span>
    </p>

    <section class="card">
      <h2>Проверка бэкенда</h2>
      <p v-if="error" class="err">{{ error }}</p>
      <template v-else>
        <p v-if="health">
          Neon:
          <strong :class="{ err: !health.db_ok }">
            {{ health.db_ok ? 'ок' : 'нет связи' }}
          </strong>
        </p>
        <p v-if="whoami">Защищённый роут /api/whoami: <strong>userId {{ whoami.userId }}</strong></p>
        <p v-if="health" class="muted small">{{ health.time }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
.link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
}
</style>
