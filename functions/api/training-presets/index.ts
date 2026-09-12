import { count, eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { trainingPresets } from '../../../db/schema'

const MAX_PRESETS = 30
/** Config — целиком клиентская структура (блоки/раунды/источник слов); только грубые лимиты. */
const MAX_CONFIG_BYTES = 8000

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  const rows = await db
    .select({
      id: trainingPresets.id,
      name: trainingPresets.name,
      config: trainingPresets.config,
    })
    .from(trainingPresets)
    .where(eq(trainingPresets.userId, ctx.data.userId))
    .orderBy(trainingPresets.createdAt)

  return json({ presets: rows })
}

export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ name?: unknown; config?: unknown }>(ctx.request)
  const name = str(body?.name)?.slice(0, 60)
  if (!name) return error(400, 'name required')
  if (!body?.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
    return error(400, 'config required')
  }
  if (JSON.stringify(body.config).length > MAX_CONFIG_BYTES) {
    return error(400, 'config too large')
  }

  const db = getDb(ctx.env)
  const uid = ctx.data.userId

  const [row0] = await db
    .select({ n: count() })
    .from(trainingPresets)
    .where(eq(trainingPresets.userId, uid))
  if ((row0?.n ?? 0) >= MAX_PRESETS) return error(409, 'too many presets')

  const [row] = await db
    .insert(trainingPresets)
    .values({ userId: uid, name, config: body.config })
    .returning({
      id: trainingPresets.id,
      name: trainingPresets.name,
      config: trainingPresets.config,
    })

  return json({ preset: row }, { status: 201 })
}
