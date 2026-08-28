import { reactive } from 'vue'

export interface Me {
  id: number
  name: string | null
  telegram_id: number
  is_owner: boolean
}

export const auth = reactive<{ user: Me | null; loaded: boolean }>({
  user: null,
  loaded: false,
})

export async function fetchMe(): Promise<void> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    auth.user = res.ok ? ((await res.json()) as Me) : null
  } catch {
    auth.user = null
  } finally {
    auth.loaded = true
  }
}

export async function loginWithTelegram(tgUser: unknown): Promise<Me> {
  const res = await fetch('/api/auth/telegram', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tgUser),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `login failed (${res.status})`)
  }
  const me = (await res.json()) as Me
  auth.user = me
  return me
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  auth.user = null
}
