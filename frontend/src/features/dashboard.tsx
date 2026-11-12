import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Files,
  FolderOpen,
  ListVideo,
  Play,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MediaCard } from '@/components/media-card'
import type { ContentData, MediaItem, Playlist } from '@/types/content'

interface DashboardProps {
  content: ContentData
  onLibrary: () => void
  onMedia: (item: MediaItem) => void
  onPlaylist: (playlist: Playlist) => void
  onSchedule: () => void
}

export function Dashboard({
  content: { media, playlists, schedule },
  onLibrary,
  onMedia,
  onPlaylist,
  onSchedule,
}: DashboardProps) {
  const photos = media.filter((item) => item.kind === 'image').length
  const videos = media.filter((item) => item.kind === 'video').length
  return (
    <div className="dashboard">
      <section className="page-heading">
        <div>
          <h1>Przegląd</h1>
          <p>Materiały, playlisty i harmonogram w jednym miejscu.</p>
        </div>
        <Button onClick={onLibrary}>
          <FolderOpen size={17} />
          Biblioteka mediów
          <ArrowRight size={16} />
        </Button>
      </section>

      <section
        className="summary-grid"
        aria-label="Podsumowanie danych demonstracyjnych"
      >
        {[
          {
            label: 'Materiały w bibliotece',
            value: media.length,
            detail: `Zdjęcia: ${photos} · Filmy: ${videos}`,
            Icon: Files,
          },
          {
            label: 'Playlisty',
            value: playlists.length,
            detail: `Aktywne w demo: ${playlists.filter((p) => p.status === 'active').length}`,
            Icon: ListVideo,
          },
          {
            label: 'Zaplanowane bloki',
            value: schedule.length,
            detail: 'Plan na 29 października',
            Icon: CalendarDays,
          },
        ].map(({ label, value, detail, Icon }) => (
          <div className="summary-card" key={label}>
            <div className="summary-label">
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <div className="summary-value">
              {value}
              <span>{detail}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="surface playlist-section">
        <div className="surface-heading">
          <div>
            <h2>
              Playlisty{' '}
              <span className="heading-count">{playlists.length}</span>
            </h2>
            <p>Przygotowane zestawy materiałów.</p>
          </div>
          <span className="section-caption">Podgląd demo</span>
        </div>
        <div className="table-scroll">
          <table className="playlist-table">
            <thead>
              <tr>
                <th scope="col">Playlista</th>
                <th scope="col">Materiały</th>
                <th scope="col">Czas trwania</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Podgląd</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {playlists.map((playlist) => (
                <tr key={playlist.id}>
                  <td>
                    <button
                      className="playlist-name"
                      onClick={() => onPlaylist(playlist)}
                    >
                      <span className="playlist-icon">
                        <ListVideo size={19} />
                      </span>
                      <span>
                        <strong>{playlist.name}</strong>
                        <small>{playlist.updatedAt}</small>
                      </span>
                    </button>
                  </td>
                  <td className="table-count">{playlist.mediaIds.length}</td>
                  <td>
                    <span className="table-duration">
                      <Clock3 size={13} />
                      {playlist.duration}
                    </span>
                  </td>
                  <td>
                    <Badge
                      variant="secondary"
                      className={`playlist-status status-${playlist.status}`}
                    >
                      <span />
                      {playlist.status === 'active'
                        ? 'Aktywna'
                        : playlist.status === 'ready'
                          ? 'Gotowa'
                          : 'Szkic'}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Podgląd playlisty ${playlist.name}`}
                      onClick={() => onPlaylist(playlist)}
                    >
                      <Play size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="dashboard-bottom">
        <section className="surface recent-section">
          <div className="surface-heading">
            <div>
              <h2>Ostatnie materiały</h2>
              <p>Najnowsze pliki w bibliotece.</p>
            </div>
            <Button variant="ghost" onClick={onLibrary}>
              Wszystkie
              <ArrowRight size={15} />
            </Button>
          </div>
          <div className="media-grid recent-grid">
            {media.slice(0, 3).map((item) => (
              <MediaCard item={item} key={item.id} onSelect={onMedia} />
            ))}
          </div>
        </section>
        <section className="surface schedule-section">
          <div className="surface-heading">
            <div>
              <h2>Plan dnia</h2>
              <p>Czwartek, 29 października</p>
            </div>
            <CalendarDays size={18} className="muted-icon" />
          </div>
          <div className="schedule-list">
            {schedule.map((slot) => {
              const playlist = playlists.find((p) => p.id === slot.playlistId)
              return (
                <button
                  className="schedule-entry"
                  key={slot.time}
                  onClick={() => playlist && onPlaylist(playlist)}
                  disabled={!playlist}
                >
                  <span className="schedule-time">
                    {slot.time}
                    <small>{slot.end}</small>
                  </span>
                  <span className="schedule-description">
                    <strong>{slot.label}</strong>
                    <small>{playlist?.name ?? 'Brak playlisty'}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              )
            })}
          </div>
          <Button
            variant="ghost"
            className="schedule-link"
            onClick={onSchedule}
          >
            Zobacz harmonogram
            <ArrowRight size={15} />
          </Button>
        </section>
      </div>
    </div>
  )
}
