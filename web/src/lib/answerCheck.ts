import { norm } from './exercises'

/**
 * Проверка вписанного ответа для упражнения «ввод перевода» (`typed`).
 * Эталон может перечислять несколько приемлемых вариантов через `,` `;` `/`.
 * Опечатки прощаются только для рус→англ (направление 'ru2en') — расстояние
 * Дамерау-Левенштейна ≤1 до ближайшего варианта даёт 'almost'. Для англ→рус
 * только точное совпадение (ё=е уже гасится норм. `norm()`).
 */
export type TypedVerdict = 'correct' | 'almost' | 'wrong'

/** Расстояние Дамерау-Левенштейна (со транспозициями), обрезано после 2 — дальше не важно. */
function editDistance(a: string, b: string): number {
  const al = a.length
  const bl = b.length
  if (Math.abs(al - bl) > 2) return 3
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0))
  for (let i = 0; i <= al; i++) d[i]![0] = i
  for (let j = 0; j <= bl; j++) d[0]![j] = j
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
      }
    }
  }
  return d[al]![bl]!
}

export function checkTypedAnswer(
  input: string,
  reference: string,
  direction: 'en2ru' | 'ru2en',
): TypedVerdict {
  const guess = norm(input)
  if (!guess) return 'wrong'
  const variants = reference
    .split(/[,;/]/)
    .map((s) => norm(s))
    .filter(Boolean)
  if (!variants.length) return 'wrong'
  if (variants.includes(guess)) return 'correct'
  if (direction === 'ru2en' && variants.some((v) => editDistance(guess, v) <= 1)) {
    return 'almost'
  }
  return 'wrong'
}
