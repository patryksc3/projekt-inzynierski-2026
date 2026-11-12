import { apiRequest } from '@/lib/api'

interface NamedResource {
  id: string
  name: string
}

export interface ScheduleBlockInput {
  deviceId: string
  playlistId: string
  startsAt: string
  endsAt: string
}

export interface ScheduleBlock extends ScheduleBlockInput {
  id: string
  deviceName: string
  playlistName: string
  version: string
}

const schedulePath = '/api/schedule'
export const scheduleQueryKey = (sessionId?: number) =>
  ['schedule', sessionId] as const
export const devicesQueryKey = (sessionId?: number) =>
  ['schedule-devices', sessionId] as const

function isNamedResource(value: unknown): value is NamedResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

function isScheduleBlock(value: unknown): value is ScheduleBlock {
  if (typeof value !== 'object' || value === null) return false
  const block = value as Record<string, unknown>
  return (
    typeof block.id === 'string' &&
    typeof block.deviceId === 'string' &&
    typeof block.deviceName === 'string' &&
    typeof block.playlistId === 'string' &&
    typeof block.playlistName === 'string' &&
    typeof block.version === 'string' &&
    typeof block.startsAt === 'string' &&
    typeof block.endsAt === 'string' &&
    Date.parse(block.startsAt) < Date.parse(block.endsAt)
  )
}

export async function listDevices(token: string, signal: AbortSignal) {
  const response = await apiRequest(
    '/api/devices/get-all-devices',
    { headers: { Authorization: `Bearer ${token}` }, signal },
    'Nie udało się pobrać ekranów.',
  )
  const data: unknown = await response.json()
  if (!Array.isArray(data) || !data.every(isNamedResource)) {
    throw new Error('Serwer zwrócił nieprawidłową listę ekranów.')
  }
  return data
}

export async function createDevice(token: string, name: string) {
  const response = await apiRequest(
    '/api/devices/create',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    },
    'Nie udało się dodać ekranu.',
  )
  const data: unknown = await response.json()
  if (!isNamedResource(data)) {
    throw new Error('Serwer zwrócił nieprawidłowe dane ekranu.')
  }
  return data
}

export async function listSchedule(token: string, signal: AbortSignal) {
  const response = await apiRequest(
    schedulePath,
    { headers: { Authorization: `Bearer ${token}` }, signal },
    'Nie udało się pobrać harmonogramu.',
  )
  const data: unknown = await response.json()
  if (!Array.isArray(data) || !data.every(isScheduleBlock)) {
    throw new Error('Serwer zwrócił nieprawidłowy harmonogram.')
  }
  return data
}

export async function saveScheduleBlock(
  token: string,
  draft: ScheduleBlockInput,
  original?: ScheduleBlock,
) {
  const response = await apiRequest(
    original
      ? `${schedulePath}/${encodeURIComponent(original.id)}`
      : schedulePath,
    {
      method: original ? 'PUT' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...draft, version: original?.version }),
    },
    'Nie udało się zapisać bloku emisji.',
  )
  const data: unknown = await response.json()
  if (!isScheduleBlock(data)) {
    throw new Error('Serwer zwrócił nieprawidłowy blok emisji.')
  }
  return data
}
