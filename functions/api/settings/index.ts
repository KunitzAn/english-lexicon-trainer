import { eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import {
  DEFAULT_MASTERY_SETTINGS,
  loadMasterySettings,
  mergeMasterySettings,
} from '../../_lib/mastery'
import { users } from '../../../db/schema'

/** Настройки пользователя. Пока только модель выученности (этап 5.1). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  const mastery = await loadMasterySettings(db, ctx.data.userId)
  return json({ mastery, mastery_defaults: DEFAULT_MASTERY_SETTINGS })
}

/** Сохранить настройки выученности. Тело: { mastery: {...} } (частичное — сольём с дефолтами). */
export const onRequestPut: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ mastery?: unknown }>(ctx.request)
  if (!body || typeof body !== 'object') return error(400, 'body required')

  const db = getDb(ctx.env)
  const uid = ctx.data.userId
  const merged = mergeMasterySettings(body.mastery)

  const [u] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, uid))
  const prev = (u?.settings as Record<string, unknown> | null) ?? {}

  await db
    .update(users)
    .set({ settings: { ...prev, mastery: merged } })
    .where(eq(users.id, uid))

  return json({ mastery: merged })
}

/** Сбросить настройки выученности к средним. */
export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  const uid = ctx.data.userId
  const [u] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, uid))
  const prev = { ...((u?.settings as Record<string, unknown> | null) ?? {}) }
  delete prev.mastery
  await db.update(users).set({ settings: prev }).where(eq(users.id, uid))
  return json({ mastery: DEFAULT_MASTERY_SETTINGS })
}
