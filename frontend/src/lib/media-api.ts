import { ApiError, apiRequest } from '@/lib/api'
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

export async function signIn(
  login: string,
  password: string,
): Promise<LibrarySession> {
  const response = await apiRequest(
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
  const response = await apiRequest(
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
  const response = await apiRequest(
    mediaPath,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
    'Nie udało się przesłać pliku.',
  )
  return toLibraryMedia(await response.json())
}

export async function deleteMedia(token: string, id: string) {
  try {
    await apiRequest(
      `${mediaPath}/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      'Nie udało się usunąć pliku.',
    )
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error
  }
}
