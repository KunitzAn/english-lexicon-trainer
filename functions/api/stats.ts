import { and, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '../_lib/db'
import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { json } from '../_lib/http'
import { utcDate } from '../_lib/quota'
import { attempts, words, wordSenses, wordSenseProgress } from '../../db/schema'

/**
 * Текущая серия дней подряд с хотя бы одной попыткой — по UTC-суткам
 * (та же граница, что у квоты OpenRouter). Считается «живой», пока сегодня
 * ещё можно позаниматься: если сегодня попыток ещё не было, но вчера были —
 * серия не обнулена, просто ещё не продлена на сегодня.
 */
function computeStreak(days: Set<string>): number {
  const oneDay = 86_400_000
  let cursor = Date.now()
  if (!days.has(utcDate(new Date(cursor)))) {
    cursor -= oneDay
    if (!days.has(utcDate(new Date(cursor)))) return 0
  }
  let n = 0
  while (days.has(utcDate(new Date(cursor)))) {
    n++
    cursor -= oneDay
  }
  return n
}

/** Сводка для главной — минимальный набор (этап 6, шаг 4, v1). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const uid = ctx.data.userId
  const db = getDb(ctx.env)

  const [w] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(words)
    .where(and(eq(words.userId, uid), isNull(words.deletedAt)))

  const [s] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wordSenses)
    .innerJoin(words, eq(wordSenses.wordId, words.id))
    .where(
      and(
        eq(words.userId, uid),
        isNull(words.deletedAt),
        isNull(wordSenses.deletedAt),
      ),
    )

  const [p] = await db
    .select({
      attempted: sql<number>`count(*)::int`,
      correct: sql<number>`coalesce(sum(${wordSenseProgress.correctCount}), 0)::int`,
      incorrect: sql<number>`coalesce(sum(${wordSenseProgress.incorrectCount}), 0)::int`,
    })
    .from(wordSenseProgress)
    .where(eq(wordSenseProgress.userId, uid))

  const dayRows = await db
    .selectDistinct({
      day: sql<string>`to_char(${attempts.answeredAt} at time zone 'utc', 'YYYY-MM-DD')`,
    })
    .from(attempts)
    .where(eq(attempts.userId, uid))

  const correct = p?.correct ?? 0
  const incorrect = p?.incorrect ?? 0

  return json({
    words_total: w?.n ?? 0,
    senses_total: s?.n ?? 0,
    senses_attempted: p?.attempted ?? 0,
    correct,
    incorrect,
    accuracy: correct + incorrect > 0 ? correct / (correct + incorrect) : null,
    streak_days: computeStreak(new Set(dayRows.map((r) => r.day))),
    active_days: dayRows.length,
  })
}
