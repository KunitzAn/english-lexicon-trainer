import type { TrainingCard, TrainingSet } from './types'

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
export type Exercise = MatchExercise | FlashcardExercise | ChoiceExercise

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

/** Разбить карточки на группы для сопоставления пар (по 3..5, хвост <3 отбрасываем). */
function matchGroups(cards: TrainingCard[]): TrainingCard[][] {
  const groups: TrainingCard[][] = []
  for (let i = 0; i < cards.length; i += 4) {
    const g = cards.slice(i, i + 4)
    if (g.length >= 3) groups.push(g)
    else if (groups.length) groups[groups.length - 1]!.push(...g) // добить последнюю (до 6)
  }
  return groups
}

export function buildExercises(set: TrainingSet): Exercise[] {
  const cards = shuffle(set.cards)
  const pool = set.distractor_pool ?? []

  // ~40% карточек уходит в сопоставление пар, если их хватает на группу
  const matchN =
    cards.length >= 3
      ? Math.min(cards.length, Math.max(3, Math.round(cards.length * 0.4)))
      : 0
  const forMatch = cards.slice(0, matchN)
  const rest = cards.slice(matchN)

  const exercises: Exercise[] = []

  for (const g of matchGroups(forMatch)) {
    exercises.push({
      kind: 'match',
      cards: g,
      rights: shuffle(g.map((c) => c.translation)),
    })
  }

  rest.forEach((card, i) => {
    const others = set.cards
      .filter((c) => c.word_sense_id !== card.word_sense_id)
      .map((c) => c.translation)
    const distractors = distractorsFor(card.translation, others, pool, 3)
    if (i % 3 === 0 || distractors.length < 2) {
      exercises.push({ kind: 'flashcard', card })
    } else {
      exercises.push({
        kind: 'choice',
        card,
        answer: card.translation,
        options: shuffle([card.translation, ...distractors]),
      })
    }
  })

  return shuffle(exercises)
}

export function isChoiceCorrect(ex: ChoiceExercise, picked: string): boolean {
  return norm(picked) === norm(ex.answer)
}
