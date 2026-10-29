import {
  ArrowUpRight,
  Asterisk,
  BookOpen,
  Coffee,
  Play,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArtworkKind } from '@/types/content'

export function MediaArtwork({
  kind,
  className,
}: {
  kind: ArtworkKind
  className?: string
}) {
  return (
    <div
      className={cn('media-artwork', `art-${kind}`, className)}
      aria-hidden="true"
    >
      {kind === 'welcome' && (
        <>
          <span className="art-eyebrow">TWOJE MIEJSCE. TWOJE MOŻLIWOŚCI.</span>
          <strong>
            Dobrze
            <br />
            Cię widzieć<span>!</span>
          </strong>
          <div className="welcome-orbit" />
          <Asterisk className="art-asterisk" />
          <span className="art-foot">
            Nowy dzień. Nowe pomysły. <ArrowUpRight />
          </span>
        </>
      )}
      {kind === 'open-day' && (
        <>
          <span className="art-eyebrow">OTWÓRZ SIĘ NA PRZYSZŁOŚĆ</span>
          <strong>
            Dzień
            <br />
            otwarty<span>↗</span>
          </strong>
          <div className="art-date">
            14.11<span>2026</span>
          </div>
          <span className="art-foot">Zobacz, co przed Tobą.</span>
        </>
      )}
      {kind === 'campus' && (
        <>
          <div className="campus-sky" />
          <div className="campus-building building-one" />
          <div className="campus-building building-two" />
          <div className="campus-building building-three" />
          <span className="art-eyebrow">ODKRYWAJ WIĘCEJ</span>
          <strong>
            Twój nowy
            <br />
            punkt widzenia.
          </strong>
          <span className="art-play">
            <Play fill="currentColor" />
          </span>
        </>
      )}
      {kind === 'workshop' && (
        <>
          <span className="art-eyebrow">ZRÓB MIEJSCE NA KREATYWNOŚĆ</span>
          <Sparkles className="workshop-spark" />
          <strong>
            Pomysły
            <br />w ruch.
          </strong>
          <span className="art-foot">
            Warsztaty • Listopad 2026 <ArrowUpRight />
          </span>
        </>
      )}
      {kind === 'library' && (
        <>
          <span className="art-eyebrow">JESZCZE JEDEN ROZDZIAŁ</span>
          <BookOpen className="library-book" />
          <strong>
            Dobre historie
            <br />
            nie śpią.
          </strong>
          <span className="art-foot">Biblioteka otwarta do 22:00</span>
        </>
      )}
      {kind === 'cafe' && (
        <>
          <span className="art-eyebrow">ZŁAP ODDECH</span>
          <Coffee className="cafe-cup" />
          <strong>
            Mała przerwa.
            <br />
            Wielkie plany.
          </strong>
          <span className="art-foot">Spotkajmy się przy kawie.</span>
        </>
      )}
    </div>
  )
}
