import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { filterOwnedFolderIds } from '../../_lib/guard'
import { readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import {
  cleanText,
  isPhrase,
  normText,
  normTranslation,
} from '../../_lib/normalize'
import { wordFolders, words, wordSenses } from '../../../db/schema'

interface SenseInput {
  translation?: unknown
  part_of_speech?: unknown
  definition_en?: unknown
  example?: unknown
  source?: unknown
}

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  const uid = ctx.data.userId
  const folderParam = new URL(ctx.request.url).searchParams.get('folder')
  const folderId = folderParam ? Number(folderParam) : null

  const base = db
    .select({
      id: words.id,
      text: words.text,
      transcription: words.transcription,
      is_phrase: words.isPhrase,
    })
    .from(words)
    .$dynamic()

  const rows =
    folderId && Number.isInteger(folderId)
      ? await base
          .innerJoin(wordFolders, eq(wordFolders.wordId, words.id))
          .where(
            and(
              eq(words.userId, uid),
              isNull(words.deletedAt),
              eq(wordFolders.folderId, folderId),
            ),
          )
          .orderBy(words.textNorm)
      : await base
          .where(and(eq(words.userId, uid), isNull(words.deletedAt)))
          .orderBy(words.textNorm)

  const ids = rows.map((r) => r.id)
  const senses = ids.length
    ? await db
        .select({ word_id: wordSenses.wordId, translation: wordSenses.translation })
        .from(wordSenses)
        .where(and(inArray(wordSenses.wordId, ids), isNull(wordSenses.deletedAt)))
        .orderBy(wordSenses.position)
    : []

  const byWord = new Map<number, string[]>()
  for (const s of senses) {
    const arr = byWord.get(s.word_id) ?? []
    arr.push(s.translation)
    byWord.set(s.word_id, arr)
  }

  const links = ids.length
    ? await db
        .select({ word_id: wordFolders.wordId, folder_id: wordFolders.folderId })
        .from(wordFolders)
        .where(inArray(wordFolders.wordId, ids))
    : []
  const foldersByWord = new Map<number, number[]>()
  for (const l of links) {
    const arr = foldersByWord.get(l.word_id) ?? []
    arr.push(l.folder_id)
    foldersByWord.set(l.word_id, arr)
  }

  return json({
    words: rows.map((r) => ({
      ...r,
      translations: byWord.get(r.id) ?? [],
      folder_ids: foldersByWord.get(r.id) ?? [],
    })),
  })
}

export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const uid = ctx.data.userId
  const body = await readJson<{
    text?: unknown
    folder_ids?: unknown
    senses?: unknown
  }>(ctx.request)

  const text = str(body?.text)
  if (!text) return error(400, 'text required')

  const rawSenses = Array.isArray(body?.senses)
    ? (body!.senses as SenseInput[])
    : []
  const senseValues = rawSenses
    .map((s) => {
      const t = str(s.translation)
      return {
        translation: t ? normTranslation(t) : null,
        partOfSpeech: str(s.part_of_speech),
        definitionEn: str(s.definition_en),
        example: str(s.example),
        source: s.source === 'api' ? 'api' : 'manual',
      }
    })
    .filter((s): s is typeof s & { translation: string } => !!s.translation)

  if (!senseValues.length) return error(400, 'at least one sense required')

  const folderIds = Array.isArray(body?.folder_ids)
    ? (body!.folder_ids as unknown[]).map(Number).filter(Number.isInteger)
    : []
  const ownedFolderIds = await (async () => {
    const db = getDb(ctx.env)
    return filterOwnedFolderIds(db, uid, folderIds)
  })()

  const db = getDb(ctx.env)
  const clean = cleanText(text)
  const norm = normText(text)

  const existing = await db
    .select()
    .from(words)
    .where(
      and(eq(words.userId, uid), eq(words.textNorm, norm), isNull(words.deletedAt)),
    )
    .limit(1)

  let wordId: number
  let created: boolean

  if (existing[0]) {
    wordId = existing[0].id
    created = false
  } else {
    const [inserted] = await db
      .insert(words)
      .values({
        userId: uid,
        text: clean,
        textNorm: norm,
        isPhrase: isPhrase(clean),
        source: 'manual',
      })
      .returning({ id: words.id })
    wordId = inserted!.id
    created = true
  }

  // существующие переводы (чтобы не дублировать при merge)
  const current = await db
    .select({ translation: wordSenses.translation, position: wordSenses.position })
    .from(wordSenses)
    .where(and(eq(wordSenses.wordId, wordId), isNull(wordSenses.deletedAt)))
  const have = new Set(current.map((c) => c.translation.toLowerCase()))
  let nextPos = current.reduce((m, c) => Math.max(m, c.position + 1), 0)

  const toInsert = senseValues
    .filter((s) => !have.has(s.translation.toLowerCase()))
    .map((s) => ({ ...s, wordId, position: nextPos++ }))

  if (toInsert.length) await db.insert(wordSenses).values(toInsert)

  if (ownedFolderIds.length) {
    await db
      .insert(wordFolders)
      .values(ownedFolderIds.map((folderId) => ({ wordId, folderId })))
      .onConflictDoNothing()
  }

  return json(
    { word_id: wordId, created, added_senses: toInsert.length },
    { status: created ? 201 : 200 },
  )
}
