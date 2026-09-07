import { api } from '@/api'

/**
 * Транскрипция (IPA) слова. Free Dictionary API дёргается на сервере
 * (`/api/words/pronunciation` — у него нет CORS, из браузера «Failed to fetch»),
 * там же кэш. Клиент только спрашивает результат.
 */

const memo = new Map<string, string | null>()
const key = (w: string) => w.trim().toLowerCase()

/**
 * Вернёт транскрипцию или null (нет / не англ. одно слово / ошибка).
 * `force` — мимо кэша (в т.ч. отрицательного), заново сходить в словарь.
 */
export async function fetchPronunciation(
  rawWord: string,
  opts?: { force?: boolean },
): Promise<string | null> {
  const w = key(rawWord)
  if (!w || /\s/.test(w)) return null // фразы не ищем
  if (!opts?.force && memo.has(w)) return memo.get(w) ?? null

  try {
    const r = await api<{ ipa: string | null; detail?: string }>(
      `/words/pronunciation?q=${encodeURIComponent(w)}${opts?.force ? '&force=1' : ''}`,
    )
    if (r.detail) console.info(`[транскрипция] «${w}»: ${r.detail}`)
    memo.set(w, r.ipa)
    return r.ipa
  } catch (e) {
    console.warn(`[транскрипция] запрос упал для «${w}»:`, e)
    return null
  }
}
