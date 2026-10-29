import { queryOptions } from '@tanstack/react-query'
import type { ContentData } from '@/types/content'

// Lokalny endpoint demonstracyjny. Docelowy adapter API zastąpi tę funkcję.
export async function fetchContent(signal: AbortSignal): Promise<ContentData> {
  const response = await fetch(`${import.meta.env.BASE_URL}demo-content.json`, {
    signal,
    cache: 'no-cache',
  })

  if (!response.ok) throw new Error('Nie udało się pobrać danych.')

  const data: ContentData = await response.json()
  if (
    !Array.isArray(data?.media) ||
    !Array.isArray(data?.playlists) ||
    !Array.isArray(data?.schedule)
  ) {
    throw new Error('Otrzymane dane mają nieprawidłowy format.')
  }
  return data
}

export const contentQueryOptions = queryOptions({
  queryKey: ['content'],
  queryFn: ({ signal }) => fetchContent(signal),
  staleTime: 60_000,
  retry: 1,
})
