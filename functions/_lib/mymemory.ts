/**
 * MyMemory API — подсказка вариантов RU-перевода.
 * Без ключа; `de=<email>` поднимает дневной лимит.
 * https://mymemory.translated.net/doc/spec.php
 */

const ENDPOINT = 'https://api.mymemory.translated.net/get'

export interface TranslationVariant {
  translation: string
  source: 'api'
}

interface MyMemoryResponse {
  responseStatus?: number | string
  responseData?: { translatedText?: string }
  matches?: Array<{ translation?: string; quality?: string | number }>
}

export async function lookupRu(
  q: string,
  email?: string,
): Promise<{ variants: TranslationVariant[]; raw: unknown }> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('q', q)
  url.searchParams.set('langpair', 'en|ru')
  if (email) url.searchParams.set('de', email)

  const res = await fetch(url.toString(), {
    headers: { 'user-agent': 'english-lexicon-trainer' },
  })
  if (!res.ok) throw new Error(`mymemory http ${res.status}`)
  const data = (await res.json()) as MyMemoryResponse

  const status = Number(data.responseStatus)
  const collected: string[] = []
  const add = (s?: string) => {
    const t = (s ?? '').trim()
    if (!t) return
    if (collected.some((x) => x.toLowerCase() === t.toLowerCase())) return
    collected.push(t)
  }

  if (status === 200) {
    add(data.responseData?.translatedText)
    for (const m of data.matches ?? []) add(m.translation)
  }

  const variants = collected
    .filter((t) => t.length <= 80)
    .filter((t) => /[а-яё]/i.test(t)) // должен содержать кириллицу — отсекает мусор/варнинги
    .slice(0, 8)
    .map((translation) => ({ translation, source: 'api' as const }))

  return { variants, raw: data }
}
