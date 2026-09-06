import { eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { normText } from '../../_lib/normalize'
import { translationCache } from '../../../db/schema'

// IPA не устаревает — держим дольше переводов
const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000
const keyFor = (q: string) => `ipa:en:${q}`

/** Транскрипция без косых скобок, ограниченная длина. Пустое → null. */
export function cleanIpa(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v
    .trim()
    .replace(/^[/[]+/, '')
    .replace(/[/\]]+$/, '')
    .trim()
    .slice(0, 64)
  return s || null
}

/** Чтение кэша транскрипции. Free Dictionary API дёргает браузер (как MyMemory). */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const q = normText(new URL(ctx.request.url).searchParams.get('q') ?? '')
  if (!q) return error(400, 'q required')

  const db = getDb(ctx.env)
  const hit = (
    await db
      .select()
      .from(translationCache)
      .where(eq(translationCache.query, keyFor(q)))
      .limit(1)
  )[0]

  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_TTL_MS) {
    const payload = hit.responseJson as { ipa: string | null }
    return json({ query: q, cached: true, ipa: payload.ipa ?? null })
  }
  return json({ query: q, cached: false, ipa: null })
}

/** Запись кэша: браузер присылает результат Free Dictionary (в т.ч. null = «нет транскрипции»). */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ q?: unknown; ipa?: unknown }>(ctx.request)
  const q = normText(str(body?.q) ?? '')
  if (!q) return error(400, 'q required')

  const ipa = cleanIpa(body?.ipa)
  const db = getDb(ctx.env)
  await db
    .insert(translationCache)
    .values({ query: keyFor(q), responseJson: { ipa }, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: translationCache.query,
      set: { responseJson: { ipa }, fetchedAt: new Date() },
    })

  return json({ ok: true, ipa })
}
