import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import {
  currentMasterySettings,
  DEFAULT_MASTERY_SETTINGS,
  loadMasteryHistory,
  localDay,
  mergeMasterySettings,
  resetMasterySettings,
  saveMasterySettings,
  tzOffsetOf,
} from '../../_lib/mastery'

/** Настройки пользователя. Пока только модель выученности (этап 5.1). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  const history = await loadMasteryHistory(db, ctx.data.userId)
  return json({
    mastery: currentMasterySettings(history),
    mastery_defaults: DEFAULT_MASTERY_SETTINGS,
    mastery_applies_to_past: history.length <= 1,
  })
}

/**
 * Сохранить настройки выученности. Тело: { mastery: {...}, apply_to_past?: bool }.
 * `apply_to_past` (по умолчанию true — как было раньше) — пересчитать всю
 * историю новыми настройками; `false` — действуют только с сегодняшнего дня,
 * прошлое остаётся посчитанным по прежним настройкам. День определяется по
 * `?tz_offset=` (минуты к востоку от UTC), как и остальная выученность.
 */
export const onRequestPut: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ mastery?: unknown; apply_to_past?: unknown }>(
    ctx.request,
  )
  if (!body || typeof body !== 'object') return error(400, 'body required')

  const db = getDb(ctx.env)
  const uid = ctx.data.userId
  const merged = mergeMasterySettings(body.mastery)
  const applyToPast = body.apply_to_past !== false

  const offsetMin = tzOffsetOf(new URL(ctx.request.url))
  await saveMasterySettings(db, uid, merged, applyToPast, localDay(Date.now(), offsetMin))

  return json({ mastery: merged, applied_to_past: applyToPast })
}

/** Сбросить настройки выученности к средним — полностью, ретроактивно. */
export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  await resetMasterySettings(db, ctx.data.userId)
  return json({ mastery: DEFAULT_MASTERY_SETTINGS })
}
