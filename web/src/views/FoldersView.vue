<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus'
import Sparkles from '@/components/Sparkles.vue'
import type { FolderRow } from '@/lib/types'

const router = useRouter()
const folders = ref<FolderRow[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const newName = ref('')
const creating = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api<{ folders: FolderRow[]; total: number }>('/folders')
    folders.value = res.folders
    total.value = res.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function create() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  try {
    await api('/folders', { method: 'POST', body: JSON.stringify({ name }) })
    newName.value = ''
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    creating.value = false
  }
}

onMounted(load)
useRefreshOnFocus(load)
</script>

<template>
  <main class="page">
    <Sparkles
      :spots="[
        { pos: { top: '52px', left: '58px' }, size: 14, color: '#ffc23d', delay: 0 },
        { pos: { top: '44px', left: '92px' }, size: 9, color: '#c98bff', delay: 1 },
        { pos: { top: '74px', left: '40px' }, size: 10, color: '#b6f04a', delay: 1.9 },
      ]"
    />

    <button class="ghost back" @click="router.push('/')">← прогресс</button>
    <h1>темы</h1>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <template v-else>
      <ul class="themes">
        <li>
          <router-link to="/words" class="theme allwords">
            <span class="ic">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
                <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
                <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
                <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
              </svg>
            </span>
            <span class="tname disp">все слова</span>
            <span class="tmeta mono">{{ total }}</span>
          </router-link>
        </li>
        <li v-for="f in folders" :key="f.id">
          <router-link :to="`/folders/${f.id}`" class="theme">
            <span class="tname disp">{{ f.name }}</span>
            <span class="tmeta mono">{{ f.word_count }}</span>
          </router-link>
        </li>
      </ul>
      <p v-if="!folders.length" class="muted">других тем пока нет</p>

      <form class="new-theme" @submit.prevent="create">
        <input v-model="newName" placeholder="новая тема…" />
        <button :disabled="creating || !newName.trim()" aria-label="добавить тему">＋</button>
      </form>
    </template>
  </main>
</template>

<style scoped>
.back {
  margin: 0 0 0.75rem;
}

.themes {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.theme {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  background: var(--card);
  border-radius: var(--r-lg);
  padding: 0.9rem 1rem;
}
.theme:hover {
  filter: brightness(1.1);
}
.theme.allwords {
  background: linear-gradient(160deg, var(--sapphire-a), var(--sapphire-b));
  color: #0c1230;
}
.theme.allwords .tname,
.theme.allwords .tmeta {
  color: #0c1230;
}
.theme.allwords .tmeta {
  opacity: 0.65;
}
.ic {
  flex: none;
  display: flex;
  color: #0c1230;
}
.tname {
  flex: 1;
  min-width: 0;
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--fg);
}
.tmeta {
  flex: none;
  font-weight: 500;
  font-size: 0.8rem;
  color: var(--faint);
}

.new-theme {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.new-theme input {
  border-style: dashed;
  background: var(--card-2);
}
.new-theme button {
  flex: none;
  padding: 0 1.1rem;
  font-size: 1.1rem;
}
</style>
