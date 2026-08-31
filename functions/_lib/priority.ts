/**
 * Стартовая формула приоритизации (см. PLAN.md §3):
 *   accuracy = correct / (correct + incorrect + 1)
 *   recency  = min(days_since_last_trained / 14, 1)
 *   priority = 0.6 * (1 - accuracy) + 0.4 * recency
 * Новые значения (без попыток) → priority = 0.9.
 * Формула черновая, настраивается на реальных данных.
 */

export const NEW_PRIORITY = 0.9
export const RECENCY_DAYS = 14
/** Доля новых значений в автоподборе (ориентир, настраивается). */
export const NEW_SHARE = 0.4

export interface ProgressLike {
  correctCount: number
  incorrectCount: number
  lastTrainedAt: Date | string | null
}

export function isNew(p: ProgressLike | null | undefined): boolean {
  return !p || (p.correctCount === 0 && p.incorrectCount === 0)
}

export function priorityOf(
  p: ProgressLike | null | undefined,
  now: number = Date.now(),
): number {
  if (isNew(p)) return NEW_PRIORITY
  const { correctCount, incorrectCount, lastTrainedAt } = p!
  const accuracy = correctCount / (correctCount + incorrectCount + 1)
  const lastMs = lastTrainedAt ? new Date(lastTrainedAt).getTime() : null
  const days =
    lastMs == null ? RECENCY_DAYS : Math.max(now - lastMs, 0) / 86_400_000
  const recency = Math.min(days / RECENCY_DAYS, 1)
  return 0.6 * (1 - accuracy) + 0.4 * recency
}
