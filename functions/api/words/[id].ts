import { and, eq, isNull, ne } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { loadWord } from '../../_lib/guard'
import { numParam, readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import {
  loadMasterySettings,
  masteryForSenses,
  tzOffsetOf,
  wordMastery,
} from '../../_lib/mastery'
import { cleanText, isPhrase, normText } from '../../_lib/normalize'
import { wordFolders, words, wordSenses } from '../../../db/schema'

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const word = await loadWord(db, ctx.data.userId, id)
  if (!word) return error(404, 'not found')

  const senses = await db
    .select({
      id: wordSenses.id,
      translation: wordSenses.translation,
      part_of_speech: wordSenses.partOfSpeech,
      definition_en: wordSenses.definitionEn,
      example: wordSenses.example,
      source: wordSenses.source,
      position: wordSenses.position,
    })
    .from(wordSenses)
    .where(and(eq(wordSenses.wordId, id), isNull(wordSenses.deletedAt)))
    .orderBy(wordSenses.position)

  const folderRows = await db
    .select({ folder_id: wordFolders.folderId })
    .from(wordFolders)
    .where(eq(wordFolders.wordId, id))

  const senseIds = senses.map((s) => s.id)
  const senseMastery = await masteryForSenses(
    db,
    ctx.data.userId,
    senseIds,
    tzOffsetOf(new URL(ctx.request.url)),
    await loadMasterySettings(db, ctx.data.userId),
  )

  return json({
    word: {
      id: word.id,
      text: word.text,
      transcription: word.transcription,
      is_phrase: word.isPhrase,
      folder_ids: folderRows.map((f) => f.folder_id),
      mastery: wordMastery(senseMastery, senseIds),
      senses: senses.map((s) => ({ ...s, mastery: senseMastery.get(s.id) ?? 0 })),
    },
  })
}

export const onRequestPatch: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const uid = ctx.data.userId
  const word = await loadWord(db, uid, id)
  if (!word) return error(404, 'not found')

  const body = await readJson<{ text?: unknown; transcription?: unknown }>(
    ctx.request,
  )

  const patch: Partial<typeof words.$inferInsert> = {}
  if (body && 'transcription' in body) {
    patch.transcription = str(body.transcription)
  }
  if (body && 'text' in body) {
    const text = str(body.text)
    if (!text) return error(400, 'text cannot be empty')
    const clean = cleanText(text)
    const norm = normText(text)
    if (norm !== word.textNorm) {
      const dup = await db
        .select({ id: words.id })
        .from(words)
        .where(
          and(
            eq(words.userId, uid),
            eq(words.textNorm, norm),
            isNull(words.deletedAt),
            ne(words.id, id),
          ),
        )
        .limit(1)
      if (dup.length) return error(409, 'such word already exists')
    }
    patch.text = clean
    patch.textNorm = norm
    patch.isPhrase = isPhrase(clean)
  }

  if (Object.keys(patch).length === 0) return json({ ok: true })

  await db.update(words).set(patch).where(eq(words.id, id))
  return json({ ok: true })
}

export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const word = await loadWord(db, ctx.data.userId, id)
  if (!word) return error(404, 'not found')

  await db
    .update(words)
    .set({ deletedAt: new Date() })
    .where(eq(words.id, id))
  return json({ ok: true })
}
