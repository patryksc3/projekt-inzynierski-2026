import {
  CircleHelp,
  FolderOpen,
  LayoutGrid,
  CalendarDays,
  ListVideo,
  LogOut,
  Menu,
  RefreshCw,
  Monitor,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { PageLink } from '@/components/page-link'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type Page = 'dashboard' | 'library' | 'devices'

const mainContentId = 'main-content'
const workspaceLabels: Record<Page, string> = {
  dashboard: 'Pulpit',
  library: 'Biblioteka',
  devices: 'Urządzenia',
}

export function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="6" height="16" rx="3" fill="currentColor" />
      <path
        d="M13 5.5c0-1.2 1.3-1.9 2.3-1.2l6.4 6.2c.8.7.8 2 0 2.7l-6.4 6.2c-1 .8-2.3.1-2.3-1.1V5.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function Navigation({
  page,
  navigate,
  mediaCount,
}: {
  page: Page
  navigate: (page: Page) => void
  mediaCount?: number
}) {
  return (
    <nav className="primary-navigation" aria-label="Menu główne">
      <PageLink
        page="dashboard"
        navigate={navigate}
        className={cn('navigation-link', page === 'dashboard' && 'is-active')}
        aria-current={page === 'dashboard' ? 'page' : undefined}
      >
        <LayoutGrid size={17} />
        Pulpit
      </PageLink>
      <PageLink
        page="library"
        navigate={navigate}
        className={cn('navigation-link', page === 'library' && 'is-active')}
        aria-current={page === 'library' ? 'page' : undefined}
      >
        <FolderOpen size={17} />
        Biblioteka
        {mediaCount !== undefined && (
          <span className="navigation-count">{mediaCount}</span>
        )}
      </PageLink>
      <PageLink
        page="devices"
        navigate={navigate}
        className={cn('navigation-link', page === 'devices' && 'is-active')}
        aria-current={page === 'devices' ? 'page' : undefined}
      >
        <Monitor size={17} />
        Urządzenia
      </PageLink>
      <span
        className="navigation-link navigation-unavailable"
        aria-disabled="true"
      >
        <ListVideo size={17} />
        Playlisty<small>Wkrótce</small>
      </span>
      <span
        className="navigation-link navigation-unavailable"
        aria-disabled="true"
      >
        <CalendarDays size={17} />
        Harmonogram<small>Wkrótce</small>
      </span>
    </nav>
  )
}

export function AppShell({
  page,
  navigate,
  onHelp,
  children,
  mediaCount,
  accountLogin,
  onSignOut,
  isFetching,
  onRefresh,
}: {
  page: Page
  navigate: (page: Page) => void
  onHelp: () => void
  children: ReactNode
  mediaCount?: number
  accountLogin?: string
  onSignOut?: () => void
  isFetching: boolean
  onRefresh?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const mainContentRef = useRef<HTMLElement>(null)
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href={`#${mainContentId}`}
        onClick={(event) => {
          event.preventDefault()
          mainContentRef.current?.focus()
        }}
      >
        Przejdź do treści
      </a>
      <header className="app-header">
        <div className="header-inner">
          <PageLink
            className="brand"
            page="dashboard"
            navigate={navigate}
            aria-label="pixto — pulpit"
          >
            <span className="brand-symbol">
              <PlayMark />
            </span>
            <span>pixto</span>
          </PageLink>
          <div className="desktop-navigation">
            <Navigation
              page={page}
              navigate={navigate}
              mediaCount={mediaCount}
            />
          </div>
          <div className="header-actions">
            <Button
              variant="ghost"
              size="icon"
              className="help-button"
              aria-label="O projekcie"
              title="O projekcie"
              onClick={onHelp}
            >
              <CircleHelp size={18} />
            </Button>
            <span className="header-divider" />
            {accountLogin && (
              <div className="account">
                <span className="avatar" aria-hidden="true">
                  {accountLogin.slice(0, 2).toUpperCase()}
                </span>
                <span
                  className="account-name max-w-28 truncate"
                  title={accountLogin}
                >
                  {accountLogin}
                </span>
              </div>
            )}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Otwórz menu"
                >
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="mobile-navigation">
                <SheetTitle>Nawigacja</SheetTitle>
                <SheetDescription>Panel zarządzania treściami</SheetDescription>
                <Navigation
                  page={page}
                  mediaCount={mediaCount}
                  navigate={(next) => {
                    navigate(next)
                    setMenuOpen(false)
                  }}
                />
                <Button
                  variant="ghost"
                  className="mobile-about"
                  onClick={() => {
                    setMenuOpen(false)
                    onHelp()
                  }}
                >
                  <CircleHelp size={17} />O projekcie
                </Button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {isFetching && <div className="fetch-progress" aria-hidden="true" />}
        <span className="sr-only" role="status">
          {isFetching ? 'Pobieranie danych…' : ''}
        </span>
      </header>
      <div className="workspace-bar">
        <div className="workspace-label">
          <Monitor size={15} />
          <span>Przestrzeń uczelni</span>
          <span className="workspace-slash">/</span>
          <strong>{workspaceLabels[page]}</strong>
        </div>
        <div className="workspace-actions">
          {page === 'dashboard' && (
            <span className="demo-label">Wersja demonstracyjna</span>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="refresh-button"
              aria-label="Odśwież dane"
              title="Odśwież dane"
              disabled={isFetching}
              onClick={onRefresh}
            >
              <RefreshCw
                size={16}
                className={isFetching ? 'refresh-spinning' : ''}
              />
            </Button>
          )}
          {onSignOut && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Wyloguj się"
              title="Wyloguj się"
              onClick={onSignOut}
            >
              <LogOut size={16} />
            </Button>
          )}
        </div>
      </div>
      <main id={mainContentId} ref={mainContentRef} tabIndex={-1}>
        {children}
      </main>
      <footer className="app-footer">
        <span>
          pixto <span className="footer-separator">/</span> Zarządzanie
          treściami
        </span>
        <span>Projekt inżynierski · 2026</span>
      </footer>
    </div>
  )
}
