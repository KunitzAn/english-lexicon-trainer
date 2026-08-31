import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '../_lib/db'
import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { readJson } from '../_lib/handler'
import { error, json } from '../_lib/http'
import {
  attempts,
  exercises,
  words,
  wordSenses,
  wordSenseProgress,
} from '../../db/schema'

interface AttemptInput {
  client_id?: unknown
  word_sense_id?: unknown
  exercise_id?: unknown
  exercise_type?: unknown
  is_correct?: unknown
  hint_used?: unknown
}

interface CleanAttempt {
  clientId: string
  wordSenseId: number
  exerciseId: number | null
  exerciseType: string
  isCorrect: boolean | null
  hintUsed: boolean
}

function clean(a: AttemptInput): CleanAttempt | null {
  const clientId = typeof a.client_id === 'string' ? a.client_id.trim() : ''
  const wordSenseId = Number(a.word_sense_id)
  const exerciseType =
    typeof a.exercise_type === 'string' ? a.exercise_type.trim().slice(0, 40) : ''
  if (!clientId || clientId.length > 100) return null
  if (!Number.isInteger(wordSenseId) || wordSenseId <= 0) return null
  if (!exerciseType) return null
  const exId = Number(a.exercise_id)
  return {
    clientId,
    wordSenseId,
    exerciseId: Number.isInteger(exId) && exId > 0 ? exId : null,
    exerciseType,
    isCorrect: a.is_correct === null || a.is_correct === undefined ? null : !!a.is_correct,
    hintUsed: !!a.hint_used,
  }
}

/** Записать попытки сессии. Идемпотентно по client_id; прогресс пересчитывается. */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const uid = ctx.data.userId
  const body = await readJson<{ attempts?: unknown } & AttemptInput>(ctx.request)

  const raw: AttemptInput[] = Array.isArray(body?.attempts)
    ? (body!.attempts as AttemptInput[])
    : body
      ? [body as AttemptInput]
      : []

  const parsed = raw.map(clean).filter((a): a is CleanAttempt => a !== null)
  if (!parsed.length) return error(400, 'no valid attempts')

  const db = getDb(ctx.env)

  const senseIds = [...new Set(parsed.map((a) => a.wordSenseId))]
  const ownedRows = await db
    .select({ id: wordSenses.id })
    .from(wordSenses)
    .innerJoin(words, eq(words.id, wordSenses.wordId))
    .where(
      and(
        eq(words.userId, uid),
        isNull(words.deletedAt),
        isNull(wordSenses.deletedAt),
        inArray(wordSenses.id, senseIds),
      ),
    )
  const owned = new Set(ownedRows.map((r) => r.id))
  const rows = parsed.filter((a) => owned.has(a.wordSenseId))
  if (!rows.length) return json({ recorded: 0, progress: [] })

  const inserted = await db
    .insert(attempts)
    .values(
      rows.map((a) => ({
        userId: uid,
        clientId: a.clientId,
        wordSenseId: a.wordSenseId,
        exerciseId: a.exerciseId,
        exerciseType: a.exerciseType,
        isCorrect: a.isCorrect,
        hintUsed: a.hintUsed,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: attempts.id })

  const affected = [...new Set(rows.map((a) => a.wordSenseId))]
  const agg = await db
    .select({
      wordSenseId: attempts.wordSenseId,
      correct: sql<number>`count(*) filter (where ${attempts.isCorrect} is true)`,
      incorrect: sql<number>`count(*) filter (where ${attempts.isCorrect} is false)`,
      last: sql<string>`max(${attempts.answeredAt})`,
    })
    .from(attempts)
    .where(
      and(eq(attempts.userId, uid), inArray(attempts.wordSenseId, affected)),
    )
    .groupBy(attempts.wordSenseId)

  if (agg.length) {
    await db
      .insert(wordSenseProgress)
      .values(
        agg.map((a) => ({
          wordSenseId: a.wordSenseId,
          userId: uid,
          correctCount: Number(a.correct),
          incorrectCount: Number(a.incorrect),
          lastTrainedAt: new Date(a.last),
        })),
      )
      .onConflictDoUpdate({
        target: wordSenseProgress.wordSenseId,
        set: {
          correctCount: sql`excluded.correct_count`,
          incorrectCount: sql`excluded.incorrect_count`,
          lastTrainedAt: sql`excluded.last_trained_at`,
        },
      })
  }

  // пройденные без ошибок сгенерированные упражнения в запасе не держим (PLAN §5)
  const doneExIds = [
    ...new Set(
      rows
        .filter((a) => a.exerciseId != null && a.isCorrect === true)
        .map((a) => a.exerciseId as number),
    ),
  ]
  if (doneExIds.length) {
    await db
      .delete(exercises)
      .where(and(eq(exercises.userId, uid), inArray(exercises.id, doneExIds)))
  }

  return json({
    recorded: inserted.length,
    progress: agg.map((a) => ({
      word_sense_id: a.wordSenseId,
      correct_count: Number(a.correct),
      incorrect_count: Number(a.incorrect),
    })),
  })
}
