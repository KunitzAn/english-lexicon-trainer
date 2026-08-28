import type { Env } from '../../_lib/env'
import { clearSessionCookie } from '../../_lib/session'
import { json, sameOrigin, error } from '../../_lib/http'

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!sameOrigin(ctx.request)) return error(403, 'bad origin')
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } })
}
