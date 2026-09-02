import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { loadFolder } from '../../_lib/guard'
import { numParam, readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { masteryForSenses, tzOffsetOf, wordMastery } from '../../_lib/mastery'
import { folders, wordFolders, words, wordSenses } from '../../../db/schema'

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const folder = await loadFolder(db, ctx.data.userId, id)
  if (!folder) return error(404, 'not found')

  const wordRows = await db
    .select({
      id: words.id,
      text: words.text,
      transcription: words.transcription,
      is_phrase: words.isPhrase,
    })
    .from(words)
    .innerJoin(wordFolders, eq(wordFolders.wordId, words.id))
    .where(
      and(
        eq(wordFolders.folderId, id),
        eq(words.userId, ctx.data.userId),
        isNull(words.deletedAt),
      ),
    )
    .orderBy(words.textNorm)

  const ids = wordRows.map((w) => w.id)
  const senseRows = ids.length
    ? await db
        .select({
          id: wordSenses.id,
          word_id: wordSenses.wordId,
          translation: wordSenses.translation,
        })
        .from(wordSenses)
        .where(
          and(inArray(wordSenses.wordId, ids), isNull(wordSenses.deletedAt)),
        )
        .orderBy(wordSenses.position)
    : []

  const byWord = new Map<number, string[]>()
  const senseIdsByWord = new Map<number, number[]>()
  for (const s of senseRows) {
    const arr = byWord.get(s.word_id) ?? []
    arr.push(s.translation)
    byWord.set(s.word_id, arr)
    const sids = senseIdsByWord.get(s.word_id) ?? []
    sids.push(s.id)
    senseIdsByWord.set(s.word_id, sids)
  }

  const senseMastery = await masteryForSenses(
    db,
    ctx.data.userId,
    senseRows.map((s) => s.id),
    tzOffsetOf(new URL(ctx.request.url)),
  )

  return json({
    folder: { id: folder.id, name: folder.name },
    words: wordRows.map((w) => ({
      ...w,
      translations: byWord.get(w.id) ?? [],
      mastery: wordMastery(senseMastery, senseIdsByWord.get(w.id) ?? []),
    })),
  })
}

export const onRequestPatch: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const body = await readJson<{ name?: unknown }>(ctx.request)
  const name = str(body?.name)
  if (!name) return error(400, 'name required')

  const db = getDb(ctx.env)
  const updated = await db
    .update(folders)
    .set({ name })
    .where(and(eq(folders.id, id), eq(folders.userId, ctx.data.userId)))
    .returning({ id: folders.id, name: folders.name })
  if (!updated.length) return error(404, 'not found')
  return json({ folder: updated[0] })
}

export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const deleted = await db
    .delete(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, ctx.data.userId)))
    .returning({ id: folders.id })
  if (!deleted.length) return error(404, 'not found')
  return json({ ok: true })
}
