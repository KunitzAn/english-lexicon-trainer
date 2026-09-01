import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { trainingSessions } from '../../../db/schema'

/** Сессию старше этого срока считаем мёртвой — resume не предлагаем, подчищаем. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000
/** Потолок на размер state (набор из 25 упражнений — единицы КБ). */
const MAX_STATE_BYTES = 256 * 1024

/** Текущая активная сессия тренировки пользователя (или null). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  const [row] = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.userId, ctx.data.userId))

  if (!row) return json({ session: null })

  if (Date.now() - new Date(row.updatedAt).getTime() > STALE_MS) {
    await db
      .delete(trainingSessions)
      .where(eq(trainingSessions.userId, ctx.data.userId))
    return json({ session: null })
  }

  return json({
    session: {
      id: row.id,
      state: row.state,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    },
  })
}

/** Создать / заменить активную сессию (одна на юзера). Тело: { state }. */
export const onRequestPut: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ state?: unknown }>(ctx.request)
  const state = body?.state
  if (!state || typeof state !== 'object') return error(400, 'state required')
  if (JSON.stringify(state).length > MAX_STATE_BYTES) {
    return error(413, 'state too large')
  }

  const db = getDb(ctx.env)
  const [row] = await db
    .insert(trainingSessions)
    .values({ userId: ctx.data.userId, state })
    .onConflictDoUpdate({
      target: trainingSessions.userId,
      set: { state, updatedAt: sql`now()` },
    })
    .returning({ id: trainingSessions.id, updatedAt: trainingSessions.updatedAt })

  return json({ session: row ? { id: row.id, updated_at: row.updatedAt } : null })
}

/** Завершить / сбросить сессию. */
export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  await db
    .delete(trainingSessions)
    .where(eq(trainingSessions.userId, ctx.data.userId))
  return json({ ok: true })
}
