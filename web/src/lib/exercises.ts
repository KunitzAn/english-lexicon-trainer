import type {
  GlossItem,
  ServerExercise,
  TrainingCard,
  TrainingFormat,
  TrainingSet,
  WordGloss,
} from './types'

export interface MatchExercise {
  kind: 'match'
  cards: TrainingCard[] // 3..5
  rights: string[] // переводы карточек, перемешанные
}
export interface FlashcardExercise {
  kind: 'flashcard'
  card: TrainingCard
}
export interface ChoiceExercise {
  kind: 'choice'
  card: TrainingCard
  options: string[] // включая правильный, перемешаны
  answer: string
}
export interface GapExercise {
  kind: 'gap'
  exercise_id: number
  gloss: GlossItem
  text: string
  bank: string[]
  answer: string
  wordGloss?: WordGloss
}
export interface ClickableExercise {
  kind: 'clickable'
  exercise_id: number
  gloss: GlossItem
  text: string
  target: string
  options: string[]
  answer: string
  wordGloss?: WordGloss
}
export type Exercise =
  | MatchExercise
  | FlashcardExercise
  | ChoiceExercise
  | GapExercise
  | ClickableExercise

/** Нормализация для сравнения ответов: ё=е, без регистра и краевых пробелов. */
export const norm = (s: string) =>
  s.normalize('NFC').trim().toLowerCase().replace(/ё/g, 'е')

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Уникальные ответу дистракторы: сначала из соседних карточек, потом из общего пула. */
function distractorsFor(
  answer: string,
  others: string[],
  pool: string[],
  n = 3,
): string[] {
  const seen = new Set([norm(answer)])
  const out: string[] = []
  for (const src of [shuffle(others), shuffle(pool)]) {
    for (const t of src) {
      const k = norm(t)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(t)
      if (out.length === n) return out
    }
  }
  return out
}

/** Разбить карточки на группы для сопоставления пар (по 3..5, хвост <3 добиваем в последнюю). */
function matchGroups(cards: TrainingCard[]): TrainingCard[][] {
  const groups: TrainingCard[][] = []
  for (let i = 0; i < cards.length; i += 4) {
    const g = cards.slice(i, i + 4)
    if (g.length >= 3) groups.push(g)
    else if (groups.length) groups[groups.length - 1]!.push(...g)
  }
  return groups
}

/**
 * Банк для `gap`: правильный ответ + дистракторы из английских слов текущего
 * набора тренировки (чтобы нельзя было угадать «своё» слово из списка, не
 * помня перевод). Если слов в наборе мало — добираем из банка модели.
 */
function gapBank(answer: string, text: string, enPool: string[], llmBank: string[]): string[] {
  const textLc = text.toLowerCase()
  const seen = new Set([norm(answer)])
  const distractors: string[] = []
  for (const src of [enPool, llmBank]) {
    for (const t of src) {
      const k = norm(t)
      if (seen.has(k) || textLc.includes(k)) continue
      seen.add(k)
      distractors.push(t)
      if (distractors.length === 3) break
    }
    if (distractors.length === 3) break
  }
  return shuffle([answer, ...distractors])
}

function toContextExercise(se: ServerExercise, enPool: string[]): Exercise | null {
  const p = se.payload
  const gloss = p.glossary?.[0]
  if (!gloss) return null
  if (p.kind === 'gap') {
    return {
      kind: 'gap',
      exercise_id: se.id,
      gloss,
      text: p.text,
      bank: gapBank(p.answer, p.text, enPool, p.bank ?? []),
      answer: p.answer,
      wordGloss: p.gloss,
    }
  }
  return {
    kind: 'clickable',
    exercise_id: se.id,
    gloss,
    text: p.text,
    target: p.target,
    options: p.options,
    answer: p.answer,
    wordGloss: p.gloss,
  }
}

export function buildExercises(
  set: TrainingSet,
  context: ServerExercise[] = [],
  format: TrainingFormat = 'mix',
): Exercise[] {
  const pool = set.distractor_pool ?? []
  // английские слова набора — дистракторы для gap
  const enPool = shuffle(set.cards.map((c) => c.text))

  // контекстные упражнения от ИИ — по одному на значение (в режиме «карточки» игнор)
  const ctxBySense = new Map<number, Exercise>()
  if (format !== 'cards') {
    for (const se of context) {
      const ex = toContextExercise(se, enPool)
      if (ex && !ctxBySense.has(se.payload.word_sense_id)) {
        ctxBySense.set(se.payload.word_sense_id, ex)
      }
    }
  }

  const cards = shuffle(set.cards)

  // раунды «пары» — в mix и cards, из значений без контекстного упражнения
  const useMatch = format !== 'context'
  const plain = cards.filter((c) => !ctxBySense.has(c.word_sense_id))
  const matchN =
    useMatch && plain.length >= 3
      ? Math.min(plain.length, Math.max(3, Math.round(plain.length * 0.4)))
      : 0
  const forMatch = plain.slice(0, matchN)
  const inMatch = new Set(forMatch.map((c) => c.word_sense_id))

  const exercises: Exercise[] = []
  for (const g of matchGroups(forMatch)) {
    exercises.push({
      kind: 'match',
      cards: g,
      rights: shuffle(g.map((c) => c.translation)),
    })
  }

  let i = 0
  for (const card of cards) {
    if (inMatch.has(card.word_sense_id)) continue
    const ctx = ctxBySense.get(card.word_sense_id)
    if (ctx) {
      exercises.push(ctx)
      continue
    }
    const others = set.cards
      .filter((c) => c.word_sense_id !== card.word_sense_id)
      .map((c) => c.translation)
    const distractors = distractorsFor(card.translation, others, pool, 3)
    const canChoice = distractors.length >= 2
    // в «контексте» карточек нет — только выбор (карточка лишь если выбор не собрать)
    const wantFlash = format !== 'context' && i % 3 === 0
    if (!canChoice || wantFlash) {
      exercises.push({ kind: 'flashcard', card })
    } else {
      exercises.push({
        kind: 'choice',
        card,
        answer: card.translation,
        options: shuffle([card.translation, ...distractors]),
      })
    }
    i++
  }

  return shuffle(exercises)
}

export function optIsCorrect(answer: string, picked: string): boolean {
  return norm(picked) === norm(answer)
}
