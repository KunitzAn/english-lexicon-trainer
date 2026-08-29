<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import type { WordListItem } from '@/lib/types'

const words = ref<WordListItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    const res = await api<{ words: WordListItem[] }>('/words')
    words.value = res.words
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
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
      <li v-for="w in words" :key="w.id">
        <router-link :to="`/words/${w.id}`">{{ w.text }}</router-link>
        <span class="muted">{{ w.translations.join(', ') }}</span>
      </li>
      <li v-if="!words.length" class="muted">словарь пуст</li>
    </ul>
  </main>
</template>
