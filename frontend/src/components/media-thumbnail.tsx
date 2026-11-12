import { useQuery } from '@tanstack/react-query'
import { FileImage, Film } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  fetchMediaThumbnail,
  mediaThumbnailQueryKey,
  type LibraryMedia,
  type LibrarySession,
} from '@/lib/media-api'
import { cn } from '@/lib/utils'

export function MediaThumbnail({
  item,
  session,
  preview = false,
}: {
  item: LibraryMedia
  session: LibrarySession
  preview?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const { data } = useQuery({
    queryKey: [...mediaThumbnailQueryKey(session.id), item.id],
    queryFn: ({ signal }) =>
      fetchMediaThumbnail(session.token, item.id, signal),
    enabled: preview || nearViewport,
    staleTime: 5 * 60_000,
    gcTime: 60_000,
    retry: false,
  })

  useEffect(() => {
    if (preview || nearViewport || !container.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        setNearViewport(true)
      },
      { rootMargin: '160px' },
    )
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [preview, nearViewport])

  useEffect(() => {
    const element = image.current
    if (!data || !element) return
    const objectUrl = URL.createObjectURL(data)
    element.style.opacity = '0'
    element.src = objectUrl
    return () => {
      element.removeAttribute('src')
      URL.revokeObjectURL(objectUrl)
    }
  }, [data])

  const Icon = item.kind === 'video' ? Film : FileImage
  return (
    <div
      ref={container}
      aria-hidden="true"
      className={cn(
        'relative grid w-full place-items-center overflow-hidden bg-secondary text-muted-foreground',
        preview ? 'aspect-video rounded-md' : 'h-full',
      )}
    >
      <Icon size={preview ? 32 : 17} />
      {data && (
        <img
          ref={image}
          alt=""
          onLoad={(event) => {
            event.currentTarget.style.opacity = '1'
          }}
          className={cn(
            'absolute inset-0 h-full w-full bg-secondary opacity-0',
            preview ? 'object-contain' : 'object-cover',
          )}
        />
      )}
    </div>
  )
}
