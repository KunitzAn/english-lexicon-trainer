import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from './db'
import { folders, words, wordSenses } from '../../db/schema'

export async function loadFolder(db: Db, userId: number, id: number) {
  const rows = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function loadWord(db: Db, userId: number, id: number) {
  const rows = await db
    .select()
    .from(words)
    .where(
      and(eq(words.id, id), eq(words.userId, userId), isNull(words.deletedAt)),
    )
    .limit(1)
  return rows[0] ?? null
}

/** Значение + проверка, что его слово принадлежит пользователю. */
export async function loadSense(db: Db, userId: number, id: number) {
  const rows = await db
    .select({ sense: wordSenses, wordId: words.id })
    .from(wordSenses)
    .innerJoin(words, eq(words.id, wordSenses.wordId))
    .where(
      and(
        eq(wordSenses.id, id),
        eq(words.userId, userId),
        isNull(wordSenses.deletedAt),
      ),
    )
    .limit(1)
  return rows[0]?.sense ?? null
}

/** Оставляет из списка только id папок, принадлежащих пользователю. */
export async function filterOwnedFolderIds(
  db: Db,
  userId: number,
  ids: number[],
): Promise<number[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.userId, userId))
  const owned = new Set(rows.map((r) => r.id))
  return ids.filter((id) => owned.has(id))
}

/** Оставляет только id слов пользователя (не удалённых). */
export async function filterOwnedWordIds(
  db: Db,
  userId: number,
  ids: number[],
): Promise<number[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: words.id })
    .from(words)
    .where(
      and(
        eq(words.userId, userId),
        isNull(words.deletedAt),
        inArray(words.id, ids),
      ),
    )
  return rows.map((r) => r.id)
}
