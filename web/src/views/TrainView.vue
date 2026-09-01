<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { startSession } from '@/lib/session'
import Sparkles from '@/components/Sparkles.vue'
import type {
  FolderRow,
  GenerateResult,
  QuotaInfo,
  TrainingFormat,
  TrainingSet,
} from '@/lib/types'

const HARD_MAX = 25

const router = useRouter()

const folders = ref<FolderRow[]>([])
const total = ref(0)
const mode = ref<'auto' | 'manual'>('auto')
const format = ref<TrainingFormat>('mix')
const folderId = ref<number | null>(null)
const count = ref(10)
const starting = ref(false)
const stage = ref<string | null>(null)
const error = ref<string | null>(null)
const quota = ref<QuotaInfo | null>(null)

/** Сколько слов реально доступно: в выбранной теме или во всём словаре. */
const available = computed(() => {
  if (folderId.value) {
    return folders.value.find((f) => f.id === folderId.value)?.word_count ?? 0
  }
  return total.value
})
const sliderMax = computed(() =>
  available.value > 0 ? Math.min(HARD_MAX, available.value) : HARD_MAX,
)
const sliderMin = computed(() => Math.min(5, sliderMax.value))

watch([sliderMax, sliderMin], () => {
  if (count.value > sliderMax.value) count.value = sliderMax.value
  if (count.value < sliderMin.value) count.value = sliderMin.value
})

onMounted(async () => {
  try {
    const [f, q] = await Promise.all([
      api<{ folders: FolderRow[]; total: number }>('/folders'),
      api<QuotaInfo>('/quota').catch(() => null),
    ])
    folders.value = f.folders
    total.value = f.total
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
    const q = new URLSearchParams({ mode: mode.value, limit: String(count.value) })
    if (folderId.value) q.set('folder', String(folderId.value))

    stage.value = 'собираю набор…'
    const set = await api<TrainingSet>(`/training-set?${q}`)
    if (!set.cards.length) {
      error.value = 'Нечего тренировать — добавьте слова или выберите другую тему'
      return
    }

    let context: GenerateResult['exercises'] = []
    const wantContext = format.value !== 'cards' && quota.value?.enabled
    if (wantContext) {
      stage.value = 'готовлю упражнения в контексте…'
      try {
        const gen = await api<GenerateResult>('/exercises/generate', {
          method: 'POST',
          body: JSON.stringify({
            sense_ids: set.cards.map((c) => c.word_sense_id),
          }),
        })
        context = gen.exercises
        quota.value = { ...quota.value!, left: gen.quota_left }
        if (gen.degraded) {
          console.warn(
            `[генерация упражнений] degraded=${gen.degraded}\n${gen.gen_detail ?? ''}`,
          )
        } else {
          console.info(
            `[генерация упражнений] контекстных: ${gen.exercises.length}, квота осталась: ${gen.quota_left}`,
          )
        }
      } catch (e) {
        console.warn('[генерация упражнений] запрос упал:', e)
      }
    }

    startSession(set, context, format.value)
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
    <Sparkles
      :spots="[
        { pos: { top: '60px', right: '90px' }, size: 16, color: '#ffc23d', delay: 0 },
        { pos: { top: '48px', right: '60px' }, size: 9, color: '#b6f04a', delay: 0.9 },
        { pos: { top: '96px', right: '120px' }, size: 11, color: '#ff6ba6', delay: 1.6 },
      ]"
    />

    <p class="back"><router-link to="/">← темы</router-link></p>
    <h1>тренировка</h1>
    <p v-if="quota?.enabled" class="mono quota">ии сегодня · {{ quota.left }}/{{ quota.limit }}</p>

    <p v-if="error" class="err">{{ error }}</p>

    <div class="label">набор</div>
    <div class="seg two">
      <button :class="{ on: mode === 'auto' }" @click="mode = 'auto'">
        <span class="disp t">авто</span>
        <span class="s">самые невыученные</span>
      </button>
      <button :class="{ on: mode === 'manual' }" @click="mode = 'manual'">
        <span class="disp t">по теме</span>
        <span class="s">по порядку</span>
      </button>
    </div>

    <div class="label">формат</div>
    <div class="chips">
      <button :class="{ on: format === 'mix' }" @click="format = 'mix'">вперемешку</button>
      <button :class="{ on: format === 'context' }" @click="format = 'context'">контекст</button>
      <button :class="{ on: format === 'cards' }" @click="format = 'cards'">карточки</button>
    </div>
    <p class="fmt-hint muted small">
      <span v-if="format === 'mix'">контекст + карточки вперемешку</span>
      <span v-else-if="format === 'context'">только предложения с пропуском / выбор перевода</span>
      <span v-else>пары, самооценка, выбор — без ИИ</span>
    </p>

    <label class="field">
      <span class="label">тема</span>
      <select v-model.number="folderId">
        <option :value="null">{{ mode === 'manual' ? '— выбрать —' : 'везде' }}</option>
        <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
      </select>
    </label>

    <div class="count-box">
      <div class="count-top">
        <div>
          <span class="mono num">{{ count }}</span>
          <span class="label">слов</span>
        </div>
        <span v-if="available > 0 && available < HARD_MAX" class="mono avail">
          доступно {{ available }}
        </span>
      </div>
      <input type="range" :min="sliderMin" :max="sliderMax" step="1" v-model.number="count" />
    </div>

    <div class="frame cta-frame">
      <button class="primary cta" :disabled="starting" @click="start">
        {{ starting ? stage || 'собираю…' : 'начать' }}
        <svg v-if="!starting" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7-11-7Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </main>
</template>

<style scoped>
.back {
  margin: 0 0 0.5rem;
}
.quota {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted);
  margin: -0.4rem 0 1.5rem;
}
.label {
  display: block;
  margin: 1.2rem 0 0.6rem;
}

.seg {
  display: grid;
  gap: 0.5rem;
}
.seg.two {
  grid-template-columns: 1fr 1fr;
}
.seg button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  padding: 0.8rem 0.75rem;
  background: var(--card);
  border-radius: var(--r-lg);
  color: var(--muted);
  text-align: left;
}
.seg button .t {
  font-size: 0.95rem;
  font-weight: 800;
}
.seg button .s {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--faint);
  text-transform: none;
}
.seg button.on {
  background: var(--grad-hero);
  color: var(--hero-ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.seg button.on .s {
  color: var(--hero-ink);
  opacity: 0.62;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.chips button {
  padding: 0.5rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--card);
  color: var(--muted);
  border-radius: var(--r-sm);
}
.chips button.on {
  background: linear-gradient(160deg, var(--hero-a), var(--hero-b));
  color: var(--hero-ink);
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.fmt-hint {
  margin: 0.5rem 0 0;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: var(--card);
  border-radius: var(--r-lg);
  padding: 0.5rem 1rem;
  margin-top: 1.2rem;
}
.field .label {
  margin: 0;
}
.field select {
  flex: 1 1 auto;
  max-width: 14rem;
  background: transparent;
  border: none;
  text-align: right;
  font-family: var(--font-disp);
  font-weight: 800;
  text-transform: lowercase;
  padding: 0.5rem 0;
}

.count-box {
  background: var(--card);
  border-radius: var(--r-lg);
  padding: 1rem 1rem 1.1rem;
  margin: 0.75rem 0 1.5rem;
}
.count-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 0.7rem;
}
.count-top .num {
  font-weight: 700;
  font-size: 2.6rem;
  line-height: 0.8;
  color: var(--fg);
}
.count-top .label {
  display: inline;
  margin: 0 0 0 0.4rem;
}
.avail {
  font-weight: 500;
  font-size: 0.7rem;
  color: var(--faint);
}

.cta-frame {
  margin-top: 0.5rem;
}
.cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  font-size: 1.1rem;
}
</style>
