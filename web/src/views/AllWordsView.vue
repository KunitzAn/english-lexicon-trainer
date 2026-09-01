<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus'
import type { FolderRow, WordListItem } from '@/lib/types'

const router = useRouter()

/** Самоцветные акценты по кругу — рамки строк словаря. */
const ACCENTS = ['#22d9b3', '#b6f04a', '#ffc23d', '#8fa8ff', '#c98bff', '#ff6ba6']

const words = ref<WordListItem[]>([])
const folders = ref<FolderRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const selected = reactive<Set<number>>(new Set())
const bulkFolderId = ref<number | null>(null)
const busy = ref(false)
const notice = ref<string | null>(null)

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const [w, f] = await Promise.all([
      api<{ words: WordListItem[] }>('/words'),
      api<{ folders: FolderRow[] }>('/folders'),
    ])
    words.value = w.words
    folders.value = f.folders
    if (!bulkFolderId.value && f.folders[0]) bulkFolderId.value = f.folders[0].id
  } catch (e) {
    if (!silent) error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const allSelected = computed(
  () => words.value.length > 0 && selected.size === words.value.length,
)

function toggleAll() {
  if (allSelected.value) selected.clear()
  else for (const w of words.value) selected.add(w.id)
}

function toggle(id: number) {
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
}

function folderNames(ids: number[] | undefined): string {
  if (!ids || !ids.length) return 'без темы'
  return folders.value
    .filter((f) => ids.includes(f.id))
    .map((f) => f.name)
    .join(', ')
}

async function bulk(op: 'add' | 'remove') {
  if (!selected.size || !bulkFolderId.value) return
  busy.value = true
  notice.value = null
  error.value = null
  try {
    const res = await api<{ updated: number }>('/words/bulk-folders', {
      method: 'POST',
      body: JSON.stringify({
        word_ids: [...selected],
        folder_id: bulkFolderId.value,
        op,
      }),
    })
    const name = folders.value.find((f) => f.id === bulkFolderId.value)?.name ?? ''
    notice.value = `${op === 'add' ? 'добавлено в' : 'убрано из'} «${name}»: ${res.updated}`
    selected.clear()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

onMounted(() => load())
useRefreshOnFocus(() => {
  if (!selected.size && !busy.value) load(true)
})
</script>

<template>
  <main class="page">
    <button class="ghost back" @click="router.push('/folders')">← темы</button>
    <div class="row head">
      <h1>все слова</h1>
      <button class="ghost" @click="router.push('/words/add')">＋ слово</button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="notice" class="muted small">{{ notice }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <template v-else>
      <div v-if="words.length" class="bulkbar">
        <label class="opt">
          <input type="checkbox" :checked="allSelected" @change="toggleAll" />
          выбрать все
        </label>
        <template v-if="selected.size">
          <span class="muted small">выбрано {{ selected.size }}</span>
          <select v-model.number="bulkFolderId">
            <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
          <button :disabled="busy || !bulkFolderId" @click="bulk('add')">＋ в тему</button>
          <button :disabled="busy || !bulkFolderId" @click="bulk('remove')">－ из темы</button>
        </template>
      </div>

      <ul class="words">
        <li
          v-for="(w, i) in words"
          :key="w.id"
          class="wrow"
          :style="{ '--accent': ACCENTS[i % ACCENTS.length] }"
        >
          <input
            type="checkbox"
            class="wcheck"
            :checked="selected.has(w.id)"
            @change="toggle(w.id)"
          />
          <router-link :to="`/words/${w.id}`" class="wbody">
            <div class="wmain">
              <span class="wtext mono">{{ w.text }}</span>
              <span class="wtr">{{ w.translations.join(', ') }}</span>
            </div>
            <div class="wmeta">{{ folderNames(w.folder_ids) }}</div>
          </router-link>
        </li>
        <li v-if="!words.length" class="muted">словарь пуст</li>
      </ul>
    </template>
  </main>
</template>

<style scoped>
.back {
  margin: 0 0 0.75rem;
}
.head {
  align-items: center;
  margin-bottom: 0.5rem;
}
.bulkbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0;
  padding: 0.6rem 0.75rem;
  background: var(--card);
  border-radius: 0.5rem;
}
.bulkbar select {
  flex: 1 1 auto;
  min-width: 10rem;
  padding: 0.4rem 0.5rem;
  background: #0d0f13;
  border: 1px solid #2a2e39;
  border-radius: 0.4rem;
  color: var(--fg);
  font: inherit;
}

.words {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.wrow {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}
.wcheck {
  align-self: center;
  width: 20px;
  height: 20px;
  accent-color: var(--accent);
}
.wbody {
  flex: 1;
  min-width: 0;
  padding: 0.8rem 1rem;
  background: var(--card);
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  border-left: 4px solid var(--accent);
  border-radius: var(--r-lg);
  color: var(--fg);
}
.wbody:hover {
  background: color-mix(in srgb, var(--accent) 9%, var(--card));
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  border-left-color: var(--accent);
  color: var(--fg);
}
.wmain {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}
.wtext {
  font-weight: 700;
  color: color-mix(in srgb, var(--accent) 50%, var(--fg));
}
.wtr {
  color: var(--muted);
}
.wmeta {
  color: var(--faint);
  font-size: 0.78rem;
  margin-top: 0.2rem;
}
</style>
