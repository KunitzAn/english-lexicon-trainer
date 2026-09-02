<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import MasteryBar from '@/components/MasteryBar.vue'
import type { FolderRow, SenseRow, WordDetail } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

const word = ref<WordDetail | null>(null)
const folders = ref<FolderRow[]>([])
const selectedFolders = reactive<Set<number>>(new Set())
const expandedSenses = reactive<Set<number>>(new Set())
const error = ref<string | null>(null)
const loading = ref(true)

const editText = ref('')
const editTranscription = ref('')
const showNewSense = ref(false)
const newSense = reactive({ translation: '', definition_en: '', example: '' })

async function load() {
  loading.value = true
  try {
    const [w, f] = await Promise.all([
      api<{ word: WordDetail }>(
        `/words/${id}?tz_offset=${-new Date().getTimezoneOffset()}`,
      ),
      api<{ folders: FolderRow[] }>('/folders'),
    ])
    word.value = w.word
    folders.value = f.folders
    editText.value = w.word.text
    editTranscription.value = w.word.transcription ?? ''
    selectedFolders.clear()
    for (const fid of w.word.folder_ids) selectedFolders.add(fid)
    expandedSenses.clear()
    for (const s of w.word.senses) {
      if (s.definition_en || s.example) expandedSenses.add(s.id)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function saveWord() {
  try {
    await api(`/words/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        text: editText.value,
        transcription: editTranscription.value.trim() || null,
      }),
    })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function saveFolders() {
  try {
    await api(`/words/${id}/folders`, {
      method: 'PUT',
      body: JSON.stringify({ folder_ids: [...selectedFolders] }),
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function toggleFolder(fid: number) {
  if (selectedFolders.has(fid)) selectedFolders.delete(fid)
  else selectedFolders.add(fid)
}

function toggleSense(sid: number) {
  if (expandedSenses.has(sid)) expandedSenses.delete(sid)
  else expandedSenses.add(sid)
}

async function saveSense(s: SenseRow) {
  try {
    await api(`/senses/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        translation: s.translation,
        definition_en: s.definition_en,
        example: s.example,
      }),
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function deleteSense(s: SenseRow) {
  if (!confirm(`Удалить значение «${s.translation}»?`)) return
  await api(`/senses/${s.id}`, { method: 'DELETE' })
  await load()
}

async function addSense() {
  if (!newSense.translation.trim()) return
  await api(`/words/${id}/senses`, {
    method: 'POST',
    body: JSON.stringify({ ...newSense }),
  })
  newSense.translation = ''
  newSense.definition_en = ''
  newSense.example = ''
  showNewSense.value = false
  await load()
}

async function removeWord() {
  if (!confirm('Удалить слово целиком?')) return
  await api(`/words/${id}`, { method: 'DELETE' })
  router.push('/words')
}

onMounted(load)
</script>

<template>
  <main class="page">
    <button class="ghost back" @click="router.push('/words')">← все слова</button>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <template v-else-if="word">
      <section class="card">
        <h2>Слово</h2>
        <input v-model="editText" />
        <input v-model="editTranscription" placeholder="транскрипция" />
        <p v-if="word.is_phrase" class="muted small">фраза</p>
        <div class="wmast">
          <span class="label">выученность</span>
          <MasteryBar :value="word.mastery ?? 0" />
        </div>
        <button @click="saveWord">сохранить слово</button>
      </section>

      <section class="card">
        <h2>Значения</h2>
        <div v-for="s in word.senses" :key="s.id" class="sense">
          <MasteryBar :value="s.mastery ?? 0" />
          <input v-model="s.translation" placeholder="перевод" />
          <button class="link" @click="toggleSense(s.id)">
            {{ expandedSenses.has(s.id) ? 'скрыть детали' : 'детали' }}
          </button>
          <template v-if="expandedSenses.has(s.id)">
            <input v-model="s.definition_en" placeholder="определение (EN)" />
            <input v-model="s.example" placeholder="пример" />
          </template>
          <div class="row">
            <button class="link" @click="saveSense(s)">сохранить</button>
            <button class="link" @click="deleteSense(s)">удалить</button>
          </div>
        </div>

        <button v-if="!showNewSense" class="link" @click="showNewSense = true">
          + добавить значение
        </button>
        <div v-else class="sense">
          <strong class="muted small">новое значение</strong>
          <input v-model="newSense.translation" placeholder="перевод" />
          <input v-model="newSense.definition_en" placeholder="определение (EN), необяз." />
          <input v-model="newSense.example" placeholder="пример, необяз." />
          <div class="row">
            <button @click="addSense">добавить</button>
            <button class="link" @click="showNewSense = false">отмена</button>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Темы</h2>
        <label v-for="f in folders" :key="f.id" class="opt">
          <input
            type="checkbox"
            :checked="selectedFolders.has(f.id)"
            @change="toggleFolder(f.id)"
          />
          {{ f.name }}
        </label>
        <p v-if="!folders.length" class="muted">тем нет</p>
        <button @click="saveFolders">сохранить темы</button>
      </section>

      <div class="row-btns">
        <button @click="router.push('/words/add')">+ новое слово</button>
        <button class="link" @click="removeWord">удалить слово</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.back {
  margin: 0 0 0.75rem;
}
.row-btns {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1rem;
}
.sense {
  display: grid;
  gap: 0.35rem;
  padding: 0.6rem 0;
  border-top: 1px solid var(--line);
}
.wmast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.wmast .label {
  flex: none;
}
.wmast :deep(.mb) {
  flex: 1;
}
</style>
