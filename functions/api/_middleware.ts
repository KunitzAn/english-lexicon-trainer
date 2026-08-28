import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { error } from '../_lib/http'
import { readCookie, SESSION_COOKIE, verifySession } from '../_lib/session'

/** Роуты, доступные без сессии. */
const PUBLIC_PREFIXES = ['/api/health', '/api/auth/']

export const onRequest: PagesFunction<Env, string, Partial<AuthedData>> = async (
  ctx,
) => {
  const { pathname } = new URL(ctx.request.url)
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return ctx.next()
  }

  const token = readCookie(ctx.request, SESSION_COOKIE)
  const payload = token
    ? await verifySession(token, ctx.env.SESSION_SECRET)
    : null
  if (!payload) return error(401, 'unauthorized')

  ctx.data.userId = payload.uid
  return ctx.next()
}
