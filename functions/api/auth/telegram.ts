import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../_lib/db'
import type { Env } from '../../_lib/env'
import { error, json, sameOrigin } from '../../_lib/http'
import { sessionCookie, signSession } from '../../_lib/session'
import {
  displayName,
  parseTelegramAuth,
  verifyTelegramAuth,
} from '../../_lib/telegram'
import { users } from '../../../db/schema'

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!sameOrigin(ctx.request)) return error(403, 'bad origin')

  const body = await ctx.request.json().catch(() => null)
  const data = parseTelegramAuth(body)
  if (!data) return error(400, 'bad payload')

  const check = await verifyTelegramAuth(data, ctx.env.TELEGRAM_BOT_TOKEN)
  if (!check.ok) return error(401, `telegram auth failed: ${check.reason}`)

  const db = getDb(ctx.env)
  const name = displayName(data)

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, data.id))
    .limit(1)

  let user = existing[0]

  if (!user) {
    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
    if ((countRows[0]?.count ?? 0) > 0) {
      return error(403, 'not invited')
    }
    // Первый вход — становится владельцем.
    const inserted = await db
      .insert(users)
      .values({ telegramId: data.id, name, isOwner: true })
      .returning()
    user = inserted[0]!
  } else if (name && name !== user.name) {
    await db.update(users).set({ name }).where(eq(users.id, user.id))
    user = { ...user, name }
  }

  const token = await signSession(
    { uid: user.id, tg: user.telegramId, name: user.name },
    ctx.env.SESSION_SECRET,
  )

  return json(
    { id: user.id, name: user.name, telegram_id: user.telegramId, is_owner: user.isOwner },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  )
}
