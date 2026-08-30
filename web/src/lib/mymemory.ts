import type { LookupVariant } from './types'

/**
 * MyMemory дёргаем из браузера: лимит считается по IP пользователя, а не по
 * общему egress-IP Cloudflare. У API `access-control-allow-origin: *`.
 */

const EMAIL = import.meta.env.VITE_MYMEMORY_EMAIL as string | undefined

interface MyMemoryRaw {
  responseStatus?: number | string
  responseDetails?: string
  responseData?: { translatedText?: string }
  matches?: Array<{ translation?: string }>
}

export interface MyMemoryResult {
  variants: LookupVariant[]
  ok: boolean
  detail: string
}

export async function fetchMyMemory(q: string): Promise<MyMemoryResult> {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', q)
  url.searchParams.set('langpair', 'en|ru')
  if (EMAIL) url.searchParams.set('de', EMAIL)

  let data: MyMemoryRaw
  try {
    const res = await fetch(url.toString())
    data = (await res.json()) as MyMemoryRaw
  } catch (e) {
    return { variants: [], ok: false, detail: `сеть: ${e instanceof Error ? e.message : e}` }
  }

  const rs = Number(data.responseStatus)
  if (rs !== 200) {
    return {
      variants: [],
      ok: false,
      detail: `responseStatus=${data.responseStatus}; ${data.responseDetails ?? ''}`,
    }
  }

  const seen: string[] = []
  const add = (s?: string) => {
    const t = (s ?? '').trim()
    if (t && !seen.some((x) => x.toLowerCase() === t.toLowerCase())) seen.push(t)
  }
  add(data.responseData?.translatedText)
  for (const m of data.matches ?? []) add(m.translation)

  const variants: LookupVariant[] = seen
    .filter((t) => t.length <= 80 && /[а-яё]/i.test(t))
    .slice(0, 8)
    .map((translation) => ({ translation, source: 'api' as const }))

  return {
    variants,
    ok: variants.length > 0,
    detail: variants.length ? 'ok' : '200, но нет годных вариантов',
  }
}
