import { ArrowDownWideNarrow, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MediaCard } from '@/components/media-card'
import type { MediaItem } from '@/types/content'

export function Library({
  media,
  search,
  onSearch,
  onMedia,
}: {
  media: MediaItem[]
  search: string
  onSearch: (value: string) => void
  onMedia: (item: MediaItem) => void
}) {
  const [filter, setFilter] = useState('all')
  const [ascending, setAscending] = useState(false)
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
        <span className="library-demo-label">{media.length} materiałów</span>
      </section>
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
                  <MediaCard key={item.id} item={item} onSelect={onMedia} />
                ))}
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
    </>
  )
}
