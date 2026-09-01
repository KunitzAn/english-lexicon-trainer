<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import type { WordListItem } from '@/lib/types'

const route = useRoute()
const router = useRouter()

const folderId = ref(Number(route.params.id))
const name = ref('')
const words = ref<WordListItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const renaming = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api<{
      folder: { id: number; name: string }
      words: WordListItem[]
    }>(`/folders/${folderId.value}`)
    name.value = res.folder.name
    words.value = res.words
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function rename() {
  const next = prompt('Название темы', name.value)?.trim()
  if (!next || next === name.value) return
  renaming.value = true
  try {
    await api(`/folders/${folderId.value}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: next }),
    })
    name.value = next
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    renaming.value = false
  }
}

async function removeFolder() {
  if (!confirm(`Удалить тему «${name.value}»? Слова останутся.`)) return
  try {
    await api(`/folders/${folderId.value}`, { method: 'DELETE' })
    router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

watch(
  () => route.params.id,
  (v) => {
    folderId.value = Number(v)
    load()
  },
)
onMounted(load)
</script>

<template>
  <main class="page">
    <button class="ghost back" @click="router.push('/')">← темы</button>

    <div class="row head">
      <h1>{{ name || '…' }}</h1>
      <span class="acts">
        <button class="link" :disabled="renaming" @click="rename">переименовать</button>
        <button class="link" @click="removeFolder">удалить</button>
      </span>
    </div>

    <button class="ghost add-btn" @click="router.push(`/words/add?folder=${folderId}`)">
      ＋ слово в эту тему
    </button>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <ul v-else class="rows">
      <li v-for="w in words" :key="w.id">
        <router-link :to="`/words/${w.id}`" class="row-link">
          <span class="w-main">
            <span class="mono">{{ w.text }}</span>
            <span v-if="w.is_phrase" class="muted small"> · фраза</span>
          </span>
          <span class="muted w-tr">{{ w.translations.join(', ') }}</span>
        </router-link>
      </li>
      <li v-if="!words.length" class="muted empty">в теме пока нет слов</li>
    </ul>
  </main>
</template>

<style scoped>
.back {
  margin: 0 0 0.75rem;
}
.head {
  align-items: flex-start;
}
.acts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  flex: none;
}
.add-btn {
  margin: 0.25rem 0 1rem;
}
.rows {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.w-main {
  min-width: 0;
}
.w-tr {
  flex: 1;
  text-align: right;
  min-width: 0;
}
.empty {
  padding: 0.7rem 0;
}
</style>
