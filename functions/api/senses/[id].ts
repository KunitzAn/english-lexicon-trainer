import { eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { loadSense } from '../../_lib/guard'
import { numParam, readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { normTranslation } from '../../_lib/normalize'
import { wordSenses } from '../../../db/schema'

export const onRequestPatch: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const sense = await loadSense(db, ctx.data.userId, id)
  if (!sense) return error(404, 'not found')

  const body = await readJson<Record<string, unknown>>(ctx.request)
  const patch: Partial<typeof wordSenses.$inferInsert> = {}
  if (body && 'translation' in body) {
    const t = str(body.translation)
    if (!t) return error(400, 'translation cannot be empty')
    patch.translation = normTranslation(t)
  }
  if (body && 'part_of_speech' in body) patch.partOfSpeech = str(body.part_of_speech)
  if (body && 'definition_en' in body) patch.definitionEn = str(body.definition_en)
  if (body && 'example' in body) patch.example = str(body.example)

  if (Object.keys(patch).length === 0) return json({ ok: true })
  await db.update(wordSenses).set(patch).where(eq(wordSenses.id, id))
  return json({ ok: true })
}

export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const sense = await loadSense(db, ctx.data.userId, id)
  if (!sense) return error(404, 'not found')

  await db
    .update(wordSenses)
    .set({ deletedAt: new Date() })
    .where(eq(wordSenses.id, id))
  return json({ ok: true })
}
