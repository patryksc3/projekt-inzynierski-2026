import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Monitor, Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isUnauthorized } from '@/lib/api'
import type { LibrarySession } from '@/lib/media-api'
import {
  createDevice,
  devicesQueryKey,
  saveScheduleBlock,
  scheduleQueryKey,
  type ScheduleBlock,
  type ScheduleBlockInput,
} from '@/lib/schedule-api'

type Option = { id: string; name: string }

const dateTimeFormat = new Intl.DateTimeFormat('pl', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
})
const timeZone = dateTimeFormat.resolvedOptions().timeZone

function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function toInstant(local: string, original?: string) {
  if (original && localInputValue(new Date(original)) === local) return original
  const date = new Date(local)
  if (!Number.isFinite(date.getTime()) || localInputValue(date) !== local)
    return null
  return date.toISOString()
}

export function Schedule({
  blocks,
  devices,
  playlists,
  optionsError,
  session,
  onPlaylists,
  onRetryOptions,
  onSessionExpired,
}: {
  blocks: ScheduleBlock[]
  devices?: Option[]
  playlists?: Option[]
  optionsError?: string
  session: LibrarySession
  onPlaylists: () => void
  onRetryOptions: () => void
  onSessionExpired: () => void
}) {
  const [editor, setEditor] = useState<'new' | ScheduleBlock | null>(null)
  const [notice, setNotice] = useState('')
  const canEdit = Boolean(devices?.length && playlists?.length)

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Harmonogram</h1>
          <p>Zaplanuj emisję playlisty na wybranym ekranie.</p>
        </div>
        <Button disabled={!canEdit} onClick={() => setEditor('new')}>
          <Plus size={17} />
          Nowy blok
        </Button>
      </section>
      <p
        className={notice ? 'mb-4 text-sm text-muted-foreground' : 'sr-only'}
        role="status"
      >
        {notice}
      </p>
      {optionsError ? (
        <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4">
          <p role="alert" className="text-sm">
            {optionsError}
          </p>
          <Button variant="outline" onClick={onRetryOptions}>
            Ponów pobieranie
          </Button>
        </div>
      ) : (
        (!devices || !playlists) && (
          <p className="mb-4 text-sm text-muted-foreground" role="status">
            Wczytywanie ekranów i playlist…
          </p>
        )
      )}
      {devices?.length === 0 && (
        <FirstScreenForm
          session={session}
          onRegistered={(name) => setNotice(`Dodano ekran „${name}”.`)}
          onSessionExpired={onSessionExpired}
        />
      )}
      {playlists?.length === 0 && (
        <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm">Utwórz playlistę, aby zaplanować emisję.</p>
          <Button variant="outline" onClick={onPlaylists}>
            Otwórz playlisty
          </Button>
        </div>
      )}
      {blocks.length === 0 ? (
        <div className="surface grid justify-items-center gap-3 px-4 py-12 text-center">
          <CalendarDays size={24} className="text-muted-foreground" />
          <h2 className="font-semibold">Brak zaplanowanych emisji</h2>
        </div>
      ) : (
        <ul className="surface divide-y divide-border">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-5"
            >
              <div className="min-w-0">
                <h2 className="font-semibold wrap-break-word">
                  {block.playlistName}
                </h2>
                <p className="flex items-center gap-2 text-sm wrap-break-word text-muted-foreground">
                  <Monitor size={15} className="shrink-0" />{' '}
                  <span className="min-w-0">{block.deviceName}</span>
                </p>
              </div>
              <p className="col-span-2 row-start-2 text-sm text-muted-foreground sm:col-span-1 sm:row-start-auto">
                <time dateTime={block.startsAt}>
                  {dateTimeFormat.format(new Date(block.startsAt))}
                </time>
                {' – '}
                <time dateTime={block.endsAt}>
                  {dateTimeFormat.format(new Date(block.endsAt))}
                </time>
              </p>
              <Button
                variant="outline"
                disabled={!canEdit}
                aria-label={`Edytuj blok ${block.playlistName}, ${block.deviceName}, ${dateTimeFormat.format(new Date(block.startsAt))}`}
                onClick={() => setEditor(block)}
              >
                <Pencil size={15} />
                Edytuj
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editor && devices && playlists && (
        <ScheduleEditor
          original={editor === 'new' ? undefined : editor}
          devices={devices}
          playlists={playlists}
          session={session}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setNotice('Zapisano blok emisji.')
            setEditor(null)
          }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </>
  )
}

function FirstScreenForm({
  session,
  onRegistered,
  onSessionExpired,
}: {
  session: LibrarySession
  onRegistered: (name: string) => void
  onSessionExpired: () => void
}) {
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const queryKey = devicesQueryKey(session.id)
  const create = useMutation({
    mutationFn: (name: string) => createDevice(session.token, name),
    gcTime: 0,
    onError: (error) => {
      if (isUnauthorized(error)) onSessionExpired()
    },
    onSuccess: async (device) => {
      await queryClient.cancelQueries({ queryKey, exact: true })
      queryClient.setQueryData<Option[]>(
        queryKey,
        (current) =>
          current && [
            ...current.filter((item) => item.id !== device.id),
            device,
          ],
      )
      void queryClient.invalidateQueries({ queryKey, exact: true })
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || create.isPending) return
    create.mutate(trimmedName, {
      onSuccess: (device) => onRegistered(device.name),
    })
  }

  return (
    <form onSubmit={submit} className="surface mb-4 grid gap-3 p-4">
      <p className="text-sm">Dodaj pierwszy ekran, aby zaplanować emisję.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid w-full max-w-xs gap-2 text-sm">
          Nazwa ekranu
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={128}
            required
            disabled={create.isPending}
          />
        </label>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <Plus size={16} />
          {create.isPending ? 'Dodawanie…' : 'Dodaj ekran'}
        </Button>
      </div>
      {create.error && (
        <p className="text-sm text-destructive" role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  )
}

function ScheduleEditor({
  original,
  devices,
  playlists,
  session,
  onClose,
  onSaved,
  onSessionExpired,
}: {
  original?: ScheduleBlock
  devices: Option[]
  playlists: Option[]
  session: LibrarySession
  onClose: () => void
  onSaved: () => void
  onSessionExpired: () => void
}) {
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const queryKey = scheduleQueryKey(session.id)
  const save = useMutation({
    mutationFn: (draft: ScheduleBlockInput) =>
      saveScheduleBlock(session.token, draft, original),
    gcTime: 0,
    onError: (error) => {
      if (isUnauthorized(error)) onSessionExpired()
    },
    onSuccess: async (block) => {
      await queryClient.cancelQueries({ queryKey, exact: true })
      queryClient.setQueryData<ScheduleBlock[]>(
        queryKey,
        (current) =>
          current &&
          [...current.filter((item) => item.id !== block.id), block].sort(
            (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
          ),
      )
      void queryClient.invalidateQueries({ queryKey, exact: true })
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (save.isPending) return
    save.reset()
    const form = new FormData(event.currentTarget)
    const startsAt = toInstant(
      String(form.get('startsAt') ?? ''),
      original?.startsAt,
    )
    const endsAt = toInstant(String(form.get('endsAt') ?? ''), original?.endsAt)
    if (!startsAt || !endsAt) {
      setError(
        'Wybierz daty i godziny, które istnieją w Twojej strefie czasowej.',
      )
      return
    }
    if (Date.parse(startsAt) >= Date.parse(endsAt)) {
      setError('Koniec emisji musi przypadać po jej rozpoczęciu.')
      return
    }
    setError('')
    save.mutate(
      {
        deviceId: String(form.get('deviceId') ?? ''),
        playlistId: String(form.get('playlistId') ?? ''),
        startsAt,
        endsAt,
      },
      { onSuccess: onSaved },
    )
  }

  const pending = save.isPending
  const message = error || save.error?.message
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>
            {original ? 'Edytuj blok emisji' : 'Nowy blok emisji'}
          </DialogTitle>
          <DialogDescription>
            Strefa czasowa przeglądarki: {timeZone}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <ScheduleSelect
            name="playlistId"
            label="Playlista"
            options={playlists}
            defaultValue={original?.playlistId}
            disabled={pending}
          />
          <ScheduleSelect
            name="deviceId"
            label="Ekran"
            options={devices}
            defaultValue={original?.deviceId}
            disabled={pending}
          />
          <label className="grid min-w-0 gap-2 text-sm">
            Początek emisji
            <Input
              name="startsAt"
              type="datetime-local"
              required
              disabled={pending}
              defaultValue={
                original && localInputValue(new Date(original.startsAt))
              }
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm">
            Koniec emisji
            <Input
              name="endsAt"
              type="datetime-local"
              required
              disabled={pending}
              defaultValue={
                original && localInputValue(new Date(original.endsAt))
              }
            />
          </label>
          {message && (
            <p className="text-sm text-destructive" role="alert">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Zapisywanie…' : 'Zapisz blok'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ScheduleSelect({
  name,
  label,
  options,
  defaultValue = '',
  disabled,
}: {
  name: string
  label: string
  options: Option[]
  defaultValue?: string
  disabled: boolean
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm">
      {label}
      <select
        className="h-9 w-full min-w-0 truncate rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        required
      >
        <option value="">Wybierz…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}
