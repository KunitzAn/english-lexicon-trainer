/**
 * Минимальный JWT (HS256) на WebCrypto — без внешних зависимостей.
 * Хранит внутренний user_id; кладётся в httpOnly-куку.
 */

const ALG = { name: 'HMAC', hash: 'SHA-256' } as const

export interface SessionPayload {
  uid: number
  tg: number
  name: string | null
  iat: number
  exp: number
}

export const SESSION_COOKIE = 'session'
export const SESSION_TTL_SECONDS = 60 * 24 * 60 * 60 // 60 дней

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8(secret), ALG, false, [
    'sign',
    'verify',
  ])
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function signSession(
  data: Pick<SessionPayload, 'uid' | 'tg' | 'name'>,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    ...data,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }
  const header = b64urlEncode(utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64urlEncode(utf8(JSON.stringify(payload)))
  const signingInput = `${header}.${body}`
  const key = await importKey(secret)
  const sig = new Uint8Array(
    await crypto.subtle.sign(ALG, key, utf8(signingInput)),
  )
  return `${signingInput}.${b64urlEncode(sig)}`
}

export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts as [string, string, string]
  const key = await importKey(secret)
  const expected = new Uint8Array(
    await crypto.subtle.sign(ALG, key, utf8(`${header}.${body}`)),
  )
  if (!timingSafeEqual(expected, b64urlDecode(sig))) return null

  let payload: SessionPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) {
    return null
  }
  return payload
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

export function sessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ')
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}
