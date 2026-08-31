import { getDb } from '../_lib/db'
import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { json } from '../_lib/http'
import { DAILY_LIMIT, quotaLeft } from '../_lib/quota'

/** Остаток дневной квоты OpenRouter (общий на приложение). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const left = ctx.env.OPENROUTER_API_KEY ? await quotaLeft(getDb(ctx.env)) : 0
  return json({ left, limit: DAILY_LIMIT, enabled: !!ctx.env.OPENROUTER_API_KEY })
}
