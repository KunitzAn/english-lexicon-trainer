import { and, eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { AuthedData } from '../../_lib/context'
import type { Env } from '../../_lib/env'
import { numParam } from '../../_lib/handler'
import { error, json } from '../../_lib/http'
import { trainingPresets } from '../../../db/schema'

export const onRequestDelete: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  const id = numParam(ctx, 'id')
  if (!id) return error(400, 'bad id')
  const db = getDb(ctx.env)
  const deleted = await db
    .delete(trainingPresets)
    .where(and(eq(trainingPresets.id, id), eq(trainingPresets.userId, ctx.data.userId)))
    .returning({ id: trainingPresets.id })
  if (!deleted.length) return error(404, 'not found')
  return json({ ok: true })
}
