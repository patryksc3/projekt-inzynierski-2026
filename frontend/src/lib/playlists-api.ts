import { ApiError, request } from '@/lib/api'

export interface PlaylistItem {
  id: string
  mediaItemId: string
  kind: 'Image' | 'Video'
  originalName: string
  durationSeconds: number
  index: number
}

export interface SavedPlaylist {
  id: string
  name: string
  items: PlaylistItem[]
}

export interface PlaylistInput {
  name: string
  items: { mediaItemId: string; durationSeconds: number }[]
}

const playlistsPath = '/api/playlists'
export const playlistsQueryKey = (sessionId?: number) =>
  ['playlists', sessionId] as const

function toPlaylistItem(data: unknown): PlaylistItem {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('id' in data) ||
    typeof data.id !== 'string' ||
    !('mediaItemId' in data) ||
    typeof data.mediaItemId !== 'string' ||
    !('kind' in data) ||
    (data.kind !== 'Image' && data.kind !== 'Video') ||
    !('originalName' in data) ||
    typeof data.originalName !== 'string' ||
    !('durationSeconds' in data) ||
    typeof data.durationSeconds !== 'number' ||
    !Number.isInteger(data.durationSeconds) ||
    data.durationSeconds < 1 ||
    !('index' in data) ||
    typeof data.index !== 'number' ||
    !Number.isInteger(data.index) ||
    data.index < 0
  ) {
    throw new Error('Serwer zwrócił nieprawidłowy element playlisty.')
  }
  return {
    id: data.id,
    mediaItemId: data.mediaItemId,
    kind: data.kind,
    originalName: data.originalName,
    durationSeconds: data.durationSeconds,
    index: data.index,
  }
}

function toPlaylist(data: unknown): SavedPlaylist {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('id' in data) ||
    typeof data.id !== 'string' ||
    !('name' in data) ||
    typeof data.name !== 'string' ||
    !('items' in data) ||
    !Array.isArray(data.items)
  ) {
    throw new Error('Serwer zwrócił nieprawidłową playlistę.')
  }
  return {
    id: data.id,
    name: data.name,
    items: data.items.map(toPlaylistItem).sort((a, b) => a.index - b.index),
  }
}

export async function listPlaylists(token: string, signal: AbortSignal) {
  const response = await request(
    playlistsPath,
    { headers: { Authorization: `Bearer ${token}` }, signal },
    'Nie udało się pobrać playlist.',
  )
  const items: unknown = await response.json()
  if (!Array.isArray(items))
    throw new Error('Serwer zwrócił nieprawidłową listę playlist.')
  return items.map(toPlaylist)
}

export async function getPlaylist(
  token: string,
  id: string,
  signal: AbortSignal,
) {
  try {
    const response = await request(
      `${playlistsPath}/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
      'Nie udało się pobrać playlisty.',
    )
    return toPlaylist(await response.json())
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(
        404,
        'Ta playlista została usunięta. Odśwież listę playlist.',
      )
    }
    throw error
  }
}

export async function savePlaylist(
  token: string,
  input: PlaylistInput,
  id?: string,
) {
  const response = await request(
    id ? `${playlistsPath}/${encodeURIComponent(id)}` : playlistsPath,
    {
      method: id ? 'PUT' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    'Nie udało się zapisać playlisty.',
  )
  return toPlaylist(await response.json())
}

export async function deletePlaylist(token: string, id: string) {
  try {
    await request(
      `${playlistsPath}/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      'Nie udało się usunąć playlisty.',
    )
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error
  }
}

export function formatPlaylistDuration(items: { durationSeconds: number }[]) {
  const total = items.reduce((sum, item) => sum + item.durationSeconds, 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const time = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  return hours ? `${hours}:${time}` : time
}
