<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus'
import { ACCENTS } from '@/lib/palette'
import {
  nextSortMode,
  sortWords,
  WORD_SORT_LABEL,
  type WordSortMode,
} from '@/lib/wordSort'
import type { WordListItem } from '@/lib/types'
import IconPicker from '@/components/IconPicker.vue'

const route = useRoute()
const router = useRouter()

const tzq = () => `tz_offset=${-new Date().getTimezoneOffset()}`

const folderId = ref(Number(route.params.id))
const name = ref('')
const icon = ref<string | null>(null)
const color = ref<string | null>(null)
const words = ref<WordListItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const renaming = ref(false)

const sortMode = ref<WordSortMode>('learned')
const shown = computed(() => sortWords(words.value, sortMode.value))
function cycleSort() {
  sortMode.value = nextSortMode(sortMode.value)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api<{
      folder: { id: number; name: string; icon: string | null; color: string | null }
      words: WordListItem[]
    }>(`/folders/${folderId.value}?${tzq()}`)
    name.value = res.folder.name
    icon.value = res.folder.icon
    color.value = res.folder.color
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

async function saveIcon(next: { icon: string | null; color: string | null }) {
  const prev = { icon: icon.value, color: color.value }
  icon.value = next.icon
  color.value = next.color
  try {
    await api(`/folders/${folderId.value}`, {
      method: 'PATCH',
      body: JSON.stringify(next),
    })
  } catch (e) {
    icon.value = prev.icon
    color.value = prev.color
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function removeFolder() {
  if (!confirm(`Удалить тему «${name.value}»? Слова останутся.`)) return
  try {
    await api(`/folders/${folderId.value}`, { method: 'DELETE' })
    router.push('/folders')
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
useRefreshOnFocus(load)
</script>

<template>
  <main class="page">
    <button class="ghost back" @click="router.push('/folders')">← темы</button>

    <div class="row head">
      <span class="htitle">
        <IconPicker :icon="icon" :color="color" @save="saveIcon" />
        <h1>{{ name || '…' }}</h1>
      </span>
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

    <template v-else>
      <div v-if="words.length" class="sortbar">
        <button class="ghost" @click="cycleSort">⇅ {{ WORD_SORT_LABEL[sortMode] }}</button>
      </div>

      <ul class="rows">
        <li
          v-for="w in shown"
          :key="w.id"
          :style="{ '--accent': ACCENTS[w.id % ACCENTS.length] }"
        >
          <router-link :to="`/words/${w.id}`" class="row-link accented">
            <span class="fill" :style="{ width: (w.mastery ?? 0) + '%' }" />
            <span class="w-main">
              <span class="mono wt">{{ w.text }}</span>
              <span v-if="w.is_phrase" class="muted small"> · фраза</span>
            </span>
            <span class="muted w-tr">{{ w.translations.join(', ') }}</span>
            <span class="w-mast">{{ (w.mastery ?? 0) === 0 ? 'новое' : w.mastery + '%' }}</span>
          </router-link>
        </li>
        <li v-if="!words.length" class="muted empty">в теме пока нет слов</li>
      </ul>
    </template>
  </main>
</template>

<style scoped>
.back {
  margin: 0 0 0.75rem;
}
.head {
  align-items: flex-start;
}
.htitle {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}
.htitle h1 {
  min-width: 0;
  overflow-wrap: break-word;
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
.row-link.accented {
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  border-left: 4px solid var(--accent);
}
.row-link.accented:hover {
  background: color-mix(in srgb, var(--accent) 9%, var(--card));
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  border-left-color: var(--accent);
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  pointer-events: none;
}
.w-main,
.w-tr,
.w-mast {
  position: relative;
}
.wt {
  color: color-mix(in srgb, var(--accent) 50%, var(--fg));
  font-weight: 700;
}
.w-main {
  min-width: 0;
}
.w-tr {
  flex: 1;
  text-align: right;
  min-width: 0;
}
.w-mast {
  flex: none;
  margin-left: 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--faint);
}
.empty {
  padding: 0.7rem 0;
}
.sortbar {
  margin: 0.25rem 0 0;
}
.sortbar button {
  font-size: 0.78rem;
}
</style>
