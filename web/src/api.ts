export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API ${status}: ${body}`)
    this.name = 'ApiError'
  }
}

/** Обёртка над fetch к `/api/*`. Куки сессии передаются автоматически. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => ''))
  }
  return (await res.json()) as T
}
