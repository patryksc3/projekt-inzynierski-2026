import { request } from '@/lib/api'

export interface Device {
  id: string
  name: string
}

export interface DevicePairing {
  code: string
  expiresAt: number
}

const devicesPath = '/api/devices'

export const devicesQueryKey = (sessionId?: number) =>
  ['devices', sessionId] as const

function toDevice(data: unknown): Device {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('id' in data) ||
    typeof data.id !== 'string' ||
    !data.id ||
    !('name' in data) ||
    typeof data.name !== 'string'
  ) {
    throw new Error('Serwer zwrócił nieprawidłowe dane urządzenia.')
  }
  return { id: data.id, name: data.name }
}

export async function listDevices(token: string, signal: AbortSignal) {
  const response = await request(
    `${devicesPath}/get-all-devices`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
    'Nie udało się pobrać listy urządzeń.',
  )
  const items: unknown = await response.json()
  if (!Array.isArray(items)) {
    throw new Error('Serwer zwrócił nieprawidłową listę urządzeń.')
  }
  return items.map(toDevice)
}

export async function createDevice(token: string, name: string) {
  const response = await request(
    `${devicesPath}/create`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    },
    'Nie udało się dodać urządzenia.',
  )
  return toDevice(await response.json())
}

export async function generatePairCode(
  token: string,
  deviceId: string,
): Promise<DevicePairing> {
  const requestedAt = Date.now()
  const response = await request(
    `${devicesPath}/get-pair-code`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deviceId }),
    },
    'Nie udało się wygenerować kodu parowania.',
  )
  const data: unknown = await response.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    !('pairCode' in data) ||
    typeof data.pairCode !== 'string' ||
    !data.pairCode ||
    !('expiresInMinutes' in data) ||
    typeof data.expiresInMinutes !== 'number' ||
    !Number.isInteger(data.expiresInMinutes) ||
    data.expiresInMinutes < 1
  ) {
    throw new Error('Serwer zwrócił nieprawidłowy kod parowania.')
  }
  return {
    code: data.pairCode,
    expiresAt: requestedAt + Math.min(data.expiresInMinutes, 24 * 60) * 60_000,
  }
}
