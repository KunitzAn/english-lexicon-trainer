import { and, arrayOverlaps, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { readJson } from '../../_lib/handler'
import { json } from '../../_lib/http'
import { chatJson, extractJson } from '../../_lib/openrouter'
import {
  buildPrompt,
  validateBatch,
  type GlossItem,
  type SenseForGen,
} from '../../_lib/gen-exercises'
import {
  bumpQuota,
  exhaustQuota,
  quotaLeft,
  refundQuota,
} from '../../_lib/quota'
import { exercises, generationLog, words, wordSenses } from '../../../db/schema'

const MAX_PER_SESSION = 25
const RESERVE_MAX_AGE_DAYS = 7

type OutItem = { id: number; type: string; payload: unknown }

/** Собрать контекстные упражнения на сессию: сначала из запаса, потом генерация. */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const uid = ctx.data.userId
  const body = await readJson<{ sense_ids?: unknown }>(ctx.request)
  const senseIds = Array.isArray(body?.sense_ids)
    ? [
        ...new Set(
          (body!.sense_ids as unknown[])
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
        ),
      ]
    : []
  if (!senseIds.length) {
    return json({ exercises: [], quota_left: 0, degraded: 'no_input' })
  }
  if (!ctx.env.OPENROUTER_API_KEY) {
    return json({ exercises: [], quota_left: 0, degraded: 'no_key' })
  }

  const db = getDb(ctx.env)

  const rows = await db
    .select({
      senseId: wordSenses.id,
      translation: wordSenses.translation,
      partOfSpeech: wordSenses.partOfSpeech,
      definitionEn: wordSenses.definitionEn,
      example: wordSenses.example,
      text: words.text,
      transcription: words.transcription,
    })
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
  if (!rows.length) {
    return json({ exercises: [], quota_left: await quotaLeft(db), degraded: 'no_input' })
  }

  const gloss = new Map<number, GlossItem>()
  for (const r of rows) {
    gloss.set(r.senseId, {
      word_sense_id: r.senseId,
      text: r.text,
      transcription: r.transcription,
      translation: r.translation,
      definition_en: r.definitionEn,
      example: r.example,
    })
  }

  // GC устаревшего запаса
  const cutoff = new Date(Date.now() - RESERVE_MAX_AGE_DAYS * 86_400_000)
  await db
    .delete(exercises)
    .where(and(eq(exercises.userId, uid), lt(exercises.createdAt, cutoff)))

  // 1) берём из запаса всё, что покрывает нужные значения. Упражнение живёт в
  // запасе, пока не отвечено верно (тогда его удаляет /api/attempts).
  const reserve = await db
    .select({
      id: exercises.id,
      type: exercises.type,
      payload: exercises.payload,
      targets: exercises.targetSenseIds,
    })
    .from(exercises)
    .where(
      and(
        eq(exercises.userId, uid),
        gt(exercises.createdAt, cutoff),
        arrayOverlaps(exercises.targetSenseIds, senseIds),
      ),
    )
    .limit(MAX_PER_SESSION * 2)

  const covered = new Set<number>()
  const result: OutItem[] = []
  for (const r of reserve) {
    const t = (r.targets as number[])[0]
    if (t == null || covered.has(t) || !senseIds.includes(t)) continue
    covered.add(t)
    result.push({ id: r.id, type: r.type, payload: r.payload })
    if (result.length >= MAX_PER_SESSION) break
  }

  // 2) добираем генерацией
  const need = rows
    .filter((r) => !covered.has(r.senseId))
    .slice(0, MAX_PER_SESSION - result.length)

  let degraded: string | null = null
  let genDetail: string | null = null
  let left = await quotaLeft(db)

  if (need.length && left > 0) {
    const senses: SenseForGen[] = need.map((r) => ({
      sense_id: r.senseId,
      word: r.text,
      translation: r.translation,
      part_of_speech: r.partOfSpeech,
      definition_en: r.definitionEn,
      example: r.example,
    }))
    left = await bumpQuota(db)
    const { system, user } = buildPrompt(senses)
    const res = await chatJson(ctx.env.OPENROUTER_API_KEY, system, user)

    let valid: ReturnType<typeof validateBatch>['valid'] = []
    let rejects: string[] = []
    let errKind: string | null = res.errorKind
    if (res.ok && res.content) {
      const parsed = extractJson(res.content)
      if (!parsed) errKind = 'bad_json'
      else {
        const v = validateBatch(parsed, senses, gloss)
        valid = v.valid
        rejects = v.rejects
        if (!valid.length) errKind = 'invalid'
      }
    }

    // 429 именно про дневной лимит OpenRouter (не про 20 req/min)
    const dailyLimitHit =
      res.errorKind === 'http_429' &&
      /per[- ]?day|free-models-per-day|daily/i.test(res.detail ?? '')

    // причину провала — в generation_log и в логи Functions
    const detailParts: string[] = []
    detailParts.push(`senses=[${senses.map((s) => s.sense_id).join(',')}]`)
    if (res.errorKind) detailParts.push(`errorKind=${res.errorKind}`)
    if (res.detail) detailParts.push(`openrouter: ${res.detail}`)
    if (errKind === 'bad_json' && res.content)
      detailParts.push(`не распарсился JSON; content: ${res.content.slice(0, 900)}`)
    if (rejects.length) detailParts.push(`отбраковано:\n- ${rejects.join('\n- ')}`)
    const detail = valid.length ? null : detailParts.join('\n').slice(0, 4000)

    if (!valid.length) {
      if (dailyLimitHit) {
        // дневной лимит исчерпан — обнуляем квоту до 00:00 UTC (совпадает со сбросом OpenRouter)
        await exhaustQuota(db)
        left = 0
        console.warn(
          `[generate] uid=${uid} OpenRouter дневной лимит (429) — квота обнулена до 00:00 UTC\n${detail}`,
        )
      } else if (!res.ok) {
        // запрос не дошёл до модели — вернём единицу квоты
        left = await refundQuota(db)
        console.warn(
          `[generate] uid=${uid} model=${res.model ?? 'unknown'} errorKind=${errKind ?? 'invalid'} (refund)\n${detail}`,
        )
      } else {
        console.warn(
          `[generate] uid=${uid} model=${res.model ?? 'unknown'} errorKind=${errKind ?? 'invalid'}\n${detail}`,
        )
      }
    }

    await db.insert(generationLog).values({
      model: res.model ?? 'unknown',
      ok: valid.length > 0,
      errorKind: valid.length
        ? null
        : dailyLimitHit
          ? 'http_429_daily'
          : errKind ?? 'invalid',
      detail,
    })

    if (valid.length) {
      const inserted = await db
        .insert(exercises)
        .values(
          valid.map((v) => ({
            userId: uid,
            type: v.type,
            payload: v.payload,
            targetSenseIds: [v.word_sense_id],
            status: 'reserve',
          })),
        )
        .returning({
          id: exercises.id,
          type: exercises.type,
          payload: exercises.payload,
        })
      for (const ins of inserted) {
        result.push({ id: ins.id, type: ins.type, payload: ins.payload })
      }
    } else {
      degraded = dailyLimitHit ? 'quota' : 'model_failed'
      genDetail = `${dailyLimitHit ? 'http_429_daily' : errKind ?? 'invalid'}: ${
        detail ?? ''
      }`.slice(0, 4000)
    }
  } else if (need.length && left <= 0) {
    degraded = 'quota'
  }

  return json({
    exercises: result,
    quota_left: left,
    degraded,
    gen_detail: genDetail,
  })
}
