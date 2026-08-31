import type {
  GlossItem,
  ServerExercise,
  TrainingCard,
  TrainingFormat,
  TrainingSet,
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
}
export interface ClickableExercise {
  kind: 'clickable'
  exercise_id: number
  gloss: GlossItem
  text: string
  target: string
  options: string[]
  answer: string
}
export type Exercise =
  | MatchExercise
  | FlashcardExercise
  | ChoiceExercise
  | GapExercise
  | ClickableExercise

const norm = (s: string) => s.trim().toLowerCase()

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

function toContextExercise(se: ServerExercise): Exercise | null {
  const p = se.payload
  const gloss = p.glossary?.[0]
  if (!gloss) return null
  if (p.kind === 'gap') {
    return {
      kind: 'gap',
      exercise_id: se.id,
      gloss,
      text: p.text,
      bank: p.bank,
      answer: p.answer,
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
  }
}

export function buildExercises(
  set: TrainingSet,
  context: ServerExercise[] = [],
  format: TrainingFormat = 'mix',
): Exercise[] {
  const pool = set.distractor_pool ?? []

  // контекстные упражнения от ИИ — по одному на значение (в режиме «карточки» игнор)
  const ctxBySense = new Map<number, Exercise>()
  if (format !== 'cards') {
    for (const se of context) {
      const ex = toContextExercise(se)
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
