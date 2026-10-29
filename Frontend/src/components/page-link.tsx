import type { ComponentProps } from 'react'
import type { Page } from '@/components/app-shell'

type PageLinkProps = Omit<ComponentProps<'a'>, 'href' | 'onClick'> & {
  page: Page
  navigate: (page: Page) => void
}

export function PageLink({ page, navigate, ...props }: PageLinkProps) {
  return (
    <a
      {...props}
      href={`#${page}`}
      onClick={(event) => {
        // Modified clicks retain native browser navigation, including new tabs.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }

        event.preventDefault()
        navigate(page)
      }}
    />
  )
}
