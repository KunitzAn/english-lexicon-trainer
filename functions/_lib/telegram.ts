/**
 * Проверка подписи данных Telegram Login Widget.
 * https://core.telegram.org/widgets/login#checking-authorization
 */

export interface TelegramAuthData {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

/** Данные виджета считаются свежими не дольше этого срока. */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function parseTelegramAuth(raw: unknown): TelegramAuthData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'number' || typeof o.auth_date !== 'number') return null
  if (typeof o.hash !== 'string') return null
  return o as unknown as TelegramAuthData
}

export async function verifyTelegramAuth(
  data: TelegramAuthData,
  botToken: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const now = Math.floor(Date.now() / 1000)
  if (now - data.auth_date > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, reason: 'stale' }
  }

  const fields = data as unknown as Record<string, unknown>
  const checkString = Object.keys(fields)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n')

  const enc = new TextEncoder()
  const secretKey = await crypto.subtle.digest('SHA-256', enc.encode(botToken))
  const key = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(checkString))

  return hex(sig) === data.hash ? { ok: true } : { ok: false, reason: 'bad_hash' }
}

export function displayName(data: TelegramAuthData): string | null {
  const parts = [data.first_name, data.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return data.username ?? null
}
