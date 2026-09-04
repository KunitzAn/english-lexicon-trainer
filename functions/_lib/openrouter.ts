/**
 * Клиент OpenRouter для генерации упражнений. Только :free-модели.
 *
 * Стратегия (см. обсуждение этапа 4): явная упорядоченная цепочка конкретных
 * моделей, НЕ `openrouter/auto` (тот может выбрать платную). Фоллбек делает сам
 * OpenRouter параметром `models: [...]` — один запрос, одна единица квоты.
 *
 * OpenRouter ограничивает `models` тремя элементами. Разные провайдеры — чтобы
 * пережить перегруз/429 у одного. Порядок переставлять по данным `generation_log`.
 * Запасные слаги на подмену, если free-модель умрёт или начнёт стабильно 429:
 *   google/gemma-4-26b-a4b-it:free, google/gemma-4-31b-it:free,
 *   z-ai/glm-5.2:free, minimax/minimax-m2.7:free
 */

export const MODEL_CHAIN = [
  'minimax/minimax-m3:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
]

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 45_000

export type ErrorKind =
  | 'no_key'
  | 'timeout'
  | 'network'
  | 'empty'
  | 'bad_json'
  | 'invalid'
  | `http_${number}`

export interface ChatResult {
  ok: boolean
  model: string | null
  content: string | null
  errorKind: ErrorKind | null
  /** Человекочитаемая причина: тело ошибки OpenRouter, finish_reason, стек. */
  detail: string | null
}

const clip = (s: string, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)

export async function chatJson(
  apiKey: string,
  system: string,
  user: string,
): Promise<ChatResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'x-title': 'English Lexicon Trainer',
      },
      body: JSON.stringify({
        models: MODEL_CHAIN,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 8000,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const retryAfter = res.headers.get('retry-after')
      const reset = res.headers.get('x-ratelimit-reset')
      return {
        ok: false,
        model: null,
        content: null,
        errorKind: `http_${res.status}` as ErrorKind,
        detail:
          `HTTP ${res.status} ${res.statusText}` +
          (retryAfter ? ` retry-after=${retryAfter}s` : '') +
          (reset ? ` reset=${reset}` : '') +
          (body ? ` — ${clip(body)}` : ''),
      }
    }
    const data = (await res.json()) as {
      model?: string
      choices?: { message?: { content?: string }; finish_reason?: string }[]
      error?: unknown
    }
    const choice = data.choices?.[0]
    const content = choice?.message?.content ?? null
    const model = data.model ?? null
    const finish = choice?.finish_reason
    if (!content || !content.trim()) {
      return {
        ok: false,
        model,
        content: null,
        errorKind: 'empty',
        detail:
          `пустой content (finish_reason=${finish ?? '—'})` +
          (data.error ? `; error=${clip(JSON.stringify(data.error))}` : '') +
          (!data.choices?.length
            ? `; ответ=${clip(JSON.stringify(data))}`
            : ''),
      }
    }
    return {
      ok: true,
      model,
      content,
      errorKind: null,
      // всегда пишем finish_reason: по нему видно обрыв по длине даже когда
      // провайдер не проставил его явно (тогда «—» + оборванный JSON)
      detail: `finish_reason=${finish ?? '—'}`,
    }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    return {
      ok: false,
      model: null,
      content: null,
      errorKind: name === 'AbortError' ? 'timeout' : 'network',
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Достать JSON-объект из ответа: срезать <think>, ```-заборы, обрезать по скобкам.
 * Если разбор не удался (частая причина — обрыв ответа на полуслове у :free
 * провайдера, который не вернул finish_reason=length), пытаемся спасти хвост:
 * собираем все ЦЕЛЫЕ объекты массива "exercises" и закрываем массив вручную.
 */
export function extractJson(raw: string): unknown | null {
  let s = raw.trim().replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1]!.trim()
  const first = s.indexOf('{')
  if (first === -1) return null
  s = s.slice(first)

  // 1) прямой разбор до последней «}»
  const last = s.lastIndexOf('}')
  if (last > 0) {
    try {
      return JSON.parse(s.slice(0, last + 1))
    } catch {
      /* обрыв или мусор — идём чинить ниже */
    }
  }

  // 2) спасение: вытащить целые объекты массива "exercises"
  const keyAt = s.indexOf('"exercises"')
  if (keyAt === -1) return null
  const arrStart = s.indexOf('[', keyAt)
  if (arrStart === -1) return null

  const items: string[] = []
  let depth = 0
  let inStr = false
  let esc = false
  let objStart = -1
  for (let i = arrStart + 1; i < s.length; i++) {
    const c = s[i]!
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        items.push(s.slice(objStart, i + 1))
        objStart = -1
      }
    } else if (c === ']' && depth === 0) break
  }
  if (!items.length) return null
  try {
    return JSON.parse(`{"exercises":[${items.join(',')}]}`)
  } catch {
    return null
  }
}
