/**
 * MyMemory API — подсказка вариантов RU-перевода.
 * Без ключа; `de=<email>` привязывает квоту к почте, а не к IP
 * (важно на Cloudflare — общий egress-IP делят все воркеры).
 * https://mymemory.translated.net/doc/spec.php
 */

const ENDPOINT = 'https://api.mymemory.translated.net/get'

export interface TranslationVariant {
  translation: string
  source: 'api'
}

interface MyMemoryResponse {
  responseStatus?: number | string
  responseDetails?: string
  responseData?: { translatedText?: string }
  matches?: Array<{ translation?: string; quality?: string | number }>
  quotaFinished?: boolean
}

export interface LookupOutcome {
  variants: TranslationVariant[]
  ok: boolean
  detail: string
  http?: number
  responseStatus?: number
  usedEmail: boolean
}

export async function lookupRu(
  q: string,
  email?: string,
): Promise<LookupOutcome> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('q', q)
  url.searchParams.set('langpair', 'en|ru')
  if (email) url.searchParams.set('de', email)

  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; english-lexicon-trainer/1.0)',
        accept: 'application/json',
      },
    })
  } catch (e) {
    return {
      variants: [],
      ok: false,
      usedEmail: !!email,
      detail: `fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const bodyText = await res.text()
  let data: MyMemoryResponse
  try {
    data = JSON.parse(bodyText)
  } catch {
    return {
      variants: [],
      ok: false,
      http: res.status,
      usedEmail: !!email,
      detail: `non-JSON body (${res.status}): ${bodyText.slice(0, 300)}`,
    }
  }

  const rs = Number(data.responseStatus)
  const details = data.responseDetails ?? ''

  const collected: string[] = []
  const add = (s?: string) => {
    const t = (s ?? '').trim()
    if (!t) return
    if (collected.some((x) => x.toLowerCase() === t.toLowerCase())) return
    collected.push(t)
  }
  if (rs === 200) {
    add(data.responseData?.translatedText)
    for (const m of data.matches ?? []) add(m.translation)
  }

  const variants = collected
    .filter((t) => t.length <= 80)
    .filter((t) => /[а-яё]/i.test(t))
    .slice(0, 8)
    .map((translation) => ({ translation, source: 'api' as const }))

  const ok = rs === 200 && variants.length > 0
  const detail = ok
    ? 'ok'
    : rs === 200
      ? `200, но нет годных вариантов; translatedText=${JSON.stringify(
          data.responseData?.translatedText,
        )}; details=${details}`
      : `responseStatus=${data.responseStatus}; quotaFinished=${data.quotaFinished}; details=${details}`

  return {
    variants,
    ok,
    http: res.status,
    responseStatus: rs,
    usedEmail: !!email,
    detail,
  }
}
