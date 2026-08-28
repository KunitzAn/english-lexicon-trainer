export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status })
}

/**
 * Простая защита от cross-site POST: Origin должен совпадать с хостом запроса.
 * Для same-origin fetch этого достаточно.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true // не браузерный запрос или navigation
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}
