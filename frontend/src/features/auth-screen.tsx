import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, LogIn, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PlayMark } from '@/components/app-shell'
import { ContentError } from '@/components/content-loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  hasAnyUsers,
  registerFirstUser,
  signIn,
  type LibrarySession,
} from '@/lib/media-api'

const userStatusQueryKey = ['has-any-users'] as const
const minRegistrationPasswordLength = 12

export function AuthScreen({
  message,
  onSignIn,
}: {
  message?: string
  onSignIn: (session: LibrarySession) => void
}) {
  const queryClient = useQueryClient()
  const userStatus = useQuery({
    queryKey: userStatusQueryKey,
    queryFn: ({ signal }) => hasAnyUsers(signal),
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const isRegistering = userStatus.data === false
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = new FormData(event.currentTarget)
    const login = String(form.get('login') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (login.length < 3) {
      setError('Login musi mieć co najmniej 3 znaki.')
      return
    }

    setPending(true)
    setError('')
    try {
      if (isRegistering) {
        const created = await registerFirstUser(login, password)
        setNotice(
          created
            ? 'Konto zostało utworzone. Zaloguj się, aby przejść do panelu.'
            : 'Konto jest już skonfigurowane. Zaloguj się, aby przejść do panelu.',
        )
        queryClient.setQueryData(userStatusQueryKey, true)
        return
      }
      onSignIn(await signIn(login, password))
    } catch (error) {
      const fallback = isRegistering
        ? 'Nie udało się utworzyć konta.'
        : 'Nie udało się zalogować.'
      setError(error instanceof Error ? error.message : fallback)
    } finally {
      setPending(false)
    }
  }

  const alert = error || (notice ? '' : message)
  const title = isRegistering ? 'Utwórz pierwsze konto' : 'Zaloguj się'

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="brand mb-6">
          <span className="brand-symbol">
            <PlayMark />
          </span>
          <span>pixto</span>
        </div>
        {userStatus.isPending ? (
          <div className="surface flex items-center gap-3 p-5" role="status">
            {userStatus.isPaused ? (
              'Brak połączenia. Sprawdzimy stan konta po odzyskaniu połączenia.'
            ) : (
              <>
                <LoaderCircle
                  className="motion-safe:animate-spin"
                  size={18}
                  aria-hidden="true"
                />
                Sprawdzanie stanu konta…
              </>
            )}
          </div>
        ) : userStatus.isError ? (
          <ContentError
            message={userStatus.error.message}
            onRetry={() => void userStatus.refetch()}
          />
        ) : (
          <form
            onSubmit={handleSubmit}
            aria-labelledby="auth-title"
            className="surface grid gap-4 p-5 sm:p-6"
          >
            <div>
              <h1 id="auth-title" className="text-xl font-semibold">
                {title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isRegistering
                  ? 'Skonfiguruj konto administratora panelu.'
                  : 'Zaloguj się do panelu zarządzania treściami.'}
              </p>
            </div>
            <label className="grid gap-2 text-sm">
              Login
              <Input
                name="login"
                autoComplete="username"
                minLength={3}
                maxLength={128}
                required
                disabled={pending}
              />
            </label>
            <label className="grid gap-2 text-sm">
              Hasło
              <Input
                key={isRegistering ? 'new' : 'current'}
                name="password"
                type="password"
                autoComplete={
                  isRegistering ? 'new-password' : 'current-password'
                }
                minLength={isRegistering ? minRegistrationPasswordLength : 1}
                maxLength={256}
                aria-describedby={
                  isRegistering ? 'password-requirement' : undefined
                }
                required
                disabled={pending}
              />
            </label>
            {isRegistering && (
              <p
                id="password-requirement"
                className="text-sm text-muted-foreground"
              >
                Hasło musi mieć co najmniej {minRegistrationPasswordLength}{' '}
                znaków.
              </p>
            )}
            {alert ? (
              <p role="alert" className="text-sm text-destructive">
                {alert}
              </p>
            ) : notice ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {isRegistering ? <UserPlus size={16} /> : <LogIn size={16} />}
              {pending
                ? isRegistering
                  ? 'Tworzenie konta…'
                  : 'Logowanie…'
                : title}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
