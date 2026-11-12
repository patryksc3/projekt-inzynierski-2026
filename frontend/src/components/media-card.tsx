import { ArrowUpRight } from 'lucide-react'
import { MediaArtwork } from '@/components/media-artwork'
import type { MediaItem } from '@/types/content'

export function MediaCard({
  item,
  onSelect,
}: {
  item: MediaItem
  onSelect: (item: MediaItem) => void
}) {
  return (
    <button
      className="media-card"
      onClick={() => onSelect(item)}
      aria-label={`Podgląd: ${item.name}`}
    >
      <div className="media-thumbnail">
        <MediaArtwork kind={item.artwork} />
      </div>
      <div className="media-card-content">
        <strong>{item.name}</strong>
        <span>
          {item.kind === 'video' ? 'Film' : 'Zdjęcie'} · {item.format}
        </span>
      </div>
      <span className="media-card-size">{item.size}</span>
      <span className="media-card-date">{item.addedAt}</span>
      <ArrowUpRight size={16} className="media-row-arrow" aria-hidden="true" />
    </button>
  )
}
