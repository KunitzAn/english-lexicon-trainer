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
    <p><router-link to="/">← темы</router-link></p>

    <div class="row">
      <h1>{{ name || '…' }}</h1>
      <span>
        <button class="link" :disabled="renaming" @click="rename">переименовать</button>
        <button class="link" @click="removeFolder">удалить</button>
      </span>
    </div>

    <p>
      <router-link :to="`/words/add?folder=${folderId}`">+ слово в эту тему</router-link>
    </p>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <ul v-else class="list">
      <li v-for="w in words" :key="w.id">
        <router-link :to="`/words/${w.id}`">
          {{ w.text }}<span v-if="w.is_phrase" class="muted"> (фраза)</span>
        </router-link>
        <span class="muted">{{ w.translations.join(', ') }}</span>
      </li>
      <li v-if="!words.length" class="muted">в теме пока нет слов</li>
    </ul>
  </main>
</template>
