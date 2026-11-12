import type { MediaItem } from '@/types/content'

export type LibraryMedia = Omit<MediaItem, 'artwork' | 'duration'>

export interface LibrarySession {
  id: number
  login: string
  token: string
}

const mediaPath = '/api/media'
const authorizationPath = '/api/authorization'
const mediaExtensions = [
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.webp',
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
]

export const mediaAccept = mediaExtensions.join(',')
export const sessionExpiredMessage = 'Sesja wygasła. Zaloguj się ponownie.'
export const mediaQueryKey = (sessionId?: number) =>
  ['library-media', sessionId] as const
let nextSessionId = 0

export class MediaApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function isUnauthorized(error: unknown) {
  return error instanceof MediaApiError && error.status === 401
}

async function request(path: string, init: RequestInit, failure: string) {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new Error('Nie udało się połączyć z serwerem.')
  }

  if (!response.ok) {
    const body =
      response.status < 500 ? await response.json().catch(() => null) : null
    throw new MediaApiError(
      response.status,
      typeof body?.error === 'string' ? body.error : failure,
    )
  }

  return response
}

export async function hasAnyUsers(signal: AbortSignal): Promise<boolean> {
  const response = await request(
    `${authorizationPath}/has-any-users`,
    { signal, cache: 'no-store' },
    'Nie udało się sprawdzić, czy skonfigurowano konto.',
  )
  const hasUsers: unknown = await response.json().catch(() => null)
  if (typeof hasUsers !== 'boolean') {
    throw new Error('Serwer zwrócił nieprawidłowy stan konta.')
  }
  return hasUsers
}

export async function registerFirstUser(login: string, password: string) {
  try {
    await request(
      `${authorizationPath}/register-user`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      },
      'Nie udało się utworzyć konta.',
    )
    return true
  } catch (error) {
    if (error instanceof MediaApiError && error.status === 409) return false
    throw error
  }
}

export async function signIn(
  login: string,
  password: string,
): Promise<LibrarySession> {
  const response = await request(
    `${authorizationPath}/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    },
    'Nie udało się zalogować. Sprawdź login i hasło.',
  )
  const data = await response.json()
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error('Serwer nie zwrócił tokenu logowania.')
  }

  return { id: ++nextSessionId, login, token: data.access_token }
}

const sizeFormat = new Intl.NumberFormat('pl', { maximumFractionDigits: 1 })
const dateFormat = new Intl.DateTimeFormat('pl', { dateStyle: 'short' })

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${sizeFormat.format(bytes / 1024)} KB`
  return `${sizeFormat.format(bytes / 1024 ** 2)} MB`
}

function toLibraryMedia(data: unknown): LibraryMedia {
  const item: Record<string, unknown> =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : {}
  if (
    typeof item.id !== 'string' ||
    typeof item.originalName !== 'string' ||
    (item.kind !== 'Image' && item.kind !== 'Video') ||
    typeof item.sizeBytes !== 'number' ||
    !Number.isFinite(item.sizeBytes) ||
    item.sizeBytes < 0 ||
    typeof item.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(item.createdAt))
  ) {
    throw new Error('Serwer zwrócił nieprawidłowe metadane pliku.')
  }

  const extension = item.originalName.match(/\.([^.]+)$/)?.[1]
  return {
    id: item.id,
    name: item.originalName,
    kind: item.kind === 'Video' ? 'video' : 'image',
    format: extension?.toUpperCase() ?? 'Plik',
    size: formatSize(item.sizeBytes),
    addedAt: dateFormat.format(new Date(item.createdAt)),
  }
}

export async function listMedia(token: string, signal: AbortSignal) {
  const response = await request(
    mediaPath,
    { headers: { Authorization: `Bearer ${token}` }, signal },
    'Nie udało się pobrać biblioteki mediów.',
  )
  const items: unknown = await response.json()
  if (!Array.isArray(items)) {
    throw new Error('Serwer zwrócił nieprawidłową listę plików.')
  }
  return items.map(toLibraryMedia)
}

export async function uploadMedia(token: string, file: File) {
  if (file.size === 0) throw new Error('Wybierz plik, który nie jest pusty.')
  if (
    !mediaExtensions.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    )
  ) {
    throw new Error('Wybierz zdjęcie lub film w obsługiwanym formacie.')
  }

  const body = new FormData()
  body.append('file', file)
  const response = await request(
    mediaPath,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
    'Nie udało się przesłać pliku.',
  )
  return toLibraryMedia(await response.json())
}

export async function deleteMedia(token: string, id: string) {
  try {
    await request(
      `${mediaPath}/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      'Nie udało się usunąć pliku.',
    )
  } catch (error) {
    if (!(error instanceof MediaApiError && error.status === 404)) throw error
  }
}
