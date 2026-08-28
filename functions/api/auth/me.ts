import { eq } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json } from '../../_lib/http'
import { readCookie, SESSION_COOKIE, verifySession } from '../../_lib/session'
import { users } from '../../../db/schema'

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const token = readCookie(ctx.request, SESSION_COOKIE)
  if (!token) return error(401, 'no session')

  const payload = await verifySession(token, ctx.env.SESSION_SECRET)
  if (!payload) return error(401, 'invalid session')

  const db = getDb(ctx.env)
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.uid))
    .limit(1)
  const user = rows[0]
  if (!user) return error(401, 'user gone')

  return json({
    id: user.id,
    name: user.name,
    telegram_id: user.telegramId,
    is_owner: user.isOwner,
  })
}
