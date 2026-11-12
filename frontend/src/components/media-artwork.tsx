import { cn } from '@/lib/utils'
import type { ArtworkKind } from '@/types/content'

const placeholderNumbers: Record<ArtworkKind, number> = {
  welcome: 1,
  'open-day': 2,
  campus: 3,
  workshop: 4,
  library: 5,
  cafe: 6,
}

export function MediaArtwork({
  kind,
  className,
}: {
  kind: ArtworkKind
  className?: string
}) {
  return (
    <div className={cn('media-artwork', className)} aria-hidden="true">
      <span className="media-placeholder-label">
        Obrazek {placeholderNumbers[kind]}
      </span>
    </div>
  )
}
