<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { startSession } from '@/lib/session'
import type {
  FolderRow,
  GenerateResult,
  QuotaInfo,
  TrainingSet,
} from '@/lib/types'

const router = useRouter()

const folders = ref<FolderRow[]>([])
const mode = ref<'auto' | 'manual'>('auto')
const folderId = ref<number | null>(null)
const limit = ref(10)
const starting = ref(false)
const stage = ref<string | null>(null)
const error = ref<string | null>(null)
const quota = ref<QuotaInfo | null>(null)

onMounted(async () => {
  try {
    const [f, q] = await Promise.all([
      api<{ folders: FolderRow[] }>('/folders'),
      api<QuotaInfo>('/quota').catch(() => null),
    ])
    folders.value = f.folders
    quota.value = q
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

async function start() {
  error.value = null
  if (mode.value === 'manual' && !folderId.value) {
    error.value = 'Для режима «по теме» выберите тему'
    return
  }
  starting.value = true
  try {
    const q = new URLSearchParams({ mode: mode.value, limit: String(limit.value) })
    if (folderId.value) q.set('folder', String(folderId.value))

    stage.value = 'собираю набор…'
    const set = await api<TrainingSet>(`/training-set?${q}`)
    if (!set.cards.length) {
      error.value = 'Нечего тренировать — добавьте слова или выберите другую тему'
      return
    }

    let context: GenerateResult['exercises'] = []
    if (quota.value?.enabled) {
      stage.value = 'готовлю упражнения в контексте…'
      try {
        const gen = await api<GenerateResult>('/exercises/generate', {
          method: 'POST',
          body: JSON.stringify({
            sense_ids: set.cards.map((c) => c.word_sense_id),
          }),
        })
        context = gen.exercises
        quota.value = { ...quota.value, left: gen.quota_left }
      } catch {
        // генерация не критична — тренируемся на упражнениях без LLM
      }
    }

    startSession(set, context)
    router.push({ name: 'train-run' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    starting.value = false
    stage.value = null
  }
}
</script>

<template>
  <main class="page">
    <p><router-link to="/">← темы</router-link></p>
    <h1>Тренировка</h1>

    <p v-if="quota?.enabled" class="muted small">
      запросов к ИИ сегодня осталось: {{ quota.left }} / {{ quota.limit }}
    </p>

    <p v-if="error" class="err">{{ error }}</p>

    <fieldset class="grp">
      <legend>Набор</legend>
      <label class="opt">
        <input type="radio" value="auto" v-model="mode" />
        авто — самые невыученные
      </label>
      <label class="opt">
        <input type="radio" value="manual" v-model="mode" />
        по теме — по порядку
      </label>
    </fieldset>

    <label class="fld">
      <span>Тема</span>
      <select v-model.number="folderId">
        <option :value="null">{{ mode === 'manual' ? '— выбрать —' : 'везде' }}</option>
        <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
      </select>
    </label>

    <label class="fld">
      <span>Сколько слов</span>
      <select v-model.number="limit">
        <option :value="6">6</option>
        <option :value="10">10</option>
        <option :value="15">15</option>
        <option :value="20">20</option>
      </select>
    </label>

    <button class="go" :disabled="starting" @click="start">
      {{ starting ? stage || 'собираю…' : 'начать' }}
    </button>
  </main>
</template>

<style scoped>
.grp {
  border: 1px solid #2a2e39;
  border-radius: 0.5rem;
  margin: 1rem 0;
  padding: 0.5rem 0.9rem 0.8rem;
}
.grp legend {
  color: var(--muted);
  padding: 0 0.4rem;
}
.fld {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0.75rem 0;
}
.fld select {
  flex: 1 1 auto;
  max-width: 14rem;
  padding: 0.45rem 0.5rem;
  background: #0d0f13;
  border: 1px solid #2a2e39;
  border-radius: 0.4rem;
  color: var(--fg);
  font: inherit;
}
.go {
  width: 100%;
  margin-top: 1rem;
  padding: 0.8rem;
  font-size: 1rem;
}
</style>
