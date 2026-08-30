import { eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { error, json } from '../../_lib/http'
import { lookupRu, type TranslationVariant } from '../../_lib/mymemory'
import { normText } from '../../_lib/normalize'
import { translationCache } from '../../../db/schema'

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const q = normText(new URL(ctx.request.url).searchParams.get('q') ?? '')
  if (!q) return error(400, 'q required')

  const key = `en|ru:${q}`
  const db = getDb(ctx.env)

  const cached = await db
    .select()
    .from(translationCache)
    .where(eq(translationCache.query, key))
    .limit(1)

  const hit = cached[0]
  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_TTL_MS) {
    const payload = hit.responseJson as { variants: TranslationVariant[] }
    console.log(`[lookup] "${q}" — из кэша, ${payload.variants?.length ?? 0} вариантов`)
    return json({ query: q, cached: true, variants: payload.variants ?? [] })
  }

  const outcome = await lookupRu(q, ctx.env.MYMEMORY_EMAIL)
  console.log(
    `[lookup] "${q}" — MyMemory: ok=${outcome.ok} http=${outcome.http} ` +
      `responseStatus=${outcome.responseStatus} email=${outcome.usedEmail} ` +
      `count=${outcome.variants.length} :: ${outcome.detail}`,
  )

  if (!outcome.ok) {
    return json({
      query: q,
      cached: false,
      variants: outcome.variants,
      degraded: true,
      detail: outcome.detail,
    })
  }

  await db
    .insert(translationCache)
    .values({
      query: key,
      responseJson: { variants: outcome.variants },
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: translationCache.query,
      set: { responseJson: { variants: outcome.variants }, fetchedAt: new Date() },
    })

  return json({ query: q, cached: false, variants: outcome.variants })
}
