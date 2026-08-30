import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../../_lib/db'
import type { AuthedData } from '../../../_lib/context'
import type { Env } from '../../../_lib/env'
import { loadWord } from '../../../_lib/guard'
import { numParam, readJson, str } from '../../../_lib/handler'
import { error, json } from '../../../_lib/http'
import { normTranslation } from '../../../_lib/normalize'
import { wordSenses } from '../../../../db/schema'

export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const word = await loadWord(db, ctx.data.userId, id)
  if (!word) return error(404, 'not found')

  const body = await readJson<{
    translation?: unknown
    part_of_speech?: unknown
    definition_en?: unknown
    example?: unknown
    source?: unknown
  }>(ctx.request)

  const rawTranslation = str(body?.translation)
  if (!rawTranslation) return error(400, 'translation required')
  const translation = normTranslation(rawTranslation)

  const current = await db
    .select({ position: wordSenses.position })
    .from(wordSenses)
    .where(and(eq(wordSenses.wordId, id), isNull(wordSenses.deletedAt)))
  const nextPos = current.reduce((m, c) => Math.max(m, c.position + 1), 0)

  const [row] = await db
    .insert(wordSenses)
    .values({
      wordId: id,
      translation,
      partOfSpeech: str(body?.part_of_speech),
      definitionEn: str(body?.definition_en),
      example: str(body?.example),
      source: body?.source === 'api' ? 'api' : 'manual',
      position: nextPos,
    })
    .returning({
      id: wordSenses.id,
      translation: wordSenses.translation,
      part_of_speech: wordSenses.partOfSpeech,
      definition_en: wordSenses.definitionEn,
      example: wordSenses.example,
      source: wordSenses.source,
      position: wordSenses.position,
    })

  return json({ sense: row }, { status: 201 })
}
