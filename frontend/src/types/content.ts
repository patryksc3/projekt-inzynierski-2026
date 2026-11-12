export type MediaKind = 'image' | 'video'
export type ArtworkKind =
  'welcome' | 'open-day' | 'campus' | 'workshop' | 'library' | 'cafe'

export interface MediaItem {
  id: string
  name: string
  kind: MediaKind
  format: string
  size: string
  duration: string
  artwork: ArtworkKind
  addedAt: string
}

export interface Playlist {
  id: string
  name: string
  description: string
  mediaIds: string[]
  duration: string
  status: 'active' | 'ready' | 'draft'
  updatedAt: string
}

export interface ScheduleSlot {
  time: string
  end: string
  playlistId: string
  label: string
  active: boolean
}

export interface ContentData {
  media: MediaItem[]
  playlists: Playlist[]
  schedule: ScheduleSlot[]
}
