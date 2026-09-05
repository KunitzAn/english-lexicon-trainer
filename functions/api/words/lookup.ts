import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { normText } from '../../_lib/normalize'
import { translationCache, words } from '../../../db/schema'

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface CachedVariant {
  translation: string
  source: 'api'
}

/** Чтение кэша. MyMemory дёргает браузер (лимит по IP → нельзя из Worker). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const q = normText(new URL(ctx.request.url).searchParams.get('q') ?? '')
  if (!q) return error(400, 'q required')

  const db = getDb(ctx.env)

  // уже ли это слово в личном словаре — заодно с переводом, без лишнего запроса
  // (используется всплывашкой «тап по слову в упражнении»)
  const existing = (
    await db
      .select({ id: words.id })
      .from(words)
      .where(
        and(
          eq(words.userId, ctx.data.userId),
          eq(words.textNorm, q),
          isNull(words.deletedAt),
        ),
      )
      .limit(1)
  )[0]
  const in_vocabulary = !!existing

  const hit = (
    await db
      .select()
      .from(translationCache)
      .where(eq(translationCache.query, `en|ru:${q}`))
      .limit(1)
  )[0]

  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_TTL_MS) {
    const payload = hit.responseJson as { variants: CachedVariant[] }
    return json({ query: q, cached: true, variants: payload.variants ?? [], in_vocabulary })
  }
  return json({ query: q, cached: false, variants: [], in_vocabulary })
}

/** Запись кэша: браузер присылает результат MyMemory. */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ q?: unknown; variants?: unknown }>(ctx.request)
  const q = normText(str(body?.q) ?? '')
  if (!q) return error(400, 'q required')

  const variants: CachedVariant[] = Array.isArray(body?.variants)
    ? (body!.variants as unknown[])
        .map((v) => ({
          translation: String((v as { translation?: unknown })?.translation ?? '')
            .trim()
            .slice(0, 80),
          source: 'api' as const,
        }))
        .filter((v) => v.translation)
        .slice(0, 12)
    : []

  const db = getDb(ctx.env)
  await db
    .insert(translationCache)
    .values({ query: `en|ru:${q}`, responseJson: { variants }, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: translationCache.query,
      set: { responseJson: { variants }, fetchedAt: new Date() },
    })

  return json({ ok: true })
}
