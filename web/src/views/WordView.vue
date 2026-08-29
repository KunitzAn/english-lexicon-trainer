<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import type { FolderRow, SenseRow, WordDetail } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

const word = ref<WordDetail | null>(null)
const folders = ref<FolderRow[]>([])
const selectedFolders = reactive<Set<number>>(new Set())
const error = ref<string | null>(null)
const loading = ref(true)

const editText = ref('')
const editTranscription = ref('')
const newSense = reactive({ translation: '', part_of_speech: '', definition_en: '', example: '' })

async function load() {
  loading.value = true
  try {
    const [w, f] = await Promise.all([
      api<{ word: WordDetail }>(`/words/${id}`),
      api<{ folders: FolderRow[] }>('/folders'),
    ])
    word.value = w.word
    folders.value = f.folders
    editText.value = w.word.text
    editTranscription.value = w.word.transcription ?? ''
    selectedFolders.clear()
    for (const fid of w.word.folder_ids) selectedFolders.add(fid)
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

async function saveSense(s: SenseRow) {
  try {
    await api(`/senses/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        translation: s.translation,
        part_of_speech: s.part_of_speech,
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
  newSense.part_of_speech = ''
  newSense.definition_en = ''
  newSense.example = ''
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
    <p><router-link to="/words">← все слова</router-link></p>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <template v-else-if="word">
      <section class="card">
        <h2>Слово</h2>
        <input v-model="editText" />
        <input v-model="editTranscription" placeholder="транскрипция" />
        <p class="muted small" v-if="word.is_phrase">фраза</p>
        <button @click="saveWord">сохранить слово</button>
      </section>

      <section class="card">
        <h2>Значения</h2>
        <div v-for="s in word.senses" :key="s.id" class="sense">
          <input v-model="s.translation" placeholder="перевод" />
          <input v-model="s.part_of_speech" placeholder="часть речи" />
          <input v-model="s.definition_en" placeholder="определение (EN)" />
          <input v-model="s.example" placeholder="пример" />
          <div class="row">
            <button class="link" @click="saveSense(s)">сохранить</button>
            <button class="link" @click="deleteSense(s)">удалить</button>
          </div>
        </div>

        <div class="sense">
          <strong class="muted small">новое значение</strong>
          <input v-model="newSense.translation" placeholder="перевод" />
          <input v-model="newSense.part_of_speech" placeholder="часть речи" />
          <input v-model="newSense.definition_en" placeholder="определение (EN)" />
          <input v-model="newSense.example" placeholder="пример" />
          <button class="link" @click="addSense">+ добавить значение</button>
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

      <button class="link" @click="removeWord">удалить слово</button>
    </template>
  </main>
</template>

<style scoped>
.sense {
  display: grid;
  gap: 0.25rem;
  padding: 0.5rem 0;
  border-top: 1px solid #23262e;
}
.opt {
  display: block;
  margin: 0.25rem 0;
}
</style>
