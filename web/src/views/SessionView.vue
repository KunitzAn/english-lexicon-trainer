<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { endSession, session } from '@/lib/session'
import {
  buildExercises,
  optIsCorrect,
  type Exercise,
  type MatchExercise,
} from '@/lib/exercises'
import type { AttemptDraft } from '@/lib/types'

const router = useRouter()
const norm = (s: string) => s.trim().toLowerCase()

const exercises = ref<Exercise[]>([])
const idx = ref(0)
const phase = ref<'run' | 'summary'>('run')

const attempts = ref<AttemptDraft[]>([])
type Outcome = 'correct' | 'wrong' | 'hint'
interface SenseRef {
  sense_id: number
  text: string
  translation: string
  transcription: string | null
  example: string | null
}
const review = ref<(SenseRef & { outcome: Outcome })[]>([])

const saving = ref(false)
const saveError = ref<string | null>(null)

// --- состояние текущего упражнения ---
const revealed = ref(false) // flashcard
const picked = ref<string | null>(null) // pick: выбранный вариант
const hintShown = ref(false) // pick: подсмотрел перевод
const mLeft = ref<number | null>(null) // match: выбранный EN (word_sense_id)
const mLocked = ref<Set<number>>(new Set())
const mLockedR = ref<Set<number>>(new Set())
const mErred = ref<Set<number>>(new Set()) // EN с ошибочной первой попыткой (для зачёта)
const mFlash = ref<{ left: number; right: number } | null>(null)
const mGaveUp = ref(false)

function resetSub() {
  revealed.value = false
  picked.value = null
  hintShown.value = false
  mLeft.value = null
  mLocked.value = new Set()
  mLockedR.value = new Set()
  mErred.value = new Set()
  mFlash.value = null
  mGaveUp.value = false
}

onMounted(() => {
  if (!session.set) {
    router.replace({ name: 'train' })
    return
  }
  exercises.value = buildExercises(session.set, session.context)
  if (!exercises.value.length) router.replace({ name: 'train' })
})

const current = computed<Exercise | undefined>(() => exercises.value[idx.value])
const total = computed(() => exercises.value.length)

type PickKind = 'choice' | 'gap' | 'clickable'
const isPick = (k: string): k is PickKind =>
  k === 'choice' || k === 'gap' || k === 'clickable'

function senseRef(ex: Exercise): SenseRef {
  if (ex.kind === 'flashcard' || ex.kind === 'choice') {
    const c = ex.card
    return {
      sense_id: c.word_sense_id,
      text: c.text,
      translation: c.translation,
      transcription: c.transcription,
      example: c.example,
    }
  }
  if (ex.kind === 'gap' || ex.kind === 'clickable') {
    const g = ex.gloss
    return {
      sense_id: g.word_sense_id,
      text: g.text,
      translation: g.translation,
      transcription: g.transcription,
      example: g.example,
    }
  }
  throw new Error('senseRef: match has many senses')
}

function finishExercise(
  outcomes: { ref: SenseRef; is_correct: boolean | null; hint: boolean }[],
) {
  const c = current.value!
  const exId = 'exercise_id' in c ? c.exercise_id : undefined
  for (const o of outcomes) {
    attempts.value.push({
      client_id: crypto.randomUUID(),
      word_sense_id: o.ref.sense_id,
      exercise_id: exId,
      exercise_type: c.kind,
      is_correct: o.is_correct,
      hint_used: o.hint,
    })
    review.value.push({
      ...o.ref,
      outcome: o.hint ? 'hint' : o.is_correct ? 'correct' : 'wrong',
    })
  }
  if (idx.value + 1 >= total.value) finalize()
  else {
    idx.value++
    resetSub()
  }
}

// --- flashcard ---
function flashRate(known: boolean) {
  finishExercise([{ ref: senseRef(current.value!), is_correct: known, hint: false }])
}

// --- pick: choice / gap / clickable ---
const pickOptions = computed<string[]>(() => {
  const c = current.value
  if (c?.kind === 'gap') return c.bank
  if (c?.kind === 'choice' || c?.kind === 'clickable') return c.options
  return []
})
const pickAnswer = computed<string>(() => {
  const c = current.value
  return c && isPick(c.kind) ? (c as { answer: string }).answer : ''
})
const peekText = computed(() =>
  current.value && current.value.kind !== 'match'
    ? senseRef(current.value).translation
    : '',
)
const gapParts = computed(() =>
  current.value?.kind === 'gap' ? current.value.text.split(/_{2,}/) : [],
)
const clickParts = computed(() => {
  const c = current.value
  if (c?.kind !== 'clickable') return null
  const i = c.text.toLowerCase().indexOf(c.target.toLowerCase())
  if (i < 0) return { pre: c.text, hit: '', post: '' }
  return {
    pre: c.text.slice(0, i),
    hit: c.text.slice(i, i + c.target.length),
    post: c.text.slice(i + c.target.length),
  }
})

function pickChoose(opt: string) {
  if (picked.value || hintShown.value) return
  picked.value = opt
}
function pickNext() {
  const ref = senseRef(current.value!)
  if (hintShown.value) finishExercise([{ ref, is_correct: null, hint: true }])
  else
    finishExercise([
      { ref, is_correct: optIsCorrect(pickAnswer.value, picked.value!), hint: false },
    ])
}
function pickClass(opt: string) {
  if (!picked.value && !hintShown.value) return ''
  if (norm(opt) === norm(pickAnswer.value)) return 'ok'
  if (opt === picked.value) return 'bad'
  return ''
}

// --- match ---
const matchEx = computed(() => current.value as MatchExercise)
const matchDone = computed(
  () =>
    current.value?.kind === 'match' &&
    (mGaveUp.value || mLocked.value.size === matchEx.value.cards.length),
)
function tapLeft(id: number) {
  if (mLocked.value.has(id) || mGaveUp.value || mFlash.value) return
  mLeft.value = mLeft.value === id ? null : id
}
function tapRight(i: number) {
  if (
    mGaveUp.value ||
    mFlash.value ||
    mLockedR.value.has(i) ||
    mLeft.value == null
  )
    return
  const id = mLeft.value
  const card = matchEx.value.cards.find((c) => c.word_sense_id === id)!
  if (norm(card.translation) === norm(matchEx.value.rights[i]!)) {
    mLocked.value = new Set([...mLocked.value, id])
    mLockedR.value = new Set([...mLockedR.value, i])
    mLeft.value = null
  } else {
    mErred.value = new Set([...mErred.value, id])
    mFlash.value = { left: id, right: i }
    setTimeout(() => {
      mFlash.value = null
      mLeft.value = null
    }, 600)
  }
}
function matchGiveUp() {
  mGaveUp.value = true
  mLeft.value = null
}
function matchNext() {
  const outcomes = matchEx.value.cards.map((card) => {
    const ref: SenseRef = {
      sense_id: card.word_sense_id,
      text: card.text,
      translation: card.translation,
      transcription: card.transcription,
      example: card.example,
    }
    if (!mLocked.value.has(card.word_sense_id))
      return { ref, is_correct: null, hint: true }
    if (mErred.value.has(card.word_sense_id))
      return { ref, is_correct: false, hint: false }
    return { ref, is_correct: true as boolean | null, hint: false }
  })
  finishExercise(outcomes)
}

// --- финал ---
async function finalize() {
  phase.value = 'summary'
  await save()
}
async function save() {
  saving.value = true
  saveError.value = null
  try {
    await api('/attempts', {
      method: 'POST',
      body: JSON.stringify({ attempts: attempts.value }),
    })
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

const counts = computed(() => ({
  correct: review.value.filter((r) => r.outcome === 'correct').length,
  wrong: review.value.filter((r) => r.outcome === 'wrong').length,
  hint: review.value.filter((r) => r.outcome === 'hint').length,
}))

function again() {
  endSession()
  router.push({ name: 'train' })
}
function toFolders() {
  endSession()
  router.push('/')
}

const mark = { correct: '✓', wrong: '✗', hint: '👁' }
</script>

<template>
  <main class="page">
    <template v-if="phase === 'run' && current">
      <div class="bar">
        <span>{{ idx + 1 }} / {{ total }}</span>
        <button class="link" @click="finalize">завершить</button>
      </div>
      <div class="track"><i :style="{ width: (idx / total) * 100 + '%' }" /></div>

      <!-- flashcard -->
      <section v-if="current.kind === 'flashcard'" class="ex">
        <p class="q">{{ current.card.text }}</p>
        <p v-if="current.card.transcription" class="tr">/{{ current.card.transcription }}/</p>
        <template v-if="!revealed">
          <button class="wide" @click="revealed = true">показать перевод</button>
        </template>
        <template v-else>
          <p class="ans">{{ current.card.translation }}</p>
          <p v-if="current.card.example" class="ex-sent">{{ current.card.example }}</p>
          <div class="pair">
            <button class="wide bad-btn" @click="flashRate(false)">не знал</button>
            <button class="wide ok-btn" @click="flashRate(true)">знал</button>
          </div>
        </template>
      </section>

      <!-- pick: choice / gap / clickable -->
      <section v-else-if="isPick(current.kind)" class="ex">
        <template v-if="current.kind === 'choice'">
          <p class="q">{{ current.card.text }}</p>
          <p v-if="current.card.transcription" class="tr">/{{ current.card.transcription }}/</p>
        </template>
        <template v-else-if="current.kind === 'gap'">
          <p class="hint-line">вставьте слово</p>
          <p class="sent">{{ gapParts[0] }}<span class="blank">?</span>{{ gapParts[1] }}</p>
        </template>
        <template v-else-if="current.kind === 'clickable' && clickParts">
          <p class="hint-line">что значит выделенное слово?</p>
          <p class="sent">{{ clickParts.pre }}<b class="hit">{{ clickParts.hit }}</b>{{ clickParts.post }}</p>
        </template>

        <div class="opts">
          <button
            v-for="o in pickOptions"
            :key="o"
            class="opt-btn"
            :class="pickClass(o)"
            :disabled="!!picked || hintShown"
            @click="pickChoose(o)"
          >
            {{ o }}
          </button>
        </div>

        <p v-if="hintShown" class="ans">{{ peekText }}</p>
        <button v-if="!picked && !hintShown" class="link" @click="hintShown = true">
          подсмотреть перевод
        </button>
        <button v-if="picked || hintShown" class="wide" @click="pickNext">дальше</button>
      </section>

      <!-- match -->
      <section v-else class="ex">
        <p class="hint-line">сопоставьте пары</p>
        <div class="cols">
          <div class="col">
            <button
              v-for="c in matchEx.cards"
              :key="c.word_sense_id"
              class="chip"
              :class="{
                sel: mLeft === c.word_sense_id && !mFlash,
                done: mLocked.has(c.word_sense_id),
                err: mFlash?.left === c.word_sense_id,
              }"
              :disabled="mLocked.has(c.word_sense_id) || mGaveUp || !!mFlash"
              @click="tapLeft(c.word_sense_id)"
            >
              {{ c.text }}
            </button>
          </div>
          <div class="col">
            <button
              v-for="(r, i) in matchEx.rights"
              :key="i"
              class="chip"
              :class="{ done: mLockedR.has(i), err: mFlash?.right === i }"
              :disabled="mLockedR.has(i) || mGaveUp || !!mFlash"
              @click="tapRight(i)"
            >
              {{ r }}
            </button>
          </div>
        </div>

        <ul v-if="mGaveUp" class="reveal">
          <li v-for="c in matchEx.cards" :key="c.word_sense_id">
            {{ c.text }} — {{ c.translation }}
          </li>
        </ul>

        <button v-if="matchDone" class="wide" @click="matchNext">дальше</button>
        <button v-else class="link" @click="matchGiveUp">показать ответы</button>
      </section>
    </template>

    <!-- итог -->
    <template v-else-if="phase === 'summary'">
      <h1>Готово</h1>
      <p class="totals">
        <span class="ok-txt">верно {{ counts.correct }}</span> ·
        <span class="bad-txt">неверно {{ counts.wrong }}</span> ·
        <span class="muted">подсказок {{ counts.hint }}</span>
      </p>

      <p v-if="saving" class="muted">сохраняю…</p>
      <p v-if="saveError" class="err">
        не сохранилось: {{ saveError }}
        <button class="link" @click="save">повторить</button>
      </p>

      <ul class="rev">
        <li v-for="(r, i) in review" :key="i" class="rev-row">
          <span class="rev-mark" :class="r.outcome">{{ mark[r.outcome] }}</span>
          <div class="rev-body">
            <div>
              <b>{{ r.text }}</b>
              <span v-if="r.transcription" class="tr"> /{{ r.transcription }}/</span>
              — {{ r.translation }}
            </div>
            <div v-if="r.example" class="muted small">{{ r.example }}</div>
          </div>
        </li>
      </ul>

      <div class="pair">
        <button class="wide" @click="toFolders">к темам</button>
        <button class="wide ok-btn" @click="again">ещё</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--muted);
}
.track {
  height: 3px;
  background: #23262e;
  border-radius: 2px;
  margin: 0.4rem 0 1.5rem;
}
.track i {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.2s;
}

.ex {
  margin-top: 1rem;
}
.q {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 0.5rem 0 0.25rem;
}
.sent {
  font-size: 1.15rem;
  line-height: 1.6;
  margin: 0.25rem 0 1rem;
}
.blank {
  display: inline-block;
  min-width: 2.5rem;
  text-align: center;
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
}
.hit {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.tr {
  color: var(--muted);
  margin: 0 0 1rem;
}
.ans {
  font-size: 1.3rem;
  margin: 1.25rem 0 0.5rem;
}
.ex-sent {
  color: var(--muted);
  margin: 0 0 1.25rem;
}
.hint-line {
  color: var(--muted);
  margin: 0 0 0.5rem;
}

.wide {
  width: 100%;
  padding: 0.75rem;
  margin-top: 0.75rem;
}
.pair {
  display: flex;
  gap: 0.6rem;
}
.pair .wide {
  flex: 1;
}
.ok-btn {
  background: #17351f;
  border-color: #2f6b3c;
}
.bad-btn {
  background: #3a1c1c;
  border-color: #6b2f2f;
}

.opts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
}
.opt-btn {
  width: 100%;
  padding: 0.75rem;
  text-align: left;
}
.opt-btn.ok {
  background: #17351f;
  border-color: #2f6b3c;
}
.opt-btn.bad {
  background: #3a1c1c;
  border-color: #6b2f2f;
}

.cols {
  display: flex;
  gap: 0.6rem;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chip {
  width: 100%;
  padding: 0.7rem 0.5rem;
  word-break: break-word;
}
.chip.sel {
  border-color: var(--accent);
  background: #1b2740;
}
.chip.done {
  background: #17351f;
  border-color: #2f6b3c;
  opacity: 0.75;
}
.chip.err {
  background: #3a1c1c;
  border-color: #6b2f2f;
}
.reveal {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  color: var(--muted);
}
.reveal li {
  padding: 0.2rem 0;
}

.totals {
  font-size: 1.05rem;
  margin: 0.5rem 0 1rem;
}
.ok-txt {
  color: #6bd68a;
}
.bad-txt {
  color: var(--err);
}
.rev {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
}
.rev-row {
  display: flex;
  gap: 0.6rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid #23262e;
}
.rev-mark {
  flex: none;
  width: 1.4rem;
  text-align: center;
}
.rev-mark.correct {
  color: #6bd68a;
}
.rev-mark.wrong {
  color: var(--err);
}
.rev-body {
  min-width: 0;
}
</style>
