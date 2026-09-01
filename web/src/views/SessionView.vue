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
import Sparkles from '@/components/Sparkles.vue'

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
  exercises.value = buildExercises(session.set, session.context, session.format)
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
function toProgress() {
  endSession()
  router.push('/')
}

const pad = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <main class="page">
    <template v-if="phase === 'run' && current">
      <div class="bar">
        <span class="mono">{{ pad(idx + 1) }} / {{ pad(total) }}</span>
        <button class="link" @click="finalize">завершить</button>
      </div>
      <div class="track"><i :style="{ width: (idx / total) * 100 + '%' }" /></div>

      <!-- flashcard -->
      <section v-if="current.kind === 'flashcard'" class="ex">
        <p class="q disp">{{ current.card.text }}</p>
        <p v-if="current.card.transcription" class="tr mono">/{{ current.card.transcription }}/</p>
        <template v-if="!revealed">
          <button class="wide" @click="revealed = true">показать перевод</button>
        </template>
        <template v-else>
          <p class="ans disp">{{ current.card.translation }}</p>
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
          <p class="q disp">{{ current.card.text }}</p>
          <p v-if="current.card.transcription" class="tr mono">/{{ current.card.transcription }}/</p>
        </template>
        <template v-else-if="current.kind === 'gap'">
          <p class="label hint-line">вставьте слово</p>
          <p class="sent">{{ gapParts[0] }}<span class="blank mono">?</span>{{ gapParts[1] }}</p>
        </template>
        <template v-else-if="current.kind === 'clickable' && clickParts">
          <p class="label hint-line">что значит выделенное слово?</p>
          <p class="sent">{{ clickParts.pre }}<b class="hit mono">{{ clickParts.hit }}</b>{{ clickParts.post }}</p>
        </template>

        <div class="opts">
          <button
            v-for="o in pickOptions"
            :key="o"
            class="opt-btn"
            :class="[pickClass(o), current.kind === 'gap' ? 'mono' : 'disp']"
            :disabled="!!picked || hintShown"
            @click="pickChoose(o)"
          >
            {{ o }}
            <svg
              v-if="pickClass(o) === 'ok'"
              class="mk"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="m5 13 4 4 10-11" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>

        <p v-if="hintShown" class="ans disp">{{ peekText }}</p>
        <button v-if="!picked && !hintShown" class="link peek" @click="hintShown = true">
          подсмотреть перевод
        </button>
        <div v-if="picked || hintShown" class="frame next-frame">
          <button class="primary wide" @click="pickNext">дальше</button>
        </div>
      </section>

      <!-- match -->
      <section v-else class="ex">
        <p class="label hint-line">сопоставьте пары</p>
        <div class="cols">
          <div class="col">
            <button
              v-for="c in matchEx.cards"
              :key="c.word_sense_id"
              class="chip mono"
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
              class="chip disp"
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
            <b class="mono">{{ c.text }}</b> — {{ c.translation }}
          </li>
        </ul>

        <div v-if="matchDone" class="frame next-frame">
          <button class="primary wide" @click="matchNext">дальше</button>
        </div>
        <button v-else class="link peek" @click="matchGiveUp">показать ответы</button>
      </section>
    </template>

    <!-- итог -->
    <template v-else-if="phase === 'summary'">
      <Sparkles
        :spots="[
          { pos: { top: '18px', right: '18px' }, size: 18, color: '#ffc23d', delay: 0 },
          { pos: { top: '50px', right: '60px' }, size: 11, color: '#b6f04a', delay: 0.7 },
          { pos: { top: '92px', right: '30px' }, size: 13, color: '#ff6ba6', delay: 1.5 },
          { pos: { top: '14px', left: '120px' }, size: 10, color: '#8fa8ff', delay: 2.2 },
        ]"
      />
      <p class="label">готово</p>

      <div class="frame score-frame">
        <div class="score">
          <span class="mono big">{{ counts.correct }}</span>
          <span class="mono of">/{{ total }}</span>
        </div>
      </div>
      <p class="mono totals">
        <span class="ok-txt">верно {{ counts.correct }}</span> ·
        <span class="bad-txt">неверно {{ counts.wrong }}</span> ·
        <span class="muted">подсказок {{ counts.hint }}</span>
      </p>

      <p v-if="saving" class="muted">сохраняю…</p>
      <p v-if="saveError" class="err">
        не сохранилось: {{ saveError }}
        <button class="link" @click="save">повторить</button>
      </p>

      <p class="label rev-label">разбор</p>
      <ul class="rev">
        <li v-for="(r, i) in review" :key="i" class="rev-row">
          <span class="rev-mark" :class="r.outcome" aria-hidden="true">
            <svg v-if="r.outcome === 'correct'" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg v-else-if="r.outcome === 'wrong'" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.2" />
              <path d="M12 8v4l3 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          </span>
          <div class="rev-body">
            <div class="rev-head">
              <b class="mono">{{ r.text }}</b>
              <span v-if="r.transcription" class="tr mono"> /{{ r.transcription }}/</span>
              <span class="muted"> — {{ r.translation }}</span>
            </div>
            <div v-if="r.example" class="muted small">{{ r.example }}</div>
          </div>
        </li>
      </ul>

      <div class="pair">
        <button class="wide" @click="toProgress">к прогрессу</button>
        <div class="frame" style="flex: 1">
          <button class="primary wide" @click="again">ещё</button>
        </div>
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
  font-weight: 700;
  font-size: 0.8rem;
}
.track {
  height: 6px;
  background: var(--raise);
  border-radius: var(--r-pill);
  margin: 0.5rem 0 2.2rem;
}
.track i {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--hero-a), #6a8cff);
  box-shadow: 0 0 12px rgba(34, 217, 179, 0.5);
  transition: width 0.2s;
}

.ex {
  margin-top: 0.5rem;
}
.q {
  font-size: 1.7rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0.5rem 0 0.25rem;
}
.hint-line {
  display: block;
  margin: 0 0 1rem;
}
.sent {
  font-size: 1.18rem;
  line-height: 1.65;
  color: var(--fg-dim);
  margin: 0.25rem 0 2rem;
}
.blank {
  display: inline-block;
  min-width: 3rem;
  text-align: center;
  font-weight: 700;
  color: var(--hero-a);
  border-bottom: 2px solid var(--hero-a);
}
.hit {
  font-weight: 700;
  color: var(--hero-a);
  border-bottom: 2px solid var(--hero-a);
}
.tr {
  color: var(--faint);
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.ans {
  font-size: 1.35rem;
  font-weight: 800;
  margin: 1.25rem 0 0.5rem;
}
.ex-sent {
  color: var(--muted);
  margin: 0 0 1.25rem;
}

.wide {
  width: 100%;
  padding: 0.9rem;
}
.pair {
  display: flex;
  gap: 0.6rem;
}
.pair > .wide,
.pair > .frame {
  flex: 1;
}

.opts {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin: 1rem 0;
}
.opt-btn {
  width: 100%;
  padding: 0.9rem 1.1rem;
  text-align: left;
  background: var(--card);
  color: var(--fg-dim);
  font-weight: 500;
  font-size: 1rem;
  text-transform: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.opt-btn.disp {
  font-weight: 700;
}
.opt-btn.ok {
  background: var(--grad-ok);
  color: var(--ok-ink);
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.opt-btn.bad {
  background: var(--grad-bad);
  color: var(--bad-ink);
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
.opt-btn .mk {
  flex: none;
}

.peek {
  display: block;
  text-align: center;
  width: 100%;
  margin: 0.5rem 0;
  padding: 0.5rem 0;
}
.next-frame {
  margin-top: 0.85rem;
}

.cols {
  display: flex;
  gap: 0.55rem;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chip {
  width: 100%;
  padding: 0.9rem 0.6rem;
  word-break: break-word;
  background: var(--card);
  color: var(--fg-dim);
  font-weight: 700;
  font-size: 0.95rem;
  text-transform: none;
  text-align: left;
}
.chip.disp {
  font-weight: 800;
}
.chip.sel {
  background: #17223a;
  color: var(--fg);
  outline: 2px solid var(--sapphire-b);
}
.chip.done {
  background: var(--grad-ok);
  color: var(--ok-ink);
  opacity: 0.72;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.chip.err {
  background: var(--grad-bad);
  color: var(--bad-ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.reveal {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  color: var(--muted);
}
.reveal li {
  padding: 0.25rem 0;
}

/* --- итог --- */
.score-frame {
  margin: 0.4rem 0 0.75rem;
}
.score {
  background: #17190f;
  padding: 0.75rem 1.1rem;
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  overflow: hidden;
}
.score .big {
  font-weight: 700;
  font-size: 4.75rem;
  line-height: 0.78;
  color: var(--ok-text);
}
.score .of {
  font-weight: 500;
  font-size: 1.5rem;
  line-height: 1.7;
  color: var(--faint);
}
.totals {
  font-size: 0.78rem;
  margin: 0 0 1.5rem;
}
.ok-txt {
  color: var(--ok-text);
}
.bad-txt {
  color: var(--bad-text);
}
.rev-label {
  display: block;
  margin: 0 0 0.6rem;
}
.rev {
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem;
}
.rev-row {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 0.15rem;
  border-bottom: 1px solid var(--line);
}
.rev-mark {
  flex: none;
  margin-top: 0.15rem;
  display: flex;
}
.rev-mark.correct {
  color: var(--ok-text);
}
.rev-mark.wrong {
  color: var(--bad-text);
}
.rev-mark.hint {
  color: var(--faint);
}
.rev-body {
  min-width: 0;
}
.rev-head {
  font-size: 0.9rem;
}
.rev-head .tr {
  margin: 0;
}
</style>
