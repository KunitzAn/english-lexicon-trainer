import { and, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { cleanColor, cleanIcon } from '../../_lib/folder-icon'
import { readJson, str } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { folders, wordFolders, words } from '../../../db/schema'

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const db = getDb(ctx.env)
  const rows = await db
    .select({
      id: folders.id,
      name: folders.name,
      icon: folders.icon,
      color: folders.color,
      created_at: folders.createdAt,
      word_count: sql<number>`count(distinct ${words.id})::int`,
    })
    .from(folders)
    .leftJoin(wordFolders, eq(wordFolders.folderId, folders.id))
    .leftJoin(
      words,
      and(eq(words.id, wordFolders.wordId), isNull(words.deletedAt)),
    )
    .where(eq(folders.userId, ctx.data.userId))
    .groupBy(folders.id)
    .orderBy(folders.name)

  // всего слов в словаре пользователя (для ограничения размера тренировки)
  const [t] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(words)
    .where(and(eq(words.userId, ctx.data.userId), isNull(words.deletedAt)))

  return json({ folders: rows, total: t?.total ?? 0 })
}

export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const body = await readJson<{ name?: unknown; icon?: unknown; color?: unknown }>(
    ctx.request,
  )
  const name = str(body?.name)
  if (!name) return error(400, 'name required')

  const db = getDb(ctx.env)
  const [row] = await db
    .insert(folders)
    .values({
      userId: ctx.data.userId,
      name,
      icon: cleanIcon(body?.icon),
      color: cleanColor(body?.color),
    })
    .returning({
      id: folders.id,
      name: folders.name,
      icon: folders.icon,
      color: folders.color,
      created_at: folders.createdAt,
    })

  return json({ folder: { ...row, word_count: 0 } }, { status: 201 })
}
