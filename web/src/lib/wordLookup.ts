import { api } from '@/api'
import { fetchMyMemory } from '@/lib/mymemory'
import type { LookupResult, LookupVariant } from '@/lib/types'

export interface WordLookup {
  variants: LookupVariant[]
  ok: boolean
  detail: string
}

/** Мемоизация на время жизни вкладки — одно и то же слово не дёргаем дважды. */
const memo = new Map<string, WordLookup>()

const key = (q: string) => q.trim().toLowerCase()

/**
 * Перевод одного слова: серверный кэш → MyMemory из браузера → запись в кэш.
 * Та же цепочка, что в `AddWordView`, но без состояния формы — для всплывашки
 * «тап по слову в упражнении».
 */
export async function lookupWord(raw: string): Promise<WordLookup> {
  const q = key(raw)
  if (!q) return { variants: [], ok: false, detail: 'пусто' }

  const cached = memo.get(q)
  if (cached) return cached

  let result: WordLookup
  try {
    const cache = await api<LookupResult>(
      `/words/lookup?q=${encodeURIComponent(q)}`,
    )
    if (cache.cached && cache.variants.length) {
      result = { variants: cache.variants, ok: true, detail: 'из кэша' }
    } else {
      const mm = await fetchMyMemory(q)
      result = { variants: mm.variants, ok: mm.ok, detail: mm.detail }
      if (mm.ok) {
        api('/words/lookup', {
          method: 'POST',
          body: JSON.stringify({ q, variants: mm.variants }),
        }).catch(() => {})
      }
    }
  } catch (e) {
    result = {
      variants: [],
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  if (result.ok) memo.set(q, result)
  return result
}
