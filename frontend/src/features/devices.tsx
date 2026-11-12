import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, LoaderCircle, Monitor, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isUnauthorized } from '@/lib/api'
import {
  createDevice,
  devicesQueryKey,
  generatePairCode,
  type Device,
  type DevicePairing,
} from '@/lib/devices-api'
import type { LibrarySession } from '@/lib/media-api'

const formatTime = new Intl.DateTimeFormat('pl-PL', { timeStyle: 'medium' })
const maxNameLength = 128

function PairingCode({ code, expiresAt }: DevicePairing) {
  const [expired, setExpired] = useState(() => Date.now() >= expiresAt)
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setExpired(true),
      Math.max(0, expiresAt - Date.now()),
    )
    return () => window.clearTimeout(timeout)
  }, [expiresAt])

  async function copyCode() {
    if (Date.now() >= expiresAt) {
      setExpired(true)
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      setCopyMessage('Skopiowano kod parowania.')
    } catch {
      setCopyMessage(
        'Nie udało się skopiować kodu. Zaznacz go i skopiuj ręcznie.',
      )
    }
  }

  if (expired) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Kod wygasł. Wygeneruj nowy kod parowania.
      </p>
    )
  }

  return (
    <div className="grid gap-2 rounded-md border border-border p-3">
      <label htmlFor="device-pair-code" className="text-sm font-medium">
        Jednorazowy kod parowania
      </label>
      <div className="flex gap-2">
        <Input
          id="device-pair-code"
          className="min-w-0 flex-1 font-mono"
          value={code}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={() => void copyCode()}>
          <Copy size={16} />
          Kopiuj
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Ważny do {formatTime.format(expiresAt)}
      </p>
      {copyMessage && (
        <p role="status" className="text-sm">
          {copyMessage}
        </p>
      )}
    </div>
  )
}

type DeviceDialog = { type: 'create' } | { type: 'pair'; device: Device }

export function Devices({
  devices,
  session,
  onSessionExpired,
}: {
  devices: Device[]
  session: LibrarySession
  onSessionExpired: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = devicesQueryKey(session.id)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [dialog, setDialog] = useState<DeviceDialog | null>(null)
  const [nameError, setNameError] = useState('')

  function handleMutationError(error: Error) {
    if (isUnauthorized(error)) onSessionExpired()
  }

  const create = useMutation({
    mutationFn: (name: string) => createDevice(session.token, name),
    onError: handleMutationError,
    onSuccess: async (device) => {
      await queryClient.cancelQueries({ queryKey, exact: true })
      queryClient.setQueryData<Device[]>(
        queryKey,
        (items) =>
          items &&
          [...items.filter((item) => item.id !== device.id), device].sort(
            (a, b) => a.name.localeCompare(b.name, 'pl'),
          ),
      )
      void queryClient.invalidateQueries({ queryKey, exact: true })
    },
  })
  const pairing = useMutation({
    mutationFn: (deviceId: string) => generatePairCode(session.token, deviceId),
    gcTime: 0,
    onError: handleMutationError,
  })
  const busy = create.isPending || pairing.isPending

  function openDialog(next: DeviceDialog, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setDialog(next)
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const name = String(
      new FormData(event.currentTarget).get('name') ?? '',
    ).trim()
    if (name.length === 0 || name.length > maxNameLength) {
      setNameError(`Wpisz nazwę od 1 do ${maxNameLength} znaków.`)
      return
    }

    setNameError('')
    create.mutate(name, {
      onSuccess: (device) => setDialog({ type: 'pair', device }),
    })
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Urządzenia</h1>
          <p>Dodawaj i paruj ekrany obsługiwane przez Raspberry Pi.</p>
        </div>
        <Button
          onClick={(event) =>
            openDialog({ type: 'create' }, event.currentTarget)
          }
        >
          <Plus size={17} />
          Dodaj urządzenie
        </Button>
      </section>

      <section className="surface" aria-label="Lista urządzeń">
        {devices.length === 0 ? (
          <div className="empty-state">
            <Monitor aria-hidden="true" />
            <h2>Brak urządzeń</h2>
            <p>Dodaj pierwszy ekran, aby wygenerować kod parowania.</p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Monitor size={17} aria-hidden="true" />
                  </span>
                  <span className="font-medium wrap-anywhere">
                    {device.name}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Kod parowania dla urządzenia ${device.name}`}
                  onClick={(event) =>
                    openDialog({ type: 'pair', device }, event.currentTarget)
                  }
                >
                  <KeyRound size={16} />
                  Kod parowania
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDialog(null)
            setNameError('')
            create.reset()
            pairing.reset()
          }
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          {dialog?.type === 'create' && (
            <>
              <DialogHeader>
                <DialogTitle>Dodaj urządzenie</DialogTitle>
                <DialogDescription>
                  Nadaj ekranowi nazwę, po której rozpoznasz go na liście.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                  Nazwa urządzenia
                  <Input
                    name="name"
                    placeholder="Np. Ekran przy wejściu"
                    maxLength={maxNameLength}
                    required
                    disabled={busy}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={
                      nameError ? 'device-name-error' : undefined
                    }
                    onChange={() => setNameError('')}
                  />
                </label>
                {nameError && (
                  <p
                    id="device-name-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {nameError}
                  </p>
                )}
                {create.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {create.error.message}
                  </p>
                )}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={busy}>
                      Anuluj
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={busy}>
                    {create.isPending && (
                      <LoaderCircle className="motion-safe:animate-spin" />
                    )}
                    {create.isPending ? 'Dodawanie…' : 'Dodaj urządzenie'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
          {dialog?.type === 'pair' && (
            <>
              <DialogHeader>
                <DialogTitle>Parowanie urządzenia</DialogTitle>
                <DialogDescription className="wrap-anywhere">
                  {dialog.device.name} · Przekaż kod do konfiguracji Raspberry
                  Pi.
                </DialogDescription>
              </DialogHeader>
              {pairing.data && (
                <PairingCode key={pairing.data.code} {...pairing.data} />
              )}
              {pairing.error && (
                <p role="alert" className="text-sm text-destructive">
                  {pairing.error.message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={busy}>
                    Zamknij
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => pairing.mutate(dialog.device.id)}
                >
                  {pairing.isPending ? (
                    <LoaderCircle className="motion-safe:animate-spin" />
                  ) : (
                    <KeyRound size={16} />
                  )}
                  {pairing.isPending
                    ? 'Generowanie…'
                    : pairing.data
                      ? 'Wygeneruj nowy kod'
                      : 'Wygeneruj kod parowania'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
