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
// «нет транскрипции» кэшируем ненадолго — источник бывает флаки, даём отлежаться
const NEG_TTL_MS = 7 * 24 * 60 * 60 * 1000
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

// --- Free Dictionary API (dictionaryapi.dev) ---
// Тянем на сервере: у API нет CORS-заголовков, из браузера — «Failed to fetch».

interface FreeDictEntry {
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
}

/** Британский вариант (по -uk/-gb в audio), иначе первый непустой. */
function pickBritishIpa(entries: FreeDictEntry[]): string | null {
  const all: { text: string; audio: string }[] = []
  for (const e of entries) {
    for (const p of e.phonetics ?? []) {
      if (p.text && p.text.trim()) {
        all.push({ text: p.text.trim(), audio: (p.audio ?? '').toLowerCase() })
      }
    }
    if (e.phonetic && e.phonetic.trim()) {
      all.push({ text: e.phonetic.trim(), audio: '' })
    }
  }
  if (!all.length) return null
  const uk = all.find((p) => /[-_](uk|gb)\.|british/.test(p.audio))
  return cleanIpa((uk ?? all[0]!).text)
}

interface IpaResult {
  ipa: string | null
  /** можно ли кэшировать (200/404 — да; 429/5xx/сеть — нет, повторим позже) */
  cacheable: boolean
  detail: string
}

async function fetchFreeDict(word: string): Promise<IpaResult> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (res.status === 404) {
      return { ipa: null, cacheable: true, detail: 'http 404 (нет статьи)' }
    }
    if (!res.ok) {
      return { ipa: null, cacheable: false, detail: `http ${res.status}` }
    }
    const data: unknown = await res.json()
    if (!Array.isArray(data)) {
      return { ipa: null, cacheable: true, detail: 'ответ не массив' }
    }
    const ipa = pickBritishIpa(data as FreeDictEntry[])
    return {
      ipa,
      cacheable: true,
      detail: `ok, entries=${data.length}, ipa=${ipa ?? '—'}`,
    }
  } catch (e) {
    return {
      ipa: null,
      cacheable: false,
      detail: `fetch упал: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

// --- Wiktionary (en.wiktionary.org) — запасной источник ---
// Free Dictionary сам берёт данные отсюда; идём напрямую, когда тот лежит.

/** IPA из англ. секции вики-текста. Предпочитаем RP/UK-строку. */
function extractEnIpa(wikitext: string): string | null {
  const m = wikitext.match(
    /(?:^|\n)==\s*English\s*==\n([\s\S]*?)(?=\n==[^=]|$)/,
  )
  const section = m ? m[1]! : wikitext
  const lines = section.split('\n').filter((l) => /\{\{IPA\|en[|}]/.test(l))
  if (!lines.length) return null
  const pref =
    lines.find((l) => /\bRP\b|\bUK\b|Received Pronunciation|British/i.test(l)) ??
    lines[0]!
  const im = pref.match(/\{\{IPA\|en\|([^}]*)\}\}/)
  if (!im) return null
  const first = im[1]!.split(/[|,]/)[0]!.trim()
  return cleanIpa(first)
}

async function fetchWiktionary(word: string): Promise<IpaResult> {
  const url =
    `https://en.wiktionary.org/w/api.php?action=parse&prop=wikitext` +
    `&formatversion=2&format=json&redirects=1&page=${encodeURIComponent(word)}`
  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent':
          'english-lexicon-trainer/1.0 (personal vocab PWA; contact via github)',
      },
    })
    if (!res.ok) {
      return { ipa: null, cacheable: false, detail: `wiktionary http ${res.status}` }
    }
    const data = (await res.json()) as {
      parse?: { wikitext?: string }
      error?: { code?: string }
    }
    if (data.error) {
      // missingtitle — статьи нет, это окончательный ответ
      const missing = data.error.code === 'missingtitle'
      return {
        ipa: null,
        cacheable: missing,
        detail: `wiktionary error=${data.error.code ?? '?'}`,
      }
    }
    const wt = data.parse?.wikitext
    if (typeof wt !== 'string') {
      return { ipa: null, cacheable: true, detail: 'wiktionary: пустой ответ' }
    }
    const ipa = extractEnIpa(wt)
    return { ipa, cacheable: true, detail: `wiktionary ok, ipa=${ipa ?? '—'}` }
  } catch (e) {
    return {
      ipa: null,
      cacheable: false,
      detail: `wiktionary упал: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/** Free Dictionary, при неудаче — Wiktionary. */
async function resolveIpa(word: string): Promise<IpaResult> {
  const primary = await fetchFreeDict(word)
  if (primary.ipa) return primary

  const backup = await fetchWiktionary(word)
  if (backup.ipa) return backup
  return {
    ipa: null,
    // кэшируем «нет транскрипции», только если ОБА источника ответили окончательно
    cacheable: primary.cacheable && backup.cacheable,
    detail: `${primary.detail} | ${backup.detail}`,
  }
}

async function writeCache(db: ReturnType<typeof getDb>, q: string, ipa: string | null) {
  await db
    .insert(translationCache)
    .values({ query: keyFor(q), responseJson: { ipa }, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: translationCache.query,
      set: { responseJson: { ipa }, fetchedAt: new Date() },
    })
}

/**
 * Транскрипция слова: кэш → Free Dictionary → Wiktionary (всё на сервере) →
 * запись в кэш. `?force=1` — мимо кэша, заново сходить в словари.
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const url = new URL(ctx.request.url)
  const q = normText(url.searchParams.get('q') ?? '')
  if (!q) return error(400, 'q required')
  if (/\s/.test(q)) return json({ query: q, cached: false, ipa: null })
  const force = url.searchParams.get('force') === '1'

  const db = getDb(ctx.env)

  if (!force) {
    const hit = (
      await db
        .select()
        .from(translationCache)
        .where(eq(translationCache.query, keyFor(q)))
        .limit(1)
    )[0]
    if (hit) {
      const payload = hit.responseJson as { ipa: string | null }
      const ttl = payload.ipa ? CACHE_TTL_MS : NEG_TTL_MS
      if (Date.now() - hit.fetchedAt.getTime() < ttl) {
        return json({ query: q, cached: true, ipa: payload.ipa ?? null })
      }
    }
  }

  const r = await resolveIpa(q)
  console.log(`[pronunciation] q="${q}" force=${force} → ${r.detail}`)
  if (r.cacheable) await writeCache(db, q, r.ipa)

  return json({ query: q, cached: false, ipa: r.ipa, detail: r.detail })
}

/** Ручная правка кэша (сид/переопределение). Тело: { q, ipa }. */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ q?: unknown; ipa?: unknown }>(ctx.request)
  const q = normText(str(body?.q) ?? '')
  if (!q) return error(400, 'q required')

  const ipa = cleanIpa(body?.ipa)
  await writeCache(getDb(ctx.env), q, ipa)
  return json({ ok: true, ipa })
}
