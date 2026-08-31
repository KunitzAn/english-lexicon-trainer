import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../_lib/db'
import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { loadFolder } from '../_lib/guard'
import { error, json } from '../_lib/http'
import { NEW_SHARE, isNew, priorityOf } from '../_lib/priority'
import { words, wordFolders, wordSenses, wordSenseProgress } from '../../db/schema'

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50
const POOL_SIZE = 40

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

interface Cand {
  wordSenseId: number
  wordId: number
  text: string
  transcription: string | null
  isPhrase: boolean
  translation: string
  definitionEn: string | null
  example: string | null
  textNorm: string
  position: number
  correctCount: number | null
  incorrectCount: number | null
  lastTrainedAt: Date | string | null
}

function scored(c: Cand, now: number) {
  const prog =
    c.correctCount == null
      ? null
      : {
          correctCount: c.correctCount,
          incorrectCount: c.incorrectCount ?? 0,
          lastTrainedAt: c.lastTrainedAt,
        }
  return { c, isNew: isNew(prog), priority: priorityOf(prog, now) }
}

/** Автоподбор: топ по priority, доля новых значений ограничена NEW_SHARE. */
function pickAuto(items: ReturnType<typeof scored>[], limit: number) {
  const sorted = [...items].sort((a, b) => b.priority - a.priority)
  const fresh = sorted.filter((i) => i.isNew)
  const seen = sorted.filter((i) => !i.isNew)
  let nNew = Math.min(fresh.length, Math.ceil(limit * NEW_SHARE))
  const nSeen = Math.min(seen.length, limit - nNew)
  if (nSeen < limit - nNew) nNew = Math.min(fresh.length, limit - nSeen) // повторяемых не хватило
  return shuffle([...seen.slice(0, nSeen), ...fresh.slice(0, nNew)]).slice(0, limit)
}

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const uid = ctx.data.userId
  const url = new URL(ctx.request.url)

  const mode = url.searchParams.get('mode') === 'manual' ? 'manual' : 'auto'
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )
  const folderParam = url.searchParams.get('folder')
  const folderId = folderParam ? Number(folderParam) : null
  if (mode === 'manual' && !(folderId && Number.isInteger(folderId))) {
    return error(400, 'folder required for manual mode')
  }

  const db = getDb(ctx.env)

  if (folderId && Number.isInteger(folderId)) {
    const folder = await loadFolder(db, uid, folderId)
    if (!folder) return error(404, 'folder not found')
  }

  const base = db
    .select({
      wordSenseId: wordSenses.id,
      wordId: words.id,
      text: words.text,
      transcription: words.transcription,
      isPhrase: words.isPhrase,
      translation: wordSenses.translation,
      definitionEn: wordSenses.definitionEn,
      example: wordSenses.example,
      textNorm: words.textNorm,
      position: wordSenses.position,
      correctCount: wordSenseProgress.correctCount,
      incorrectCount: wordSenseProgress.incorrectCount,
      lastTrainedAt: wordSenseProgress.lastTrainedAt,
    })
    .from(wordSenses)
    .innerJoin(words, eq(words.id, wordSenses.wordId))
    .leftJoin(
      wordSenseProgress,
      eq(wordSenseProgress.wordSenseId, wordSenses.id),
    )
    .$dynamic()

  const where = and(eq(words.userId, uid), isNull(words.deletedAt), isNull(wordSenses.deletedAt))
  const cands: Cand[] = (folderId && Number.isInteger(folderId)
    ? await base
        .innerJoin(wordFolders, eq(wordFolders.wordId, words.id))
        .where(and(where, eq(wordFolders.folderId, folderId)))
    : await base.where(where)) as Cand[]

  const now = Date.now()
  const items = cands.map((c) => scored(c, now))

  const chosen =
    mode === 'manual'
      ? [...items]
          .sort(
            (a, b) =>
              a.c.textNorm.localeCompare(b.c.textNorm) ||
              a.c.position - b.c.position,
          )
          .slice(0, limit)
      : pickAuto(items, limit)

  const cards = chosen.map(({ c }) => ({
    word_sense_id: c.wordSenseId,
    word_id: c.wordId,
    text: c.text,
    transcription: c.transcription,
    is_phrase: c.isPhrase,
    translation: c.translation,
    definition_en: c.definitionEn,
    example: c.example,
  }))

  const inSet = new Set(cards.map((c) => c.translation.toLowerCase()))
  const poolSeen = new Set<string>()
  const pool: string[] = []
  for (const c of shuffle(cands)) {
    const key = c.translation.toLowerCase()
    if (inSet.has(key) || poolSeen.has(key)) continue
    poolSeen.add(key)
    pool.push(c.translation)
    if (pool.length >= POOL_SIZE) break
  }

  return json({
    mode,
    limit,
    new_count: chosen.filter((i) => i.isNew).length,
    cards,
    distractor_pool: pool,
  })
}
