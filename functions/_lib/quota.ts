import { eq, sql } from 'drizzle-orm'
import type { Db } from './db'
import { quotaUsage } from '../../db/schema'

/** Лимит OpenRouter на бесплатном ключе: 50 запросов/день (сброс по UTC-полуночи). */
export const DAILY_LIMIT = 50

export function utcDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export async function quotaLeft(db: Db): Promise<number> {
  const rows = await db
    .select({ count: quotaUsage.count })
    .from(quotaUsage)
    .where(eq(quotaUsage.date, utcDate()))
  return Math.max(DAILY_LIMIT - (rows[0]?.count ?? 0), 0)
}

/** +1 к сегодняшнему счётчику, вернуть остаток. Вызывать только перед реальным запросом. */
export async function bumpQuota(db: Db): Promise<number> {
  const [row] = await db
    .insert(quotaUsage)
    .values({ date: utcDate(), count: 1 })
    .onConflictDoUpdate({
      target: quotaUsage.date,
      set: { count: sql`${quotaUsage.count} + 1` },
    })
    .returning({ count: quotaUsage.count })
  return Math.max(DAILY_LIMIT - (row?.count ?? DAILY_LIMIT), 0)
}

/** Вернуть единицу квоты, если запрос не дошёл до модели (сеть/таймаут/HTTP-ошибка). */
export async function refundQuota(db: Db): Promise<number> {
  const [row] = await db
    .update(quotaUsage)
    .set({ count: sql`greatest(${quotaUsage.count} - 1, 0)` })
    .where(eq(quotaUsage.date, utcDate()))
    .returning({ count: quotaUsage.count })
  return Math.max(DAILY_LIMIT - (row?.count ?? 0), 0)
}

/** Обнулить остаток на сегодня — при 429 «дневной лимит» от OpenRouter. Сброс по UTC. */
export async function exhaustQuota(db: Db): Promise<void> {
  await db
    .insert(quotaUsage)
    .values({ date: utcDate(), count: DAILY_LIMIT })
    .onConflictDoUpdate({
      target: quotaUsage.date,
      set: { count: DAILY_LIMIT },
    })
}
