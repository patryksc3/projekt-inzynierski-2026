import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  FileImage,
  Film,
  LoaderCircle,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isUnauthorized } from '@/lib/api'
import {
  listMedia,
  mediaQueryKey,
  type LibrarySession,
  type LibraryMedia,
} from '@/lib/media-api'
import {
  formatPlaylistDuration,
  type PlaylistInput,
  type SavedPlaylist,
} from '@/lib/playlists-api'

interface DraftItem {
  key: string
  mediaItemId: string
  name: string
  duration: string
}

export function PlaylistEditor({
  playlist,
  session,
  pending,
  error,
  onSave,
  onCancel,
  onDirtyChange,
  onSessionExpired,
}: {
  playlist?: SavedPlaylist
  session: LibrarySession
  pending: boolean
  error?: string
  onSave: (input: PlaylistInput) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  onSessionExpired: () => void
}) {
  const [name, setName] = useState(playlist?.name ?? '')
  const [items, setItems] = useState<DraftItem[]>(() =>
    (playlist?.items ?? []).map((item) => ({
      key: item.id,
      mediaItemId: item.mediaItemId,
      name: item.originalName,
      duration: String(item.durationSeconds),
    })),
  )
  const [search, setSearch] = useState('')
  const [validationError, setValidationError] = useState('')
  const mediaQuery = useQuery({
    queryKey: mediaQueryKey(session.id),
    queryFn: async ({ signal }) => {
      try {
        return await listMedia(session.token, signal)
      } catch (error) {
        if (isUnauthorized(error)) onSessionExpired()
        throw error
      }
    },
    retry: false,
  })

  useEffect(() => {
    const original = playlist?.items ?? []
    onDirtyChange(
      name !== (playlist?.name ?? '') ||
        items.length !== original.length ||
        items.some(
          (item, index) =>
            item.mediaItemId !== original[index]?.mediaItemId ||
            item.duration !== String(original[index]?.durationSeconds),
        ),
    )
  }, [name, items, playlist, onDirtyChange])

  function addItem(media: LibraryMedia) {
    setItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        mediaItemId: media.id,
        name: media.name,
        duration: '10',
      },
    ])
    setValidationError('')
  }

  function moveItem(index: number, offset: number) {
    setItems((current) => {
      const next = [...current]
      const destination = index + offset
      if (destination < 0 || destination >= next.length) return current
      const moved = next[index]!
      next[index] = next[destination]!
      next[destination] = moved
      return next
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (!name.trim() || name.trim().length > 128) {
      setValidationError('Wpisz nazwę playlisty od 1 do 128 znaków.')
      return
    }
    if (
      items.some(
        (item) =>
          !Number.isInteger(Number(item.duration)) ||
          Number(item.duration) < 1 ||
          Number(item.duration) > 2147483647,
      )
    ) {
      setValidationError(
        'Czas każdego materiału musi być dodatnią, całkowitą liczbą sekund.',
      )
      return
    }
    setValidationError('')
    onSave({
      name: name.trim(),
      items: items.map((item) => ({
        mediaItemId: item.mediaItemId,
        durationSeconds: Number(item.duration),
      })),
    })
  }

  const visibleMedia = (mediaQuery.data ?? []).filter((item) =>
    item.name
      .toLocaleLowerCase('pl')
      .includes(search.trim().toLocaleLowerCase('pl')),
  )
  const duration = formatPlaylistDuration(
    items.map((item) => ({
      durationSeconds: Number.isFinite(Number(item.duration))
        ? Math.max(0, Math.floor(Number(item.duration)))
        : 0,
    })),
  )

  return (
    <form className="grid min-h-0 gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium">
        Nazwa playlisty
        <Input
          name="playlist-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Np. Powitanie na kampusie"
          maxLength={128}
          required
          disabled={pending}
        />
      </label>
      <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0" aria-labelledby="playlist-library-title">
          <h3
            id="playlist-library-title"
            className="mb-3 text-sm font-semibold"
          >
            Materiały z biblioteki
          </h3>
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Szukaj materiałów do playlisty"
              placeholder="Szukaj materiałów…"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {mediaQuery.isPending ? (
            <p
              role="status"
              className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
            >
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              {mediaQuery.isPaused
                ? 'Oczekiwanie na połączenie…'
                : 'Pobieranie materiałów…'}
            </p>
          ) : mediaQuery.isError ? (
            <div role="alert" className="grid gap-3 py-3 text-sm">
              <p className="text-destructive">{mediaQuery.error.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void mediaQuery.refetch()}
              >
                Ponów pobieranie materiałów
              </Button>
            </div>
          ) : visibleMedia.length === 0 ? (
            <p className="py-5 text-sm text-muted-foreground">
              {mediaQuery.data?.length
                ? 'Brak materiałów pasujących do wyszukiwania.'
                : 'Biblioteka jest pusta. Prześlij materiały w zakładce Biblioteka.'}
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {visibleMedia.map((media) => (
                <li
                  key={media.id}
                  className="flex min-w-0 items-center gap-2 p-3"
                >
                  {media.kind === 'video' ? (
                    <Film className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileImage className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm wrap-anywhere">{media.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {media.format} · {media.size}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Dodaj materiał ${media.name}`}
                    disabled={pending}
                    onClick={() => addItem(media)}
                  >
                    <Plus size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="min-w-0" aria-labelledby="playlist-order-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <h3 id="playlist-order-title" className="font-semibold">
              Kolejność emisji
            </h3>
            <span className="text-muted-foreground">
              Materiały {items.length} · {duration}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
              Dodaj zdjęcia lub filmy z biblioteki. Możesz też zapisać pustą
              playlistę i uzupełnić ją później.
            </p>
          ) : (
            <ol className="max-h-96 space-y-2 overflow-y-auto">
              {items.map((item, index) => (
                <li
                  key={item.key}
                  className="rounded-md border border-border p-3"
                >
                  <div className="mb-3 flex items-start gap-2">
                    <span className="pt-0.5 text-xs text-muted-foreground">
                      {index + 1}.
                    </span>
                    <p className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
                      {item.name}
                    </p>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Usuń pozycję ${index + 1} z playlisty`}
                      disabled={pending}
                      onClick={() =>
                        setItems((current) =>
                          current.filter((entry) => entry.key !== item.key),
                        )
                      }
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Czas emisji (sekundy)
                      <Input
                        className="h-8 w-28 text-foreground"
                        type="number"
                        min={1}
                        max={2147483647}
                        step={1}
                        required
                        value={item.duration}
                        aria-label={`Czas emisji pozycji ${index + 1} w sekundach`}
                        disabled={pending}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry) =>
                              entry.key === item.key
                                ? { ...entry, duration: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Przesuń pozycję ${index + 1} w górę`}
                        disabled={pending || index === 0}
                        onClick={() => moveItem(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Przesuń pozycję ${index + 1} w dół`}
                        disabled={pending || index === items.length - 1}
                        onClick={() => moveItem(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {(validationError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {validationError || error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          Anuluj
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && (
            <LoaderCircle className="size-4 motion-safe:animate-spin" />
          )}
          {pending ? 'Zapisywanie…' : 'Zapisz playlistę'}
        </Button>
      </div>
    </form>
  )
}
