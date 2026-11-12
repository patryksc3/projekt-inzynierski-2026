import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Clock3,
  FileImage,
  Film,
  Info,
  Monitor,
  Play,
} from 'lucide-react'
import { AppShell, type Page } from '@/components/app-shell'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { MediaArtwork } from '@/components/media-artwork'
import { Dashboard } from '@/features/dashboard'
import { Library } from '@/features/library'
import { contentQueryOptions } from '@/lib/content-query'
import { ContentLoading, ContentError } from '@/components/content-loading'
import type { MediaItem, Playlist } from '@/types/content'
import './App.css'

type Preview =
  | { type: 'media'; item: MediaItem }
  | { type: 'playlist'; item: Playlist }
  | { type: 'schedule' }
  | { type: 'about' }
  | null

function currentPage(): Page {
  return window.location.hash === '#library' ? 'library' : 'dashboard'
}

export default function App() {
  const [page, setPage] = useState<Page>(currentPage)
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<Preview>(null)
  const contentQuery = useQuery(contentQueryOptions)
  const { media = [], playlists = [], schedule = [] } = contentQuery.data ?? {}

  useEffect(() => {
    const onHashChange = () => setPage(currentPage())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.title = `${page === 'dashboard' ? 'Pulpit' : 'Biblioteka mediów'} — pixto`
  }, [page])

  const navigate = (next: Page) => {
    window.location.hash = next
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const openMedia = (item: MediaItem) => setPreview({ type: 'media', item })
  const openPlaylist = (item: Playlist) =>
    setPreview({ type: 'playlist', item })

  return (
    <AppShell
      page={page}
      navigate={navigate}
      onHelp={() => setPreview({ type: 'about' })}
      mediaCount={contentQuery.data?.media.length}
      isFetching={contentQuery.isFetching}
      onRefresh={() => void contentQuery.refetch()}
    >
      {contentQuery.isRefetchError && (
        <p className="refresh-error" role="alert">
          Nie udało się odświeżyć danych. Wyświetlamy ostatnią pobraną wersję.{' '}
          <button onClick={() => void contentQuery.refetch()}>
            Ponów próbę
          </button>
        </p>
      )}
      {contentQuery.isPending ? (
        <ContentLoading page={page} paused={contentQuery.isPaused} />
      ) : !contentQuery.data ? (
        <ContentError onRetry={() => void contentQuery.refetch()} />
      ) : page === 'dashboard' ? (
        <Dashboard
          content={contentQuery.data}
          onLibrary={() => navigate('library')}
          onMedia={openMedia}
          onPlaylist={openPlaylist}
          onSchedule={() => setPreview({ type: 'schedule' })}
        />
      ) : (
        <Library
          media={media}
          search={search}
          onSearch={setSearch}
          onMedia={openMedia}
        />
      )}
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent className="preview-dialog sm:max-w-155">
          {preview?.type === 'media' && (
            <>
              <DialogHeader>
                <DialogTitle>{preview.item.name}</DialogTitle>
                <DialogDescription>
                  Podgląd przykładowego materiału w bibliotece.
                </DialogDescription>
              </DialogHeader>
              <MediaArtwork
                kind={preview.item.artwork}
                className="dialog-artwork"
              />
              <div className="media-metadata">
                <div>
                  <span>Typ pliku</span>
                  <strong>
                    {preview.item.kind === 'video' ? 'Film' : 'Zdjęcie'} ·{' '}
                    {preview.item.format}
                  </strong>
                </div>
                <div>
                  <span>Rozmiar</span>
                  <strong>{preview.item.size}</strong>
                </div>
                <div>
                  <span>Czas emisji</span>
                  <strong>{preview.item.duration}</strong>
                </div>
                <div>
                  <span>Dodano</span>
                  <strong>{preview.item.addedAt}</strong>
                </div>
              </div>
              <p className="dialog-note">
                <Info size={15} />
                Grafika demonstracyjna. Podgląd i odtwarzanie plików dodamy po
                podłączeniu API.
              </p>
            </>
          )}
          {preview?.type === 'playlist' && (
            <>
              <DialogHeader>
                <Badge variant="secondary" className="w-fit mb-2">
                  Podgląd playlisty
                </Badge>
                <DialogTitle>{preview.item.name}</DialogTitle>
                <DialogDescription>
                  {preview.item.description}
                </DialogDescription>
              </DialogHeader>
              <div className="playlist-summary">
                <span>
                  <Film size={15} />
                  {preview.item.mediaIds.length} materiały
                </span>
                <span>
                  <Clock3 size={15} />
                  {preview.item.duration}
                </span>
                <span>
                  <Monitor size={15} />
                  Ekran demonstracyjny
                </span>
              </div>
              <ol className="playlist-detail-list">
                {preview.item.mediaIds.map((id, index) => {
                  const item = media.find((m) => m.id === id)!
                  return (
                    <li key={id}>
                      <span className="list-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <button
                        onClick={() => openMedia(item)}
                        className="playlist-detail-button"
                      >
                        <MediaArtwork kind={item.artwork} />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.kind === 'video' ? (
                              <Film size={12} />
                            ) : (
                              <FileImage size={12} />
                            )}
                            {item.format} · {item.size}
                          </small>
                        </span>
                        <span className="detail-duration">{item.duration}</span>
                        <Play size={15} />
                      </button>
                    </li>
                  )
                })}
              </ol>
              <p className="dialog-note">
                <Info size={15} />
                Kolejność i czasy emisji są przykładowe. Edytor playlist
                powstanie w kolejnym etapie.
              </p>
            </>
          )}
          {preview?.type === 'schedule' && (
            <>
              <DialogHeader>
                <DialogTitle>Plan dnia</DialogTitle>
                <DialogDescription>
                  Czwartek, 29 października 2026 · harmonogram demonstracyjny
                </DialogDescription>
              </DialogHeader>
              <div className="schedule-detail">
                {schedule.map((slot) => (
                  <button
                    key={slot.time}
                    onClick={() =>
                      openPlaylist(
                        playlists.find((p) => p.id === slot.playlistId)!,
                      )
                    }
                  >
                    <CalendarDays size={20} />
                    <span>
                      <strong>
                        {slot.time} – {slot.end}
                      </strong>
                      <span>{slot.label}</span>
                      <small>
                        {playlists.find((p) => p.id === slot.playlistId)?.name}
                      </small>
                    </span>
                    <Play size={16} />
                  </button>
                ))}
              </div>
              <p className="dialog-note">
                <Info size={15} />
                Plan prezentuje docelowy sposób emisji. Zapisywanie
                harmonogramów dodamy po integracji z backendem.
              </p>
            </>
          )}
          {preview?.type === 'about' && (
            <>
              <DialogHeader>
                <DialogTitle>Mały komputer. Wielki przekaz.</DialogTitle>
                <DialogDescription>
                  pixto · robocza nazwa projektu inżynierskiego
                </DialogDescription>
              </DialogHeader>
              <p className="about-copy">
                System zdalnego zarządzania i wyświetlania treści
                multimedialnych oparty na Raspberry Pi. Powstaje z myślą o
                szkołach, uczelniach, firmach i ich ekranach informacyjnych.
              </p>
              <div className="about-stage">
                <Badge variant="secondary">Etap 01</Badge>
                <strong>Fundament i projekt interfejsu</strong>
                <p>
                  Pulpit, biblioteka, podgląd materiałów, playlist i planu dnia.
                  Dane są demonstracyjne, a czas na pulpicie jest stały.
                </p>
              </div>
              <p className="dialog-note">
                <Info size={15} />
                Panel nie jest jeszcze połączony z serwerem ani urządzeniem
                Raspberry Pi.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
