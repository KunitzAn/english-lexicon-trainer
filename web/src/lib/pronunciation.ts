import { api } from '@/api'

/**
 * Транскрипция (IPA) слова: серверный кэш → Free Dictionary API из браузера →
 * запись в кэш. Предпочитаем британский вариант (RP), при отсутствии — любой.
 * Хранится без косых скобок (сайты отображения оборачивают в /…/ сами).
 */

const memo = new Map<string, string | null>()
const key = (w: string) => w.trim().toLowerCase()

interface FreeDictEntry {
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
}

function normIpa(s: string): string | null {
  const t = s
    .replace(/^[/[]+/, '')
    .replace(/[/\]]+$/, '')
    .trim()
    .slice(0, 64)
  return t && /\p{L}/u.test(t) ? t : null
}

function pickBritish(entries: FreeDictEntry[]): string | null {
  const all: { text: string; audio: string }[] = []
  for (const e of entries) {
    for (const p of e.phonetics ?? []) {
      if (p.text && p.text.trim()) {
        all.push({ text: p.text.trim(), audio: (p.audio ?? '').toLowerCase() })
      }
    }
    if (e.phonetic && e.phonetic.trim()) all.push({ text: e.phonetic.trim(), audio: '' })
  }
  if (!all.length) return null
  const uk = all.find((p) => /[-_]uk\.|[-_]gb\.|british/.test(p.audio))
  return normIpa((uk ?? all[0]!).text)
}

async function fromFreeDict(word: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) return null
    const data: unknown = await res.json()
    return Array.isArray(data) ? pickBritish(data as FreeDictEntry[]) : null
  } catch {
    return null
  }
}

/** Вернёт транскрипцию или null (нет / не англ. одно слово / ошибка). */
export async function fetchPronunciation(rawWord: string): Promise<string | null> {
  const w = key(rawWord)
  if (!w || /\s/.test(w)) return null // фразы не ищем
  if (memo.has(w)) return memo.get(w) ?? null

  let ipa: string | null = null
  try {
    const cache = await api<{ ipa: string | null; cached: boolean }>(
      `/words/pronunciation?q=${encodeURIComponent(w)}`,
    )
    if (cache.cached) {
      ipa = cache.ipa
    } else {
      ipa = await fromFreeDict(w)
      api('/words/pronunciation', {
        method: 'POST',
        body: JSON.stringify({ q: w, ipa }),
      }).catch(() => {})
    }
  } catch {
    ipa = null
  }
  memo.set(w, ipa)
  return ipa
}
