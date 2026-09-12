<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { startSession } from '@/lib/session'
import {
  AI_EXERCISE_TYPES,
  buildFromBlocks,
  ROUND_WORD_COST,
  type BlockResult,
} from '@/lib/exercises'
import Sparkles from '@/components/Sparkles.vue'
import type {
  ExerciseType,
  FolderRow,
  GenerateResult,
  QuotaInfo,
  TrainingBlock,
  TrainingCard,
  TrainingPreset,
  TrainingSet,
} from '@/lib/types'

const MAX_ROUNDS = 20

const TYPE_META: { type: ExerciseType; label: string; hint: string }[] = [
  { type: 'match', label: 'пары', hint: 'сопоставить слово и перевод' },
  { type: 'choice', label: 'выбор перевода', hint: 'выбрать перевод из вариантов' },
  { type: 'gap', label: '1 пропуск', hint: 'вставить слово в предложение · ИИ' },
  { type: 'multigap', label: 'мульти-пропуск', hint: 'несколько пропусков в тексте · ИИ' },
  { type: 'clickable', label: 'что значит слово', hint: 'перевод выделенного слова в тексте · ИИ' },
  { type: 'typed', label: 'ввод перевода', hint: 'вписать перевод вручную' },
]
const labelOf = (t: ExerciseType) => TYPE_META.find((m) => m.type === t)?.label ?? t

const router = useRouter()

const folders = ref<FolderRow[]>([])
const total = ref(0)
const mode = ref<'auto' | 'manual'>('auto')
const folderId = ref<number | null>(null)
const starting = ref(false)
const stage = ref<string | null>(null)
const error = ref<string | null>(null)
const quota = ref<QuotaInfo | null>(null)
const presets = ref<TrainingPreset[]>([])

const selectMode = ref<'single' | 'assembly'>('single')
const singleType = ref<ExerciseType>('choice')
const singleRounds = ref(8)
const blocks = ref<TrainingBlock[]>([{ type: 'choice', rounds: 6 }])
const saveTemplate = ref(false)
const templateName = ref('')

/** Сколько слов реально доступно: в выбранной теме или во всём словаре. */
const available = computed(() => {
  if (folderId.value) {
    return folders.value.find((f) => f.id === folderId.value)?.word_count ?? 0
  }
  return total.value
})

const plan = computed<TrainingBlock[]>(() =>
  selectMode.value === 'single'
    ? [{ type: singleType.value, rounds: singleRounds.value }]
    : blocks.value,
)
const roundsUsed = computed(() => blocks.value.reduce((s, b) => s + b.rounds, 0))
const wordsNeeded = computed(() =>
  plan.value.reduce((s, b) => s + b.rounds * ROUND_WORD_COST[b.type], 0),
)

const singleMaxRounds = computed(() => {
  const cost = ROUND_WORD_COST[singleType.value]
  const byWords = available.value > 0 ? Math.floor(available.value / cost) : MAX_ROUNDS
  return Math.max(1, Math.min(MAX_ROUNDS, byWords))
})
watch([singleMaxRounds], () => {
  if (singleRounds.value > singleMaxRounds.value) singleRounds.value = singleMaxRounds.value
})

function addBlock() {
  if (roundsUsed.value >= MAX_ROUNDS) return
  const used = new Set(blocks.value.map((b) => b.type))
  const next = TYPE_META.find((m) => !used.has(m.type))?.type ?? 'choice'
  blocks.value.push({ type: next, rounds: Math.min(4, MAX_ROUNDS - roundsUsed.value) })
}
function removeBlock(i: number) {
  blocks.value.splice(i, 1)
}
/** Не даём одному блоку раздуть общую сумму раундов выше лимита. */
function clampBlockRounds(i: number) {
  const b = blocks.value[i]
  if (!b) return
  if (b.rounds < 1) b.rounds = 1
  const others = roundsUsed.value - b.rounds
  const maxForThis = MAX_ROUNDS - others
  if (b.rounds > maxForThis) b.rounds = Math.max(1, maxForThis)
}

onMounted(async () => {
  try {
    const [f, q, p] = await Promise.all([
      api<{ folders: FolderRow[]; total: number }>('/folders'),
      api<QuotaInfo>('/quota').catch(() => null),
      api<{ presets: TrainingPreset[] }>('/training-presets').catch(() => ({ presets: [] })),
    ])
    folders.value = f.folders
    total.value = f.total
    quota.value = q
    presets.value = p.presets
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

function applyPreset(p: TrainingPreset) {
  mode.value = p.config.source.mode
  folderId.value = p.config.source.folder_id
  selectMode.value = p.config.select_mode
  singleType.value = p.config.single.type
  singleRounds.value = p.config.single.rounds
  blocks.value = p.config.blocks.map((b) => ({ ...b }))
}
function deletePreset(id: number) {
  presets.value = presets.value.filter((p) => p.id !== id)
  api(`/training-presets/${id}`, { method: 'DELETE' }).catch(() => {})
}

function degradeWarning(kindLabel: string, degraded: string): string | null {
  if (degraded === 'no_key' || degraded === 'no_input') return null
  if (degraded === 'quota') return `дневной лимит ИИ исчерпан — блок «${kindLabel}» пропущен`
  return `не удалось сгенерировать «${kindLabel}» — блок пропущен`
}

async function start() {
  error.value = null
  if (mode.value === 'manual' && !folderId.value) {
    error.value = 'Для режима «по теме» выберите тему'
    return
  }
  if (!plan.value.length || plan.value.every((b) => b.rounds <= 0)) {
    error.value = 'добавьте хотя бы один блок'
    return
  }

  starting.value = true
  try {
    stage.value = 'собираю набор…'
    const q = new URLSearchParams({
      mode: mode.value,
      limit: String(Math.max(1, wordsNeeded.value)),
    })
    if (folderId.value) q.set('folder', String(folderId.value))
    const set = await api<TrainingSet>(`/training-set?${q}`)
    if (!set.cards.length) {
      error.value = 'Нечего тренировать — добавьте слова или выберите другую тему'
      return
    }

    // раздать карточки по блокам последовательно, без пересечений
    const cardsByBlock: TrainingCard[][] = []
    let cursor = 0
    for (const b of plan.value) {
      const need = b.rounds * ROUND_WORD_COST[b.type]
      cardsByBlock.push(set.cards.slice(cursor, cursor + need))
      cursor += need
    }

    let genWarning: string | null = null
    const results: BlockResult[] = []
    for (let i = 0; i < plan.value.length; i++) {
      const b = plan.value[i]!
      const cards = cardsByBlock[i] ?? []
      if (!cards.length) continue
      if (!AI_EXERCISE_TYPES.has(b.type)) {
        results.push({ type: b.type, cards })
        continue
      }
      if (!quota.value?.enabled) {
        genWarning ??= `ИИ выключен — блок «${labelOf(b.type)}» пропущен`
        continue
      }
      stage.value = `готовлю «${labelOf(b.type)}»…`
      try {
        const gen = await api<GenerateResult>('/exercises/generate', {
          method: 'POST',
          body: JSON.stringify({
            sense_ids: cards.map((c) => c.word_sense_id),
            want_kind: b.type,
            limit: b.rounds,
          }),
        })
        results.push({ type: b.type, cards, ai: gen.exercises })
        quota.value = { ...quota.value!, left: gen.quota_left }
        if (gen.degraded) {
          console.warn(
            `[генерация упражнений] «${b.type}» degraded=${gen.degraded}\n${gen.gen_detail ?? ''}`,
          )
          genWarning ??= degradeWarning(labelOf(b.type), gen.degraded)
        }
      } catch (e) {
        console.warn(`[генерация упражнений] «${b.type}» запрос упал:`, e)
        genWarning ??= `не удалось сгенерировать «${labelOf(b.type)}» — блок пропущен`
      }
    }

    const exercises = buildFromBlocks(results, set.cards, set.distractor_pool)
    if (!exercises.length) {
      error.value = 'Не получилось собрать тренировку — попробуйте другой набор слов'
      return
    }

    if (saveTemplate.value && templateName.value.trim()) {
      api<{ preset: TrainingPreset }>('/training-presets', {
        method: 'POST',
        body: JSON.stringify({
          name: templateName.value.trim(),
          config: {
            source: { mode: mode.value, folder_id: folderId.value },
            select_mode: selectMode.value,
            single: { type: singleType.value, rounds: singleRounds.value },
            blocks: blocks.value,
          },
        }),
      })
        .then((r) => presets.value.push(r.preset))
        .catch(() => {})
    }

    startSession(exercises, genWarning)
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

    <button class="ghost back" @click="router.push('/')">← прогресс</button>
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

    <label class="field">
      <span class="label">тема</span>
      <select v-model.number="folderId">
        <option :value="null">{{ mode === 'manual' ? '— выбрать —' : 'везде' }}</option>
        <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
      </select>
    </label>

    <div v-if="presets.length" class="presets">
      <span class="label">шаблоны</span>
      <div class="preset-row">
        <div v-for="p in presets" :key="p.id" class="preset-chip">
          <button class="preset-btn" @click="applyPreset(p)">{{ p.name }}</button>
          <button class="preset-del" aria-label="удалить шаблон" @click="deletePreset(p.id)">
            ×
          </button>
        </div>
      </div>
    </div>

    <div class="label">тренировка</div>
    <div class="seg two">
      <button :class="{ on: selectMode === 'single' }" @click="selectMode = 'single'">
        <span class="disp t">один тип</span>
        <span class="s">одно упражнение</span>
      </button>
      <button :class="{ on: selectMode === 'assembly' }" @click="selectMode = 'assembly'">
        <span class="disp t">сборка</span>
        <span class="s">несколько типов</span>
      </button>
    </div>

    <template v-if="selectMode === 'single'">
      <div class="type-grid">
        <button
          v-for="m in TYPE_META"
          :key="m.type"
          class="type-tile"
          :class="{ on: singleType === m.type }"
          @click="singleType = m.type"
        >
          <span class="disp t">{{ m.label }}</span>
          <span class="s">{{ m.hint }}</span>
        </button>
      </div>

      <div class="count-box">
        <div class="count-top">
          <div>
            <span class="mono num">{{ singleRounds }}</span>
            <span class="label">раундов</span>
          </div>
          <span class="mono avail">доступно слов: {{ available }}</span>
        </div>
        <input type="range" min="1" :max="singleMaxRounds" step="1" v-model.number="singleRounds" />
      </div>
    </template>

    <template v-else>
      <div class="blocks">
        <div v-for="(b, i) in blocks" :key="i" class="block-row">
          <select v-model="b.type">
            <option v-for="m in TYPE_META" :key="m.type" :value="m.type">{{ m.label }}</option>
          </select>
          <input
            type="number"
            class="mono block-rounds"
            min="1"
            :max="MAX_ROUNDS"
            v-model.number="b.rounds"
            @change="clampBlockRounds(i)"
          />
          <span class="muted small">раунд.</span>
          <button class="link block-del" aria-label="убрать блок" @click="removeBlock(i)">
            ×
          </button>
        </div>
        <p v-if="!blocks.length" class="muted small">блоков нет — добавьте хотя бы один</p>
      </div>
      <button class="ghost add-block" :disabled="roundsUsed >= MAX_ROUNDS" @click="addBlock">
        + добавить блок
      </button>
      <p class="mono rounds-total">{{ roundsUsed }} / {{ MAX_ROUNDS }} раундов</p>
    </template>

    <label class="save-tpl">
      <input type="checkbox" v-model="saveTemplate" />
      <span>сохранить как шаблон</span>
    </label>
    <input
      v-if="saveTemplate"
      v-model="templateName"
      class="tpl-name"
      placeholder="название шаблона"
    />

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

.presets {
  margin-top: 1rem;
}
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
.preset-chip {
  display: flex;
  align-items: center;
  background: var(--card);
  border-radius: var(--r-pill);
  overflow: hidden;
}
.preset-btn {
  padding: 0.4rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--fg-dim);
  background: transparent;
  text-transform: none;
}
.preset-del {
  all: unset;
  cursor: pointer;
  padding: 0.4rem 0.6rem;
  color: var(--faint);
  font-size: 0.9rem;
}

.type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.type-tile {
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
.type-tile .t {
  font-size: 0.92rem;
  font-weight: 800;
}
.type-tile .s {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--faint);
  text-transform: none;
  line-height: 1.25;
}
.type-tile.on {
  background: var(--grad-hero);
  color: var(--hero-ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.type-tile.on .s {
  color: var(--hero-ink);
  opacity: 0.66;
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

.blocks {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
.block-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--card);
  border-radius: var(--r-md);
  padding: 0.5rem 0.6rem;
}
.block-row select {
  flex: 1 1 auto;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--fg);
  font-weight: 700;
  padding: 0.3rem 0;
}
.block-rounds {
  width: 3.2rem;
  flex: none;
  padding: 0.3rem 0.4rem;
  text-align: center;
}
.block-del {
  all: unset;
  cursor: pointer;
  flex: none;
  font-size: 1.15rem;
  line-height: 1;
  color: var(--faint);
  padding: 0 0.2rem;
}
.add-block {
  margin-top: 0.5rem;
  width: 100%;
}
.rounds-total {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: right;
}

.save-tpl {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1.4rem 0 0;
  font-size: 0.85rem;
  color: var(--fg-dim);
}
.save-tpl input {
  width: 18px;
  height: 18px;
}
.tpl-name {
  margin-top: 0.5rem;
}

.cta-frame {
  margin-top: 1.2rem;
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
