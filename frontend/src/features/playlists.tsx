import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock3,
  ListVideo,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlaylistEditor } from '@/features/playlist-editor'
import { ApiError, isUnauthorized } from '@/lib/api'
import type { LibrarySession } from '@/lib/media-api'
import {
  deletePlaylist,
  formatPlaylistDuration,
  getPlaylist,
  playlistsQueryKey,
  savePlaylist,
  type PlaylistInput,
  type SavedPlaylist,
} from '@/lib/playlists-api'

type PlaylistDialog =
  { type: 'create' } | { type: 'edit' | 'delete'; playlist: SavedPlaylist }

export function Playlists({
  playlists,
  session,
  onSessionExpired,
}: {
  playlists: SavedPlaylist[]
  session: LibrarySession
  onSessionExpired: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = playlistsQueryKey(session.id)
  const [dialog, setDialog] = useState<PlaylistDialog | null>(null)
  const [dirty, setDirty] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const editId = dialog?.type === 'edit' ? dialog.playlist.id : undefined
  const detail = useQuery({
    queryKey: [...queryKey, editId],
    queryFn: async ({ signal }) => {
      if (!editId) throw new Error('Wybierz playlistę do edycji.')
      try {
        return await getPlaylist(session.token, editId, signal)
      } catch (error) {
        if (isUnauthorized(error)) onSessionExpired()
        throw error
      }
    },
    enabled: !!editId,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  async function updateCache(
    update: (items: SavedPlaylist[]) => SavedPlaylist[],
  ) {
    await queryClient.cancelQueries({ queryKey, exact: true })
    queryClient.setQueryData<SavedPlaylist[]>(
      queryKey,
      (items) => items && update(items),
    )
    void queryClient.invalidateQueries({ queryKey })
  }

  function handleError(error: Error) {
    if (isUnauthorized(error)) onSessionExpired()
    if (error instanceof ApiError && error.status === 404) {
      void queryClient.invalidateQueries({ queryKey, exact: true })
    }
  }

  const save = useMutation({
    mutationFn: ({ input, id }: { input: PlaylistInput; id?: string }) =>
      savePlaylist(session.token, input, id),
    onError: handleError,
    onSuccess: async (playlist) => {
      await updateCache((items) =>
        [...items.filter((item) => item.id !== playlist.id), playlist].sort(
          (a, b) => a.name.localeCompare(b.name, 'pl'),
        ),
      )
      setDialog(null)
      setDirty(false)
      setNotice(`Zapisano playlistę „${playlist.name}”.`)
    },
  })
  const remove = useMutation({
    mutationFn: (playlist: SavedPlaylist) =>
      deletePlaylist(session.token, playlist.id),
    onError: handleError,
    onSuccess: async (_, playlist) => {
      await updateCache((items) =>
        items.filter((item) => item.id !== playlist.id),
      )
      setDialog(null)
      setNotice(`Usunięto playlistę „${playlist.name}”.`)
    },
  })
  const busy = save.isPending || remove.isPending

  function openDialog(next: PlaylistDialog, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    save.reset()
    remove.reset()
    setDirty(false)
    setNotice('')
    setDialog(next)
  }

  function closeDialog() {
    if (busy) return
    if (dirty) {
      setDiscardOpen(true)
      return
    }
    setDialog(null)
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Playlisty</h1>
          <p>Wybierz materiały, ustaw ich kolejność i czas emisji.</p>
        </div>
        <Button
          onClick={(event) =>
            openDialog({ type: 'create' }, event.currentTarget)
          }
        >
          <Plus size={17} />
          Nowa playlista
        </Button>
      </section>
      {notice && (
        <p
          role="status"
          className="mb-3 text-sm text-muted-foreground wrap-anywhere"
        >
          {notice}
        </p>
      )}
      <section className="surface" aria-label="Lista playlist">
        {playlists.length === 0 ? (
          <div className="empty-state">
            <ListVideo aria-hidden="true" />
            <h2>Brak playlist</h2>
            <p>Utwórz pierwszą playlistę z materiałów w bibliotece.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {playlists.map((playlist) => (
              <li
                key={playlist.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <ListVideo size={19} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium wrap-anywhere">
                      {playlist.name}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Materiały {playlist.items.length}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} />
                        {formatPlaylistDuration(playlist.items)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Edytuj playlistę ${playlist.name}`}
                    onClick={(event) =>
                      openDialog(
                        { type: 'edit', playlist },
                        event.currentTarget,
                      )
                    }
                  >
                    <Pencil size={15} />
                    Edytuj
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Usuń playlistę ${playlist.name}`}
                    onClick={(event) =>
                      openDialog(
                        { type: 'delete', playlist },
                        event.currentTarget,
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent
          className={
            dialog?.type === 'delete'
              ? undefined
              : 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl'
          }
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === 'delete'
                ? 'Usunąć playlistę?'
                : dialog?.type === 'edit'
                  ? 'Edytuj playlistę'
                  : 'Nowa playlista'}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === 'delete'
                ? `Playlista „${dialog.playlist.name}” zostanie usunięta. Materiały pozostaną w bibliotece.`
                : 'Ułóż materiały w kolejności odtwarzania i podaj czas emisji każdego z nich.'}
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === 'delete' ? (
            <>
              {remove.error && (
                <p role="alert" className="text-sm text-destructive">
                  {remove.error.message}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={closeDialog}>
                  Anuluj
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => remove.mutate(dialog.playlist)}
                >
                  {busy ? 'Usuwanie…' : 'Usuń playlistę'}
                </Button>
              </DialogFooter>
            </>
          ) : dialog?.type === 'edit' && detail.isPending ? (
            <p
              role="status"
              className="flex items-center gap-2 py-5 text-sm text-muted-foreground"
            >
              <LoaderCircle className="size-4 motion-safe:animate-spin" />
              {detail.isPaused
                ? 'Oczekiwanie na połączenie…'
                : 'Pobieranie playlisty…'}
            </p>
          ) : dialog?.type === 'edit' && detail.isError ? (
            <div role="alert" className="grid gap-3">
              <p className="text-sm text-destructive">{detail.error.message}</p>
              <Button variant="outline" onClick={() => void detail.refetch()}>
                Ponów pobieranie playlisty
              </Button>
            </div>
          ) : (
            dialog && (
              <PlaylistEditor
                key={editId ?? 'new'}
                playlist={editId ? detail.data : undefined}
                session={session}
                pending={busy}
                error={save.error?.message}
                onSave={(input) => save.mutate({ input, id: editId })}
                onCancel={closeDialog}
                onDirtyChange={setDirty}
                onSessionExpired={onSessionExpired}
              />
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odrzucić zmiany?</DialogTitle>
            <DialogDescription>
              Zmiany w edytowanej playliście nie zostały zapisane.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              Wróć do edycji
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false)
                setDirty(false)
                setDialog(null)
              }}
            >
              Odrzuć zmiany
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
