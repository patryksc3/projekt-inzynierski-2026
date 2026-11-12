import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import type { Page } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function ContentLoading({
  page,
  paused = false,
}: {
  page: Page
  paused?: boolean
}) {
  return (
    <div className="content-loading">
      <div className="loading-caption" role="status">
        <span
          className={`loading-mark ${paused ? 'is-paused' : ''}`}
          aria-hidden="true"
        >
          <LoaderCircle size={20} />
        </span>
        <div>
          <h1>{paused ? 'Brak połączenia' : 'Wczytywanie danych'}</h1>
          <p>
            {paused
              ? 'Dane pojawią się po odzyskaniu połączenia.'
              : page === 'library'
                ? 'Pobieranie biblioteki mediów.'
                : 'Pobieranie materiałów i playlist.'}
          </p>
        </div>
      </div>
      <div aria-hidden="true" className="loading-placeholder-layout">
        {page === 'dashboard' ? (
          <>
            <div className="summary-grid">
              {Array.from({ length: 3 }, (_, i) => (
                <div className="summary-card loading-summary" key={i}>
                  <Skeleton className="skeleton-label" />
                  <Skeleton className="skeleton-value" />
                </div>
              ))}
            </div>
            <div className="surface loading-table">
              <Skeleton className="skeleton-heading" />
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton className="skeleton-row" key={i} />
              ))}
            </div>
            <div className="dashboard-bottom">
              <Skeleton className="loading-panel" />
              <Skeleton className="loading-panel" />
            </div>
          </>
        ) : (
          <div className="surface loading-library">
            <div className="loading-toolbar">
              <Skeleton className="skeleton-heading" />
              <Skeleton className="skeleton-heading" />
            </div>
            <div className="media-grid library-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="media-card" key={i}>
                  <Skeleton className="media-thumbnail" />
                  <div className="media-card-content">
                    <Skeleton className="skeleton-label" />
                    <Skeleton className="skeleton-description" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ContentError({
  message,
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <section className="content-error" role="alert">
      <span className="error-symbol">
        <CircleAlert size={28} />
      </span>
      <h1>Nie udało się wczytać treści</h1>
      <p>{message ?? 'Sprawdź połączenie i spróbuj ponownie.'}</p>
      <Button onClick={onRetry}>
        <RefreshCw size={15} />
        Spróbuj ponownie
      </Button>
    </section>
  )
}
