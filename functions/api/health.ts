import { sql } from 'drizzle-orm'
import { getDb } from '../_lib/db'
import type { Env } from '../_lib/env'

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  let db_ok = false
  let db_error: string | undefined

  try {
    const db = getDb(ctx.env)
    await db.execute(sql`select 1`)
    db_ok = true
  } catch (e) {
    db_error = e instanceof Error ? e.message : String(e)
  }

  return Response.json({
    ok: true,
    db_ok,
    db_error,
    time: new Date().toISOString(),
  })
}
