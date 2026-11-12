import { ArrowUpRight, FileImage, Film } from 'lucide-react'
import { MediaArtwork } from '@/components/media-artwork'
import type { MediaItem } from '@/types/content'

type CardMedia = Pick<
  MediaItem,
  'name' | 'kind' | 'format' | 'size' | 'addedAt'
> &
  Partial<Pick<MediaItem, 'artwork'>>

export function MediaCard<T extends CardMedia>({
  item,
  onSelect,
}: {
  item: T
  onSelect: (item: T) => void
}) {
  const FileIcon = item.kind === 'video' ? Film : FileImage
  return (
    <button
      className="media-card"
      onClick={() => onSelect(item)}
      aria-label={`${item.artwork ? 'Podgląd' : 'Szczegóły'}: ${item.name}`}
    >
      <div className="media-thumbnail">
        {item.artwork ? (
          <MediaArtwork kind={item.artwork} />
        ) : (
          <div className="media-artwork" aria-hidden="true">
            <FileIcon size={17} />
          </div>
        )}
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
