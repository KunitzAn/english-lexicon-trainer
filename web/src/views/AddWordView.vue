<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import type { FolderRow, LookupResult, LookupVariant, SenseDraft } from '@/lib/types'

const route = useRoute()
const router = useRouter()

const text = ref('')
const wordInput = ref<HTMLInputElement | null>(null)
const folders = ref<FolderRow[]>([])
const selectedFolders = reactive<Set<number>>(new Set())

const variants = ref<LookupVariant[]>([])
const checkedVariants = reactive<Set<string>>(new Set())
const lookupState = ref<'idle' | 'loading' | 'done' | 'degraded'>('idle')

const manual = ref<SenseDraft[]>([])
const error = ref<string | null>(null)
const lastAdded = ref<string | null>(null)
const saving = ref(false)

onMounted(async () => {
  const res = await api<{ folders: FolderRow[] }>('/folders')
  folders.value = res.folders
  const pre = Number(route.query.folder)
  if (Number.isInteger(pre)) selectedFolders.add(pre)
})

function addManual() {
  manual.value.push({ translation: '', definition_en: '', example: '', expanded: false })
}

async function lookup() {
  const q = text.value.trim()
  if (!q) return
  lookupState.value = 'loading'
  error.value = null
  try {
    const res = await api<LookupResult>(`/words/lookup?q=${encodeURIComponent(q)}`)
    console.log('[lookup] ответ:', res)
    variants.value = res.variants
    checkedVariants.clear()
    if (res.degraded) {
      console.warn('[lookup] перевод недоступен:', res.detail)
      lookupState.value = 'degraded'
      if (!manual.value.length) addManual()
    } else {
      lookupState.value = 'done'
    }
  } catch (e) {
    console.error('[lookup] ошибка запроса:', e)
    error.value = e instanceof Error ? e.message : String(e)
    lookupState.value = 'degraded'
    if (!manual.value.length) addManual()
  }
}

function toggleVariant(t: string) {
  if (checkedVariants.has(t)) checkedVariants.delete(t)
  else checkedVariants.add(t)
}

function toggleFolder(id: number) {
  if (selectedFolders.has(id)) selectedFolders.delete(id)
  else selectedFolders.add(id)
}

function buildSenses() {
  return [
    ...[...checkedVariants].map((translation) => ({
      translation,
      source: 'api' as const,
    })),
    ...manual.value
      .filter((m) => m.translation.trim())
      .map((m) => ({
        translation: m.translation.trim(),
        definition_en: m.definition_en.trim() || undefined,
        example: m.example.trim() || undefined,
        source: 'manual' as const,
      })),
  ]
}

function resetForm() {
  text.value = ''
  variants.value = []
  checkedVariants.clear()
  manual.value = []
  lookupState.value = 'idle'
  nextTick(() => wordInput.value?.focus())
}

async function save(again: boolean) {
  const senses = buildSenses()
  if (!text.value.trim()) {
    error.value = 'введите слово'
    return
  }
  if (!senses.length) {
    error.value = 'отметьте перевод или впишите свой'
    return
  }
  saving.value = true
  error.value = null
  try {
    const res = await api<{ word_id: number; created: boolean; added_senses: number }>(
      '/words',
      {
        method: 'POST',
        body: JSON.stringify({
          text: text.value,
          folder_ids: [...selectedFolders],
          senses,
        }),
      },
    )
    if (again) {
      lastAdded.value = text.value.trim()
      resetForm()
    } else {
      router.push(`/words/${res.word_id}`)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="page">
    <p><router-link to="/">← темы</router-link></p>
    <h1>Новое слово</h1>
    <p v-if="lastAdded" class="muted small">добавлено: {{ lastAdded }}</p>

    <form class="add" @submit.prevent="lookup">
      <input ref="wordInput" v-model="text" placeholder="английское слово или фраза" />
      <button type="submit" :disabled="lookupState === 'loading' || !text.trim()">
        найти перевод
      </button>
    </form>

    <p v-if="lookupState === 'loading'" class="muted">ищем…</p>
    <p v-if="lookupState === 'degraded'" class="muted">
      перевод недоступен — впишите вручную (подробности в консоли браузера)
    </p>

    <section v-if="variants.length" class="card">
      <h2>Варианты перевода</h2>
      <label v-for="v in variants" :key="v.translation" class="opt">
        <input
          type="checkbox"
          :checked="checkedVariants.has(v.translation)"
          @change="toggleVariant(v.translation)"
        />
        {{ v.translation }}
      </label>
    </section>

    <section class="card">
      <div class="row">
        <h2>Свои значения</h2>
        <button class="link" @click="addManual">+ добавить</button>
      </div>
      <div v-for="(m, i) in manual" :key="i" class="sense-draft">
        <input v-model="m.translation" placeholder="перевод (RU)" />
        <button class="link" @click="m.expanded = !m.expanded">
          {{ m.expanded ? 'скрыть детали' : 'определение / пример' }}
        </button>
        <template v-if="m.expanded">
          <input v-model="m.definition_en" placeholder="определение (EN), необяз." />
          <input v-model="m.example" placeholder="пример, необяз." />
        </template>
      </div>
      <p v-if="!manual.length" class="muted">нет</p>
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
      <p v-if="!folders.length" class="muted">тем пока нет — можно сохранить без темы</p>
    </section>

    <p v-if="error" class="err">{{ error }}</p>
    <div class="row-btns">
      <button :disabled="saving" @click="save(false)">сохранить</button>
      <button :disabled="saving" @click="save(true)">сохранить и ещё</button>
    </div>
  </main>
</template>

<style scoped>
.sense-draft {
  display: grid;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}
.row-btns {
  display: flex;
  gap: 0.5rem;
}
</style>
