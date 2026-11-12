import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn, type LibrarySession } from '@/lib/media-api'

export function LibraryLogin({
  title,
  description,
  message,
  onSignIn,
}: {
  title: string
  description: string
  message?: string
  onSignIn: (session: LibrarySession) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

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
      onSignIn(await signIn(login, password))
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Nie udało się zalogować.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>
      <form
        onSubmit={handleSubmit}
        className="surface grid w-full max-w-sm gap-4 p-5"
      >
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
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
            required
            disabled={pending}
          />
        </label>
        {(error || message) && (
          <p role="alert" className="text-sm text-destructive">
            {error || message}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          <LogIn size={16} />
          {pending ? 'Logowanie…' : 'Zaloguj się'}
        </Button>
      </form>
    </>
  )
}
