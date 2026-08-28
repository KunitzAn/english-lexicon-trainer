import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../../db/schema'
import type { Env } from './env'

/**
 * Клиент Drizzle поверх HTTP-драйвера Neon.
 * На Workers нельзя открывать сырой TCP — только этот драйвер.
 */
export function getDb(env: Env) {
  const sql = neon(env.DATABASE_URL)
  return drizzle(sql, { schema })
}

export type Db = ReturnType<typeof getDb>
