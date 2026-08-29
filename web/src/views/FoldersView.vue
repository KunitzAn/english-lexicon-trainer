<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import type { FolderRow } from '@/lib/types'

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
    <div class="row">
      <h1>Темы</h1>
      <router-link to="/words">все слова</router-link>
    </div>

    <form class="add" @submit.prevent="create">
      <input v-model="newName" placeholder="Новая тема" />
      <button :disabled="creating || !newName.trim()">добавить</button>
    </form>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <ul v-else class="list">
      <li v-for="f in folders" :key="f.id">
        <router-link :to="`/folders/${f.id}`">{{ f.name }}</router-link>
        <span class="muted">{{ f.word_count }}</span>
      </li>
      <li v-if="!folders.length" class="muted">пока пусто</li>
    </ul>
  </main>
</template>
