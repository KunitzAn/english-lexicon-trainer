import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { filterOwnedWordIds, loadFolder } from '../../_lib/guard'
import { readJson } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { wordFolders } from '../../../db/schema'

/** Массово добавить/убрать выбранные слова в одну тему. */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{
    word_ids?: unknown
    folder_id?: unknown
    op?: unknown
  }>(ctx.request)

  const folderId = Number(body?.folder_id)
  const op =
    body?.op === 'remove' ? 'remove' : body?.op === 'add' ? 'add' : null
  if (!Number.isInteger(folderId) || !op) {
    return error(400, 'folder_id and op (add|remove) required')
  }

  const wordIdsRaw = Array.isArray(body?.word_ids)
    ? (body!.word_ids as unknown[]).map(Number).filter(Number.isInteger)
    : []
  if (!wordIdsRaw.length) return error(400, 'word_ids required')

  const db = getDb(ctx.env)
  const folder = await loadFolder(db, ctx.data.userId, folderId)
  if (!folder) return error(404, 'folder not found')

  const wordIds = await filterOwnedWordIds(db, ctx.data.userId, wordIdsRaw)
  if (!wordIds.length) return json({ updated: 0, folder_id: folderId, op })

  if (op === 'add') {
    await db
      .insert(wordFolders)
      .values(wordIds.map((wordId) => ({ wordId, folderId })))
      .onConflictDoNothing()
  } else {
    await db
      .delete(wordFolders)
      .where(
        and(
          inArray(wordFolders.wordId, wordIds),
          eq(wordFolders.folderId, folderId),
        ),
      )
  }

  return json({ updated: wordIds.length, folder_id: folderId, op })
}
