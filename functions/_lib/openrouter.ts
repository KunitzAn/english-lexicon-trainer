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
}

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
        max_tokens: 2200,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      return {
        ok: false,
        model: null,
        content: null,
        errorKind: `http_${res.status}` as ErrorKind,
      }
    }
    const data = (await res.json()) as {
      model?: string
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content ?? null
    const model = data.model ?? null
    if (!content || !content.trim()) {
      return { ok: false, model, content: null, errorKind: 'empty' }
    }
    return { ok: true, model, content, errorKind: null }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    return {
      ok: false,
      model: null,
      content: null,
      errorKind: name === 'AbortError' ? 'timeout' : 'network',
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Достать JSON-объект из ответа: срезать <think>, ```-заборы, обрезать по скобкам. */
export function extractJson(raw: string): unknown | null {
  let s = raw.trim().replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1]!.trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try {
    return JSON.parse(s.slice(first, last + 1))
  } catch {
    return null
  }
}
