/**
 * Схемы, промпт и валидатор контекстных упражнений (этап 4, типы 1–2).
 * ИИ отдаёт JSON; сервер сам добавляет `glossary` из БД и канонизирует ответы,
 * чтобы сравнение с эталоном на клиенте совпадало (как в упражнениях без LLM).
 */

const norm = (s: string) => s.trim().toLowerCase()

export interface SenseForGen {
  sense_id: number
  word: string
  translation: string
  part_of_speech: string | null
  definition_en: string | null
  example: string | null
}

export interface GlossItem {
  word_sense_id: number
  text: string
  transcription: string | null
  translation: string
  definition_en: string | null
  example: string | null
}

export interface GapPayload {
  kind: 'gap'
  word_sense_id: number
  text: string
  bank: string[]
  answer: string
  glossary: GlossItem[]
}
export interface ClickablePayload {
  kind: 'clickable'
  word_sense_id: number
  text: string
  target: string
  options: string[]
  answer: string
  glossary: GlossItem[]
}
export type ExercisePayload = GapPayload | ClickablePayload

export interface ValidExercise {
  type: 'gap' | 'clickable'
  word_sense_id: number
  payload: ExercisePayload
}

export function buildPrompt(senses: SenseForGen[]): {
  system: string
  user: string
} {
  const system = [
    'You generate English C1/C2 vocabulary exercises.',
    'Output ONLY one valid JSON object. No prose, no markdown, no code fences.',
    'Shape: {"exercises":[ ... ]}. One exercise per given sense; skip a sense if you cannot make a natural one.',
    'Produce a MIX of both kinds — aim for roughly half "gap" and half "clickable".',
    '',
    'kind "gap": a 1–2 sentence natural C1/C2 context. Replace the target word with exactly "___" (three underscores).',
    ' The target word must NOT otherwise appear in the text. Fields: {"kind":"gap","sense_id":<int>,',
    ' "text":<string with one ___>,"answer":<base form of the target English word>,',
    ' "bank":[4 single English words incl. answer; distractors are real words of the same part of speech, wrong in this context]}.',
    '',
    'kind "clickable": a 2–3 sentence natural C1/C2 paragraph that uses the target English word (inflected forms allowed).',
    ' Fields: {"kind":"clickable","sense_id":<int>,"text":<string>,"target":<exact surface form as it appears in text>,',
    ' "answer":<the provided Russian translation, copied verbatim>,',
    ' "options":[4 Russian glosses incl. answer; distractors are plausible Russian words clearly wrong for this sense]}.',
    '',
    'No translations inside the English text. No lists. Keep it idiomatic, not contrived.',
  ].join('\n')

  const user =
    'Senses:\n' +
    JSON.stringify(
      senses.map((s) => ({
        sense_id: s.sense_id,
        word: s.word,
        translation: s.translation,
        part_of_speech: s.part_of_speech ?? undefined,
        definition_en: s.definition_en ?? undefined,
        example: s.example ?? undefined,
      })),
      null,
      1,
    )

  return { system, user }
}

function cleanList(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v)) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of v) {
    if (typeof x !== 'string') return null
    const t = x.trim()
    if (!t || t.length > max) return null
    if (seen.has(norm(t))) continue
    seen.add(norm(t))
    out.push(t)
  }
  return out
}

const wordRe = (w: string) =>
  new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')

export interface ValidateResult {
  valid: ValidExercise[]
  /** Причины отбраковки — по одной строке на упражнение, для generation_log. */
  rejects: string[]
}

/** Разобрать ответ ИИ и оставить только валидные упражнения (glossary добавляется извне). */
export function validateBatch(
  root: unknown,
  senses: SenseForGen[],
  gloss: Map<number, GlossItem>,
): ValidateResult {
  const arr =
    root && typeof root === 'object' && Array.isArray((root as any).exercises)
      ? ((root as any).exercises as unknown[])
      : null
  if (!arr) {
    return {
      valid: [],
      rejects: [
        `корень без массива "exercises" (ключи: ${
          root && typeof root === 'object'
            ? Object.keys(root as object).join(',')
            : typeof root
        })`,
      ],
    }
  }

  const byId = new Map(senses.map((s) => [s.sense_id, s]))
  const used = new Set<number>()
  const out: ValidExercise[] = []
  const rejects: string[] = []
  const skip = (why: string) => rejects.push(why)

  arr.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return skip(`#${i}: не объект`)
    const e = raw as Record<string, unknown>
    const senseId = Number(e.sense_id)
    const sense = byId.get(senseId)
    const g = gloss.get(senseId)
    const tag = `#${i} sense=${e.sense_id} kind=${e.kind}`
    if (!sense || !g) return skip(`${tag}: sense_id не из набора`)
    if (used.has(senseId)) return skip(`${tag}: значение уже покрыто`)
    const text = typeof e.text === 'string' ? e.text.trim() : ''
    if (text.length < 20 || text.length > 700)
      return skip(`${tag}: длина текста ${text.length} вне 20..700`)

    if (e.kind === 'gap') {
      const blanks = text.match(/_{2,}/g)
      if (!blanks || blanks.length !== 1)
        return skip(`${tag}: пропусков "___" = ${blanks?.length ?? 0}, нужен 1`)
      if (wordRe(sense.word).test(text))
        return skip(`${tag}: целевое слово "${sense.word}" видно в тексте`)
      const bank = cleanList(e.bank, 40)
      if (!bank || bank.length < 3 || bank.length > 5)
        return skip(`${tag}: bank = ${JSON.stringify(e.bank)} (нужно 3..5 уникальных)`)
      const answer = typeof e.answer === 'string' ? e.answer.trim() : ''
      const inBank = bank.find((b) => norm(b) === norm(answer))
      if (!answer || !inBank)
        return skip(`${tag}: answer "${answer}" не входит в bank ${JSON.stringify(bank)}`)
      used.add(senseId)
      out.push({
        type: 'gap',
        word_sense_id: senseId,
        payload: {
          kind: 'gap',
          word_sense_id: senseId,
          text: text.replace(/_{2,}/, '___'),
          bank,
          answer: inBank,
          glossary: [g],
        },
      })
    } else if (e.kind === 'clickable') {
      const target = typeof e.target === 'string' ? e.target.trim() : ''
      if (!target || target.length > 40)
        return skip(`${tag}: target "${target}" пустой или длиннее 40`)
      if (!text.toLowerCase().includes(target.toLowerCase()))
        return skip(`${tag}: target "${target}" не найден в тексте`)
      const options = cleanList(e.options, 60)
      if (!options || options.length < 3 || options.length > 5)
        return skip(`${tag}: options = ${JSON.stringify(e.options)} (нужно 3..5 уникальных)`)
      const opts = options.map((o) =>
        norm(o) === norm(sense.translation) ? sense.translation : o,
      )
      if (!opts.some((o) => o === sense.translation))
        return skip(
          `${tag}: перевод из БД "${sense.translation}" не среди options ${JSON.stringify(options)}`,
        )
      used.add(senseId)
      out.push({
        type: 'clickable',
        word_sense_id: senseId,
        payload: {
          kind: 'clickable',
          word_sense_id: senseId,
          text,
          target,
          options: opts,
          answer: sense.translation,
          glossary: [g],
        },
      })
    } else {
      return skip(`${tag}: неизвестный kind`)
    }
  })
  return { valid: out, rejects }
}
