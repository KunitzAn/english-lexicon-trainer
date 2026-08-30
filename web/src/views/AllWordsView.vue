<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api } from '@/api'
import type { FolderRow, WordListItem } from '@/lib/types'

const words = ref<WordListItem[]>([])
const folders = ref<FolderRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const openWordId = ref<number | null>(null)
const draftFolders = reactive<Set<number>>(new Set())
const savingFolders = ref(false)

async function load() {
  loading.value = true
  try {
    const [w, f] = await Promise.all([
      api<{ words: WordListItem[] }>('/words'),
      api<{ folders: FolderRow[] }>('/folders'),
    ])
    words.value = w.words
    folders.value = f.folders
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function folderNames(ids: number[] | undefined): string {
  if (!ids || !ids.length) return 'без темы'
  return folders.value
    .filter((f) => ids.includes(f.id))
    .map((f) => f.name)
    .join(', ')
}

function toggleEditor(w: WordListItem) {
  if (openWordId.value === w.id) {
    openWordId.value = null
    return
  }
  openWordId.value = w.id
  draftFolders.clear()
  for (const id of w.folder_ids ?? []) draftFolders.add(id)
}

function toggleDraft(id: number) {
  if (draftFolders.has(id)) draftFolders.delete(id)
  else draftFolders.add(id)
}

async function saveFolders(w: WordListItem) {
  savingFolders.value = true
  try {
    const res = await api<{ folder_ids: number[] }>(`/words/${w.id}/folders`, {
      method: 'PUT',
      body: JSON.stringify({ folder_ids: [...draftFolders] }),
    })
    w.folder_ids = res.folder_ids
    openWordId.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    savingFolders.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="page">
    <p><router-link to="/">← темы</router-link></p>
    <div class="row">
      <h1>Все слова</h1>
      <router-link to="/words/add">+ слово</router-link>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <ul v-else class="list">
      <li v-for="w in words" :key="w.id" class="word-row">
        <div class="line">
          <router-link :to="`/words/${w.id}`">{{ w.text }}</router-link>
          <span class="muted">{{ w.translations.join(', ') }}</span>
        </div>
        <div class="line sub">
          <span class="muted small">{{ folderNames(w.folder_ids) }}</span>
          <button class="link" @click="toggleEditor(w)">
            {{ openWordId === w.id ? 'скрыть' : 'темы' }}
          </button>
        </div>
        <div v-if="openWordId === w.id" class="editor">
          <label v-for="f in folders" :key="f.id" class="opt">
            <input
              type="checkbox"
              :checked="draftFolders.has(f.id)"
              @change="toggleDraft(f.id)"
            />
            {{ f.name }}
          </label>
          <p v-if="!folders.length" class="muted small">тем нет — создай на главной</p>
          <button :disabled="savingFolders" @click="saveFolders(w)">сохранить</button>
        </div>
      </li>
      <li v-if="!words.length" class="muted">словарь пуст</li>
    </ul>
  </main>
</template>

<style scoped>
.word-row {
  display: block;
  padding: 0.6rem 0;
  border-bottom: 1px solid #23262e;
}
.line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.line.sub {
  margin-top: 0.2rem;
}
.editor {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--card);
  border-radius: 0.5rem;
}
</style>
