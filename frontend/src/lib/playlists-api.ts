import { apiRequest } from '@/lib/api'

export interface PlaylistItemInput {
  mediaId: string
  durationSeconds: number
}

interface SavedPlaylistItem extends PlaylistItemInput {
  id: string
  position: number
}

export interface SavedPlaylist {
  id: string
  name: string
  version: string
  items: SavedPlaylistItem[]
}

export const playlistLimits = { name: 128, items: 200, duration: 86400 }

const playlistsPath = '/api/playlists'
export const playlistQueryKey = (sessionId?: number) =>
  ['playlists', sessionId] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSavedItem(value: unknown): value is SavedPlaylistItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.mediaId === 'string' &&
    typeof value.position === 'number' &&
    Number.isInteger(value.position) &&
    value.position >= 0 &&
    typeof value.durationSeconds === 'number' &&
    Number.isInteger(value.durationSeconds) &&
    value.durationSeconds >= 1 &&
    value.durationSeconds <= playlistLimits.duration
  )
}

function toPlaylist(value: unknown): SavedPlaylist {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.version !== 'string' ||
    !Array.isArray(value.items) ||
    !value.items.every(isSavedItem)
  ) {
    throw new Error('Serwer zwrócił nieprawidłowe dane playlisty.')
  }
  return {
    id: value.id,
    name: value.name,
    version: value.version,
    items: value.items.toSorted((a, b) => a.position - b.position),
  }
}

export async function listPlaylists(token: string, signal: AbortSignal) {
  const response = await apiRequest(
    playlistsPath,
    { headers: { Authorization: `Bearer ${token}` }, signal },
    'Nie udało się pobrać playlist.',
  )
  const data: unknown = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Serwer zwrócił nieprawidłową listę playlist.')
  }
  return data.map(toPlaylist)
}

export async function savePlaylist(
  token: string,
  draft: { name: string; items: PlaylistItemInput[] },
  original?: SavedPlaylist,
) {
  const response = await apiRequest(
    original
      ? `${playlistsPath}/${encodeURIComponent(original.id)}`
      : playlistsPath,
    {
      method: original ? 'PUT' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...draft, version: original?.version }),
    },
    'Nie udało się zapisać playlisty.',
  )
  return toPlaylist(await response.json())
}
