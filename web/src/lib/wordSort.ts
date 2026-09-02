/** Порядок отображения списка слов (этап 5.1). На подбор в упражнениях не влияет. */
export type WordSortMode = 'learned' | 'unlearned' | 'newest' | 'oldest'

export const WORD_SORT_MODES: WordSortMode[] = [
  'learned',
  'unlearned',
  'newest',
  'oldest',
]

export const WORD_SORT_LABEL: Record<WordSortMode, string> = {
  learned: 'сначала выученные',
  unlearned: 'сначала невыученные',
  newest: 'сначала новые',
  oldest: 'сначала старые',
}

export function nextSortMode(m: WordSortMode): WordSortMode {
  return WORD_SORT_MODES[(WORD_SORT_MODES.indexOf(m) + 1) % WORD_SORT_MODES.length]!
}

/** id как прокси даты добавления: меньше id → раньше добавлено. */
export function sortWords<T extends { id: number; mastery?: number }>(
  list: readonly T[],
  mode: WordSortMode,
): T[] {
  const m = (w: T) => w.mastery ?? 0
  const a = [...list]
  switch (mode) {
    case 'learned':
      return a.sort((x, y) => m(y) - m(x) || x.id - y.id)
    case 'unlearned':
      return a.sort((x, y) => m(x) - m(y) || x.id - y.id)
    case 'newest':
      return a.sort((x, y) => y.id - x.id)
    case 'oldest':
      return a.sort((x, y) => x.id - y.id)
  }
}
