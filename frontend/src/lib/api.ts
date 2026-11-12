export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

export async function apiRequest(
  path: string,
  init: RequestInit,
  failure: string,
) {
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
    throw new ApiError(
      response.status,
      typeof body?.error === 'string' ? body.error : failure,
    )
  }

  return response
}
