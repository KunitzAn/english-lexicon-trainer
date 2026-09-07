import { eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { normText } from '../../_lib/normalize'
import { translationCache } from '../../../db/schema'

// IPA из словаря (Wiktionary / Free Dictionary) не устаревает
const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000
// приблизительная (Datamuse, GenAm) — короче: даём словарям перезаписать RP
const ALT_TTL_MS = 14 * 24 * 60 * 60 * 1000
// «нет транскрипции» — совсем ненадолго, источники бывают флаки
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

type IpaSource = 'freedict' | 'wiktionary' | 'datamuse'

const FETCH_TIMEOUT_MS = 6000
const timeout = () => AbortSignal.timeout(FETCH_TIMEOUT_MS)

interface IpaResult {
  ipa: string | null
  /** можно ли кэшировать (окончательный ответ — да; 5xx/сеть — нет, повторим) */
  cacheable: boolean
  source: IpaSource | null
  detail: string
}

// --- Free Dictionary API (dictionaryapi.dev) ---
// Запасной: чистая готовая IPA, но хостинг шаткий (массовые 522). У API нет
// CORS-заголовков — только с сервера. Дёргается, если парсер Wiktionary промахнулся.

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

async function fetchFreeDict(word: string): Promise<IpaResult> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: timeout(),
    })
    if (res.status === 404) {
      return { ipa: null, cacheable: true, source: null, detail: 'freedict 404' }
    }
    if (!res.ok) {
      return { ipa: null, cacheable: false, source: null, detail: `freedict http ${res.status}` }
    }
    const data: unknown = await res.json()
    if (!Array.isArray(data)) {
      return { ipa: null, cacheable: true, source: null, detail: 'freedict: ответ не массив' }
    }
    const ipa = pickBritishIpa(data as FreeDictEntry[])
    return {
      ipa,
      cacheable: true,
      source: ipa ? 'freedict' : null,
      detail: `freedict ok, ipa=${ipa ?? '—'}`,
    }
  } catch (e) {
    return {
      ipa: null,
      cacheable: false,
      source: null,
      detail: `freedict упал: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

// --- Wiktionary (en.wiktionary.org) ---
// Основной: первоисточник, инфра Wikimedia надёжная, есть RP-теги.
// Минус — парсим вики-текст регэкспом, часть статей без IPA ({{rfp}}).

/** IPA из англ. секции вики-текста. Предпочитаем RP/UK-строку. */
function extractEnIpa(wikitext: string): string | null {
  const m = wikitext.match(/(?:^|\n)==\s*English\s*==\n([\s\S]*?)(?=\n==[^=]|$)/)
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
      signal: timeout(),
    })
    if (!res.ok) {
      return { ipa: null, cacheable: false, source: null, detail: `wiktionary http ${res.status}` }
    }
    const data = (await res.json()) as {
      parse?: { wikitext?: string }
      error?: { code?: string }
    }
    if (data.error) {
      const missing = data.error.code === 'missingtitle'
      return {
        ipa: null,
        cacheable: missing,
        source: null,
        detail: `wiktionary error=${data.error.code ?? '?'}`,
      }
    }
    const wt = data.parse?.wikitext
    if (typeof wt !== 'string') {
      return { ipa: null, cacheable: true, source: null, detail: 'wiktionary: пустой ответ' }
    }
    const ipa = extractEnIpa(wt)
    return {
      ipa,
      cacheable: true,
      source: ipa ? 'wiktionary' : null,
      detail: `wiktionary ok, ipa=${ipa ?? '—'}`,
    }
  } catch (e) {
    return {
      ipa: null,
      cacheable: false,
      source: null,
      detail: `wiktionary упал: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

// --- Datamuse (CMUdict, ARPABET → IPA) ---
// Крайний случай: почти никогда не лежит, но даёт GenAm, не RP.

const ARPA: Record<string, string> = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', B: 'b', CH: 'tʃ',
  D: 'd', DH: 'ð', EH: 'ɛ', ER: 'ɜ', EY: 'eɪ', F: 'f', G: 'ɡ', HH: 'h',
  IH: 'ɪ', IY: 'i', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ',
  OW: 'oʊ', OY: 'ɔɪ', P: 'p', R: 'ɹ', S: 's', SH: 'ʃ', T: 't', TH: 'θ',
  UH: 'ʊ', UW: 'u', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
}
const ARPA_VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY',
  'UH', 'UW',
])

/** "S AH0 F IH1 S T IH0 K EY2 T IH0 D" → "səˈfɪstɪˌkeɪtɪd". Знак ударения — перед слоговым онсетом. */
function arpabetToIpa(pron: string): string | null {
  const phones = pron.trim().split(/\s+/).filter(Boolean)
  if (!phones.length) return null
  const out: string[] = []
  let onset = 0 // куда вставлять знак ударения (начало текущего слога)
  for (const p of phones) {
    const m = p.match(/^([A-Z]+)([0-2]?)$/)
    if (!m) return null
    const base = m[1]!
    const stress = m[2]
    let sym = ARPA[base]
    if (!sym) return null
    if (base === 'AH' && stress === '0') sym = 'ə'
    else if (base === 'ER' && stress === '0') sym = 'ər'
    if (ARPA_VOWELS.has(base)) {
      if (stress === '1') out.splice(onset, 0, 'ˈ')
      else if (stress === '2') out.splice(onset, 0, 'ˌ')
      out.push(sym)
      onset = out.length
    } else {
      out.push(sym)
    }
  }
  return cleanIpa(out.join(''))
}

async function fetchDatamuse(word: string): Promise<IpaResult> {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=r&max=1`
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: timeout(),
    })
    if (!res.ok) {
      return { ipa: null, cacheable: false, source: null, detail: `datamuse http ${res.status}` }
    }
    const data = (await res.json()) as { word?: string; tags?: string[] }[]
    const hit = Array.isArray(data) ? data[0] : undefined
    if (!hit || hit.word?.toLowerCase() !== word.toLowerCase()) {
      return { ipa: null, cacheable: true, source: null, detail: 'datamuse: нет слова' }
    }
    const pron = hit.tags?.find((t) => t.startsWith('pron:'))?.slice(5)
    if (!pron) {
      return { ipa: null, cacheable: true, source: null, detail: 'datamuse: без произношения' }
    }
    const ipa = arpabetToIpa(pron)
    return {
      ipa,
      cacheable: true,
      source: ipa ? 'datamuse' : null,
      detail: `datamuse ok (GenAm), ipa=${ipa ?? '—'}`,
    }
  } catch (e) {
    return {
      ipa: null,
      cacheable: false,
      source: null,
      detail: `datamuse упал: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/** Wiktionary → Free Dictionary → Datamuse. Первый непустой ответ выигрывает. */
async function resolveIpa(word: string): Promise<IpaResult> {
  const a = await fetchWiktionary(word)
  if (a.ipa) return a
  const b = await fetchFreeDict(word)
  if (b.ipa) return b
  const c = await fetchDatamuse(word)
  if (c.ipa) return c
  return {
    ipa: null,
    // «нет транскрипции» кэшируем, только если ВСЕ ответили окончательно
    cacheable: a.cacheable && b.cacheable && c.cacheable,
    source: null,
    detail: `${a.detail} | ${b.detail} | ${c.detail}`,
  }
}

async function writeCache(
  db: ReturnType<typeof getDb>,
  q: string,
  ipa: string | null,
  source: IpaSource | null,
) {
  await db
    .insert(translationCache)
    .values({ query: keyFor(q), responseJson: { ipa, source }, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: translationCache.query,
      set: { responseJson: { ipa, source }, fetchedAt: new Date() },
    })
}

/**
 * Транскрипция слова: кэш → Wiktionary → Free Dictionary → Datamuse (всё на
 * сервере) → запись в кэш. `?force=1` — мимо кэша, заново сходить в словари.
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
      const payload = hit.responseJson as { ipa: string | null; source?: string }
      const ttl = !payload.ipa
        ? NEG_TTL_MS
        : payload.source === 'datamuse'
          ? ALT_TTL_MS
          : CACHE_TTL_MS
      if (Date.now() - hit.fetchedAt.getTime() < ttl) {
        return json({ query: q, cached: true, ipa: payload.ipa ?? null })
      }
    }
  }

  const r = await resolveIpa(q)
  console.log(`[pronunciation] q="${q}" force=${force} → ${r.detail}`)
  if (r.cacheable) await writeCache(db, q, r.ipa, r.source)

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
  await writeCache(getDb(ctx.env), q, ipa, ipa ? 'freedict' : null)
  return json({ ok: true, ipa })
}
