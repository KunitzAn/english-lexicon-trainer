<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import Sparkles from '@/components/Sparkles.vue'
import type { FolderRow } from '@/lib/types'

const router = useRouter()
const folders = ref<FolderRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const newName = ref('')
const creating = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api<{ folders: FolderRow[] }>('/folders')
    folders.value = res.folders
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

    <h1>темы</h1>

    <div class="frame cta-frame">
      <button class="primary cta" @click="router.push('/train')">
        тренировка
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7-11-7Z" fill="currentColor" />
        </svg>
      </button>
    </div>
    <div class="all-link">
      <button class="ghost" @click="router.push('/words')">все слова →</button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <template v-else>
      <ul class="themes">
        <li v-for="f in folders" :key="f.id">
          <router-link :to="`/folders/${f.id}`" class="theme">
            <span class="tname disp">{{ f.name }}</span>
            <span class="tmeta mono">{{ f.word_count }}</span>
          </router-link>
        </li>
      </ul>
      <p v-if="!folders.length" class="muted">пока пусто — заведите первую тему</p>

      <form class="new-theme" @submit.prevent="create">
        <input v-model="newName" placeholder="новая тема…" />
        <button :disabled="creating || !newName.trim()" aria-label="добавить тему">＋</button>
      </form>
    </template>
  </main>
</template>

<style scoped>
.cta-frame {
  margin-top: 0.5rem;
}
.cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.95rem;
  font-size: 1.05rem;
}
.all-link {
  text-align: center;
  margin: 0.75rem 0 1.5rem;
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
