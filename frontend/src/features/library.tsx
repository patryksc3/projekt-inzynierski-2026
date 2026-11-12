import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownWideNarrow,
  FileImage,
  Film,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MediaCard } from '@/components/media-card'
import {
  deleteMedia,
  isUnauthorized,
  mediaAccept,
  mediaQueryKey,
  uploadMedia,
  type LibraryMedia,
  type LibrarySession,
} from '@/lib/media-api'

type LibraryDialog =
  | { type: 'upload' }
  | { type: 'preview'; item: LibraryMedia }
  | { type: 'delete'; item: LibraryMedia }

function MediaDetails({ item }: { item: LibraryMedia }) {
  return (
    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground">Typ pliku</dt>
        <dd>
          {item.kind === 'video' ? 'Film' : 'Zdjęcie'} · {item.format}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Rozmiar</dt>
        <dd>{item.size}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Dodano</dt>
        <dd>{item.addedAt}</dd>
      </div>
    </dl>
  )
}

export function Library({
  media,
  session,
  search,
  onSearch,
  onSessionExpired,
}: {
  media: LibraryMedia[]
  session: LibrarySession
  search: string
  onSearch: (value: string) => void
  onSessionExpired: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = mediaQueryKey(session.id)
  const [filter, setFilter] = useState('all')
  const [ascending, setAscending] = useState(false)
  const [dialog, setDialog] = useState<LibraryDialog | null>(null)
  const [notice, setNotice] = useState('')

  async function updateMedia(
    update: (items: LibraryMedia[]) => LibraryMedia[],
  ) {
    await queryClient.cancelQueries({ queryKey, exact: true })
    queryClient.setQueryData<LibraryMedia[]>(
      queryKey,
      (items) => items && update(items),
    )
    void queryClient.invalidateQueries({ queryKey, exact: true })
  }

  function handleMutationError(error: Error) {
    if (isUnauthorized(error)) onSessionExpired()
  }

  const upload = useMutation({
    mutationFn: (file: File) => uploadMedia(session.token, file),
    gcTime: 0,
    onError: handleMutationError,
    onSuccess: async (item) => {
      await updateMedia((items) => [
        item,
        ...items.filter((media) => media.id !== item.id),
      ])
      onSearch('')
      setFilter('all')
      setAscending(false)
      setDialog(null)
      setNotice(`Dodano plik „${item.name}”.`)
    },
  })
  const remove = useMutation({
    mutationFn: (item: LibraryMedia) => deleteMedia(session.token, item.id),
    onError: handleMutationError,
    onSuccess: async (_, item) => {
      await updateMedia((items) =>
        items.filter((media) => media.id !== item.id),
      )
      setDialog(null)
      setNotice(`Usunięto plik „${item.name}”.`)
    },
  })
  const busy = upload.isPending || remove.isPending

  function openDialog(next: LibraryDialog) {
    upload.reset()
    remove.reset()
    setNotice('')
    setDialog(next)
  }

  function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const file = new FormData(event.currentTarget).get('file')
    if (file instanceof File) upload.mutate(file)
  }

  function closeDialog() {
    if (busy) return
    setDialog(null)
    upload.reset()
    remove.reset()
  }

  const imageCount = media.filter((item) => item.kind === 'image').length
  const videoCount = media.filter((item) => item.kind === 'video').length
  const filtered = media.filter(
    (item) =>
      (filter === 'all' || item.kind === filter) &&
      item.name
        .toLocaleLowerCase('pl')
        .includes(search.trim().toLocaleLowerCase('pl')),
  )
  const visible = ascending
    ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    : filtered
  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Biblioteka mediów</h1>
          <p>Zdjęcia i filmy przeznaczone do emisji.</p>
        </div>
        <Button onClick={() => openDialog({ type: 'upload' })}>
          <Upload size={17} />
          Dodaj materiał
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
      <section
        className="surface library-section"
        aria-label="Materiały multimedialne"
      >
        <Tabs value={filter} onValueChange={setFilter}>
          <div className="library-toolbar">
            <TabsList>
              <TabsTrigger value="all">
                Wszystkie <span>{media.length}</span>
              </TabsTrigger>
              <TabsTrigger value="image">
                Zdjęcia <span>{imageCount}</span>
              </TabsTrigger>
              <TabsTrigger value="video">
                Filmy <span>{videoCount}</span>
              </TabsTrigger>
            </TabsList>
            <div className="library-controls">
              <div className="search-input">
                <Search size={16} />
                <Input
                  id="media-search"
                  aria-label="Szukaj materiałów"
                  placeholder="Szukaj materiałów..."
                  value={search}
                  onChange={(event) => onSearch(event.target.value)}
                />
                {search && (
                  <button
                    aria-label="Wyczyść wyszukiwanie"
                    onClick={() => onSearch('')}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label={
                  ascending ? 'Sortuj od najnowszych' : 'Sortuj alfabetycznie'
                }
                aria-pressed={ascending}
                onClick={() => setAscending((value) => !value)}
              >
                <ArrowDownWideNarrow size={17} />
              </Button>
            </div>
          </div>
          <TabsContent value={filter}>
            <p className="results-label" aria-live="polite">
              {visible.length} z {media.length} materiałów{' '}
              <span className="results-divider" />{' '}
              {ascending ? 'Alfabetycznie' : 'Ostatnio dodane'}
            </p>
            {visible.length > 0 ? (
              <div className="media-grid library-grid">
                {visible.map((item) => (
                  <div
                    key={item.id}
                    className="flex min-w-0 items-center border-b border-white/5 pr-3 last:border-b-0"
                  >
                    <MediaCard
                      item={item}
                      onSelect={(item) => openDialog({ type: 'preview', item })}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Usuń plik ${item.name}`}
                      onClick={() => openDialog({ type: 'delete', item })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : media.length === 0 ? (
              <div className="empty-state">
                <FileImage size={32} />
                <h2>Biblioteka jest pusta</h2>
                <p>Dodaj pierwsze zdjęcie lub film.</p>
              </div>
            ) : (
              <div className="empty-state">
                <Search size={32} />
                <h2>Nie znaleźliśmy takich materiałów</h2>
                <p>Spróbuj innej nazwy lub zmień wybrany typ pliku.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    onSearch('')
                    setFilter('all')
                  }}
                >
                  Wyczyść filtry
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent
          showCloseButton={!busy}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          {dialog?.type === 'upload' && (
            <>
              <DialogHeader>
                <DialogTitle>Dodaj materiał</DialogTitle>
                <DialogDescription>
                  Wybierz zdjęcie lub film do przesłania.
                </DialogDescription>
              </DialogHeader>
              <form className="grid gap-4" onSubmit={handleUpload}>
                <label className="grid gap-2 text-sm">
                  Plik
                  <Input
                    type="file"
                    name="file"
                    accept={mediaAccept}
                    required
                    disabled={busy}
                  />
                </label>
                {upload.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {upload.error.message}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeDialog}
                    disabled={busy}
                  >
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Przesyłanie…' : 'Prześlij plik'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
          {dialog?.type === 'preview' && (
            <>
              <DialogHeader>
                <DialogTitle className="wrap-anywhere">
                  {dialog.item.name}
                </DialogTitle>
                <DialogDescription>Szczegóły materiału</DialogDescription>
              </DialogHeader>
              <div
                className="grid min-h-24 place-items-center rounded-md bg-secondary text-muted-foreground"
                aria-hidden="true"
              >
                {dialog.item.kind === 'video' ? (
                  <Film size={32} />
                ) : (
                  <FileImage size={32} />
                )}
              </div>
              <MediaDetails item={dialog.item} />
            </>
          )}
          {dialog?.type === 'delete' && (
            <>
              <DialogHeader>
                <DialogTitle>Usunąć materiał?</DialogTitle>
                <DialogDescription className="wrap-anywhere">
                  Plik „{dialog.item.name}” zostanie usunięty z biblioteki.
                </DialogDescription>
              </DialogHeader>
              {remove.error && (
                <p role="alert" className="text-sm text-destructive">
                  {remove.error.message}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={busy}>
                  Anuluj
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => remove.mutate(dialog.item)}
                >
                  {busy ? 'Usuwanie…' : 'Usuń plik'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
