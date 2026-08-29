import { eq } from 'drizzle-orm'
import { getDb } from '../../../_lib/db'
import type { AuthedData } from '../../../_lib/context'
import type { Env } from '../../../_lib/env'
import { filterOwnedFolderIds, loadWord } from '../../../_lib/guard'
import { numParam, readJson } from '../../../_lib/handler'
import { error, json } from '../../../_lib/http'
import { wordFolders } from '../../../../db/schema'

/** Полностью задаёт набор тем слова. */
export const onRequestPut: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const word = await loadWord(db, ctx.data.userId, id)
  if (!word) return error(404, 'not found')

  const body = await readJson<{ folder_ids?: unknown }>(ctx.request)
  const requested = Array.isArray(body?.folder_ids)
    ? (body!.folder_ids as unknown[]).map(Number).filter(Number.isInteger)
    : []
  const owned = await filterOwnedFolderIds(db, ctx.data.userId, requested)

  await db.delete(wordFolders).where(eq(wordFolders.wordId, id))
  if (owned.length) {
    await db
      .insert(wordFolders)
      .values(owned.map((folderId) => ({ wordId: id, folderId })))
  }

  return json({ folder_ids: owned })
}
