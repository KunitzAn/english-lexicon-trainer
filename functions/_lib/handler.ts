import type { AuthedData } from './context'
import type { Env } from './env'

export type Ctx = Parameters<PagesFunction<Env, string, AuthedData>>[0]

export async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export function numParam(ctx: Ctx, key: string): number | null {
  const raw = Array.isArray(ctx.params[key]) ? ctx.params[key]![0] : ctx.params[key]
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
