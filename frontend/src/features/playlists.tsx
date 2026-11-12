import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ListVideo, Pencil, Plus, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isUnauthorized } from '@/lib/api'
import type { LibraryMedia, LibrarySession } from '@/lib/media-api'
import {
  playlistLimits,
  playlistQueryKey,
  savePlaylist,
  type PlaylistItemInput,
  type SavedPlaylist,
} from '@/lib/playlists-api'

const defaultDuration = 10
const minutesAndSeconds = new Intl.NumberFormat('pl', {
  minimumIntegerDigits: 2,
})

function totalDuration(playlist: SavedPlaylist) {
  const seconds = playlist.items.reduce(
    (total, item) => total + item.durationSeconds,
    0,
  )
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${minutesAndSeconds.format(seconds % 60)} s`
}

export function Playlists({
  playlists,
  media,
  mediaError,
  session,
  onLibrary,
  onRetryMedia,
  onSessionExpired,
}: {
  playlists: SavedPlaylist[]
  media?: LibraryMedia[]
  mediaError?: string
  session: LibrarySession
  onLibrary: () => void
  onRetryMedia: () => void
  onSessionExpired: () => void
}) {
  const [editor, setEditor] = useState<'new' | SavedPlaylist | null>(null)
  const [notice, setNotice] = useState('')
  const canEdit = Boolean(media?.length)

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Playlisty</h1>
          <p>Ułóż kolejność materiałów i ustaw czas emisji.</p>
        </div>
        <Button disabled={!canEdit} onClick={() => setEditor('new')}>
          <Plus size={17} />
          Nowa playlista
        </Button>
      </section>
      <p
        className={notice ? 'mb-4 text-sm text-muted-foreground' : 'sr-only'}
        role="status"
      >
        {notice}
      </p>
      {!media &&
        (mediaError ? (
          <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4">
            <p role="alert" className="text-sm">
              {mediaError}
            </p>
            <Button variant="outline" onClick={onRetryMedia}>
              Ponów pobieranie
            </Button>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground" role="status">
            Wczytywanie materiałów…
          </p>
        ))}
      {media?.length === 0 && (
        <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm">
            Dodaj materiał do biblioteki, aby utworzyć playlistę.
          </p>
          <Button variant="outline" onClick={onLibrary}>
            Otwórz bibliotekę
          </Button>
        </div>
      )}
      {playlists.length === 0 ? (
        <div className="surface grid justify-items-center gap-3 px-4 py-12 text-center">
          <ListVideo size={24} className="text-muted-foreground" />
          <h2 className="font-semibold">Brak playlist</h2>
        </div>
      ) : (
        <ul className="surface divide-y divide-border">
          {playlists.map((playlist) => (
            <li
              key={playlist.id}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              <span className="hidden rounded-md bg-muted p-2.5 text-muted-foreground sm:block">
                <ListVideo size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold wrap-break-word">
                  {playlist.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pozycje: {playlist.items.length} · {totalDuration(playlist)}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!canEdit}
                aria-label={`Edytuj playlistę ${playlist.name}`}
                onClick={() => setEditor(playlist)}
              >
                <Pencil size={15} />
                Edytuj
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editor && media && (
        <PlaylistEditor
          original={editor === 'new' ? undefined : editor}
          media={media}
          session={session}
          onClose={() => setEditor(null)}
          onSaved={(playlist) => {
            setNotice(`Zapisano playlistę „${playlist.name}”.`)
            setEditor(null)
          }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </>
  )
}

interface DraftItem {
  key: number
  mediaId: string
  duration: string
}

function PlaylistEditor({
  original,
  media,
  session,
  onClose,
  onSaved,
  onSessionExpired,
}: {
  original?: SavedPlaylist
  media: LibraryMedia[]
  session: LibrarySession
  onClose: () => void
  onSaved: (playlist: SavedPlaylist) => void
  onSessionExpired: () => void
}) {
  const [name, setName] = useState(original?.name ?? '')
  const [items, setItems] = useState<DraftItem[]>(
    () =>
      original?.items.map((item, key) => ({
        key,
        mediaId: item.mediaId,
        duration: String(item.durationSeconds),
      })) ?? [],
  )
  const [selected, setSelected] = useState('')
  const nextKey = useRef(items.length)
  const queryClient = useQueryClient()
  const queryKey = playlistQueryKey(session.id)
  const catalog = new Map(media.map((item) => [item.id, item]))
  const save = useMutation({
    mutationFn: (draft: { name: string; items: PlaylistItemInput[] }) =>
      savePlaylist(session.token, draft, original),
    gcTime: 0,
    onError: (error) => {
      if (isUnauthorized(error)) onSessionExpired()
    },
    onSuccess: async (playlist) => {
      await queryClient.cancelQueries({ queryKey, exact: true })
      queryClient.setQueryData<SavedPlaylist[]>(
        queryKey,
        (previous) =>
          previous &&
          [
            ...previous.filter((item) => item.id !== playlist.id),
            playlist,
          ].sort((a, b) => a.name.localeCompare(b.name, 'pl')),
      )
      void queryClient.invalidateQueries({ queryKey, exact: true })
    },
  })

  const pending = save.isPending
  const complete =
    items.length > 0 &&
    items.every((item) => {
      const duration = Number(item.duration)
      return (
        catalog.has(item.mediaId) &&
        Number.isInteger(duration) &&
        duration >= 1 &&
        duration <= playlistLimits.duration
      )
    })

  function addItem() {
    if (!catalog.has(selected) || items.length >= playlistLimits.items) return
    const item = {
      key: nextKey.current++,
      mediaId: selected,
      duration: String(defaultDuration),
    }
    setItems((current) => [...current, item])
  }

  function moveItem(index: number, step: -1 | 1) {
    setItems((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(index + step, 0, item)
      return next
    })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !complete || !name.trim()) return
    save.mutate(
      {
        name: name.trim(),
        items: items.map((item) => ({
          mediaId: item.mediaId,
          durationSeconds: Number(item.duration),
        })),
      },
      { onSuccess: onSaved },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {original ? 'Edytuj playlistę' : 'Nowa playlista'}
          </DialogTitle>
          <DialogDescription>
            Materiały są emitowane w kolejności od góry.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid min-w-0 gap-4">
          <label className="grid gap-2 text-sm">
            Nazwa playlisty
            <Input
              value={name}
              maxLength={playlistLimits.name}
              required
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid min-w-0 gap-2 text-sm">
              Materiał z biblioteki
              <select
                className="h-9 w-full min-w-0 truncate rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                value={selected}
                disabled={pending}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Wybierz materiał…</option>
                {media.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={
                pending ||
                !catalog.has(selected) ||
                items.length >= playlistLimits.items
              }
              onClick={addItem}
            >
              <Plus size={16} /> Dodaj do playlisty
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Dodaj co najmniej jeden materiał.
            </p>
          ) : (
            <ol className="divide-y divide-border rounded-md border border-border">
              {items.map((item, index) => (
                <li
                  key={item.key}
                  className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-center"
                >
                  <p className="min-w-0 text-sm wrap-break-word">
                    <span className="mr-2 text-muted-foreground">
                      {index + 1}.
                    </span>
                    {catalog.get(item.mediaId)?.name ?? 'Materiał niedostępny'}
                  </p>
                  <label className="grid w-24 gap-1 text-xs text-muted-foreground">
                    Czas (s)
                    <Input
                      type="number"
                      min={1}
                      max={playlistLimits.duration}
                      step={1}
                      required
                      aria-label={`Czas emisji pozycji ${index + 1} w sekundach`}
                      value={item.duration}
                      disabled={pending}
                      onChange={(event) => {
                        const duration = event.target.value
                        setItems((current) =>
                          current.map((row) =>
                            row.key === item.key ? { ...row, duration } : row,
                          ),
                        )
                      }}
                    />
                  </label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending || index === 0}
                      aria-label={`Przesuń pozycję ${index + 1} w górę`}
                      onClick={() => moveItem(index, -1)}
                    >
                      <ArrowUp size={16} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending || index === items.length - 1}
                      aria-label={`Przesuń pozycję ${index + 1} w dół`}
                      onClick={() => moveItem(index, 1)}
                    >
                      <ArrowDown size={16} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={`Usuń pozycję ${index + 1}`}
                      onClick={() =>
                        setItems((current) =>
                          current.filter((row) => row.key !== item.key),
                        )
                      }
                    >
                      <X size={16} />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              disabled={pending || !complete || !name.trim()}
            >
              {pending ? 'Zapisywanie…' : 'Zapisz playlistę'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
