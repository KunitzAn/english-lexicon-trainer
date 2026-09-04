import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '../_lib/db'
import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { json } from '../_lib/http'
import {
  loadMasterySettings,
  localDay,
  masteryForSenses,
  tzOffsetOf,
} from '../_lib/mastery'
import {
  attempts,
  folders,
  wordFolders,
  words,
  wordSenses,
  wordSenseProgress,
} from '../../db/schema'

/**
 * Текущая серия дней подряд с хотя бы одной попыткой — по локальной полуночи
 * пользователя. «Жива», пока сегодня ещё можно позаниматься.
 */
function computeStreak(days: Set<string>, offsetMin: number): number {
  const oneDay = 86_400_000
  let cursor = Date.now()
  if (!days.has(localDay(cursor, offsetMin))) {
    cursor -= oneDay
    if (!days.has(localDay(cursor, offsetMin))) return 0
  }
  let n = 0
  while (days.has(localDay(cursor, offsetMin))) {
    n++
    cursor -= oneDay
  }
  return n
}

const HEATMAP_DAYS = 84 // 12 недель
const WEAK_LIMIT = 8

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const uid = ctx.data.userId
  const db = getDb(ctx.env)
  const offsetMin = tzOffsetOf(new URL(ctx.request.url))
  const settings = await loadMasterySettings(db, uid)

  // значения всех живых слов пользователя (+ текст слова для «проблемных»)
  const senseRows = await db
    .select({
      id: wordSenses.id,
      wordId: wordSenses.wordId,
      text: words.text,
      translation: wordSenses.translation,
    })
    .from(wordSenses)
    .innerJoin(words, eq(wordSenses.wordId, words.id))
    .where(
      and(
        eq(words.userId, uid),
        isNull(words.deletedAt),
        isNull(wordSenses.deletedAt),
      ),
    )

  const senseMastery = await masteryForSenses(
    db,
    uid,
    senseRows.map((r) => r.id),
    offsetMin,
    settings,
  )

  // «тронутые» значения — по факту попыток (авторитетнее, чем прогресс-строки)
  const touchedRows = await db
    .selectDistinct({ id: attempts.wordSenseId })
    .from(attempts)
    .where(eq(attempts.userId, uid))
  const touched = new Set(touchedRows.map((r) => r.id))

  // агрегат по слову: минимум по значениям + тронуто ли хоть одно
  const perWord = new Map<number, { m: number; touched: boolean }>()
  for (const r of senseRows) {
    const cur = perWord.get(r.wordId) ?? { m: 100, touched: false }
    cur.m = Math.min(cur.m, senseMastery.get(r.id) ?? 0)
    if (touched.has(r.id)) cur.touched = true
    perWord.set(r.wordId, cur)
  }

  const buckets = { new: 0, in_progress: 0, learned: 0 }
  for (const { m, touched: t } of perWord.values()) {
    if (m >= settings.learnedThreshold) buckets.learned++
    else if (m === 0 && !t) buckets.new++
    else buckets.in_progress++
  }

  // выученность по темам — среднее по словам темы
  const folderRows = await db
    .select({ id: folders.id, name: folders.name, icon: folders.icon, color: folders.color })
    .from(folders)
    .where(eq(folders.userId, uid))
    .orderBy(folders.name)
  const wordIds = [...perWord.keys()]
  const links = wordIds.length
    ? await db
        .select({ folderId: wordFolders.folderId, wordId: wordFolders.wordId })
        .from(wordFolders)
        .where(inArray(wordFolders.wordId, wordIds))
    : []
  const byFolder = new Map<number, number[]>()
  for (const l of links) {
    const arr = byFolder.get(l.folderId) ?? []
    arr.push(l.wordId)
    byFolder.set(l.folderId, arr)
  }
  const themes = folderRows.map((f) => {
    const ws = byFolder.get(f.id) ?? []
    const sum = ws.reduce((acc, id) => acc + (perWord.get(id)?.m ?? 0), 0)
    return {
      id: f.id,
      name: f.name,
      icon: f.icon,
      color: f.color,
      word_count: ws.length,
      mastery: ws.length ? Math.round(sum / ws.length) : 0,
    }
  })

  // серия дней + тепловая карта
  const dayRows = await db
    .selectDistinct({
      day: sql<string>`to_char((${attempts.answeredAt} at time zone 'UTC') + make_interval(mins => ${offsetMin}), 'YYYY-MM-DD')`,
    })
    .from(attempts)
    .where(eq(attempts.userId, uid))

  const since = new Date(Date.now() - HEATMAP_DAYS * 86_400_000)
  const heatRows = await db
    .select({
      day: sql<string>`to_char((${attempts.answeredAt} at time zone 'UTC') + make_interval(mins => ${offsetMin}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(attempts)
    .where(and(eq(attempts.userId, uid), gte(attempts.answeredAt, since)))
    .groupBy(sql`1`)

  // топ «проблемных» — тронутые значения с самой низкой выученностью
  const weak = senseRows
    .filter((r) => touched.has(r.id) && (senseMastery.get(r.id) ?? 0) < settings.learnedThreshold)
    .map((r) => ({
      word_id: r.wordId,
      text: r.text,
      translation: r.translation,
      mastery: senseMastery.get(r.id) ?? 0,
    }))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, WEAK_LIMIT)

  const [pAgg] = await db
    .select({
      correct: sql<number>`coalesce(sum(${wordSenseProgress.correctCount}), 0)::int`,
      incorrect: sql<number>`coalesce(sum(${wordSenseProgress.incorrectCount}), 0)::int`,
    })
    .from(wordSenseProgress)
    .where(eq(wordSenseProgress.userId, uid))

  const correct = pAgg?.correct ?? 0
  const incorrect = pAgg?.incorrect ?? 0

  return json({
    words_total: perWord.size,
    senses_total: senseRows.length,
    senses_attempted: touched.size,
    correct,
    incorrect,
    accuracy: correct + incorrect > 0 ? correct / (correct + incorrect) : null,
    streak_days: computeStreak(new Set(dayRows.map((r) => r.day)), offsetMin),
    active_days: dayRows.length,
    buckets,
    themes,
    heatmap: heatRows,
    weak,
  })
}
