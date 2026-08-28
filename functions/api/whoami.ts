import type { AuthedData } from '../_lib/context'
import type { Env } from '../_lib/env'
import { json } from '../_lib/http'

/** Защищённый пробный роут: доходит сюда только с валидной сессией. */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (
  ctx,
) => {
  return json({ userId: ctx.data.userId })
}
