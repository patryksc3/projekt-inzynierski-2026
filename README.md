# Pixto — system zarządzania treściami na Raspberry Pi

Projekt inżynierski: zdalne zarządzanie i wyświetlanie filmów oraz zdjęć na ekranie podłączonym do Raspberry Pi. „Pixto” jest roboczą nazwą interfejsu.

## Uruchomienie frontendu

Wymagania: Node.js 22.12 lub nowszy zgodny z Vite, npm.

```sh
cd frontend
npm ci
npm run dev
```

Vite wypisze lokalny adres aplikacji. Pozostałe polecenia: `npm run build` (kontrola TypeScript i build produkcyjny), `npm run preview` (podgląd buildu), `npm run lint` (analiza kodu), `npm run format` i `npm run format:check` (Prettier).

## Etap 01 — fundament i interfejs

- React, TypeScript w trybie strict, Vite i Tailwind CSS.
- Lokalne komponenty shadcn/ui: Button, Badge, Dialog, Sheet, Input i Tabs. Ikony Lucide, font DM Sans hostowany lokalnie.
- Responsywny pulpit, nawigacja mobilna, biblioteka z wyszukiwaniem, filtrami i sortowaniem.
- Dostępne z klawiatury podglądy materiałów, playlist i przykładowego planu dnia.
- Nawigacja `#dashboard` / `#library`, obsługująca przyciski wstecz i dalej przeglądarki.

To prototyp wizualny. Wszystkie dane oraz data 29.10.2026 są przykładowe. Miniatury są prostymi, numerowanymi placeholderami; nie są przesłanymi plikami. Nie ma jeszcze uploadu, rzeczywistego odtwarzania filmów, logowania, zapisu danych, komunikacji z Raspberry Pi ani API. Oznaczenia aktywności służą prezentacji projektu. Wyszukiwanie i filtry działają w pamięci przeglądarki.

## Struktura

```text
frontend/src/
  components/       # powłoka aplikacji, grafiki i karty materiałów
    ui/             # komponenty shadcn/ui
  features/         # pulpit i biblioteka
  lib/              # wspólne narzędzia
  types/            # modele frontendu (nie są kontraktem API)
  App.tsx           # nawigacja i podglądy
  index.css         # Tailwind i tokeny motywu
  App.css           # układ i responsywność
  media-artwork.css # grafiki demonstracyjne
  loading.css       # animacje i stany pobierania
  dialog.css        # okna podglądu i szczegółów
```

Dane demonstracyjne są w `frontend/public/demo-content.json`.

## Etap 02 — ciemny motyw i ładowanie danych

- Grafitowe tło i szare powierzchnie; fiolet pozostaje akcentem logo i fokusu klawiatury. Motyw obejmuje także okna dialogowe oraz menu mobilne.
- TanStack Query pobiera dane demonstracyjne przez `fetch`. `src/lib/content-query.ts` jest miejscem przyszłej integracji z API. Nie ma sztucznego opóźnienia pobierania.
- Pierwsze pobranie pokazuje animowany szkielet pulpitu lub biblioteki i pulsujący znak pixto. Przy szybkim lokalnym pobraniu ten stan może być widoczny tylko przez chwilę.
- Przycisk odświeżenia w górnym pasku ponawia pobranie; podczas odświeżania pozostają widoczne poprzednie dane, a pasek postępu i obracająca się ikona pokazują aktywność.
- Błąd pierwszego pobrania ma przycisk ponowienia. Błąd odświeżenia zachowuje dane i wyświetla komunikat. Anulowanie korzysta z `AbortSignal`, a preferencja `prefers-reduced-motion` wyłącza animacje.

Implementacja pobierania opiera się na [oficjalnej dokumentacji TanStack Query](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery).

## Etap 03 — hierarchia i czytelność

- Pulpit z większą typografią i wyróżnioną playlistą zamiast banera promocyjnego. Materiał ma osobny podgląd, a akcje mają czytelne etykiety.
- Podsumowanie w jednym pasie, przestronniejsza tabela playlist, plan dnia oraz większe miniatury ostatnio dodanych materiałów.
- Uproszczona biblioteka: wspólny pasek filtrów i wyszukiwania, liczby materiałów wyliczane z danych i widoczne nazwy plików.
- Na telefonach panel nawigacji jest zwijany, sekcje układają się pionowo, a małe ekrany otrzymują pojedynczą kolumnę biblioteki. Animacje uwzględniają preferencję ograniczenia ruchu.
- Style układu, grafik i ładowania są rozdzielone. Pobieranie danych oraz pozostałe funkcje nadal działają na danych demonstracyjnych.

## Kolejne etapy

Aktualny interfejs przebudowano od podstaw wokół poziomej nawigacji, wyśrodkowanej treści i jednolitych sekcji. Pulpit zawiera trzy karty podsumowania, tabelę playlist oraz osobne panele materiałów i harmonogramu. Biblioteka ma wspólny panel wyszukiwania, filtrów i listy plików. Ciemne szarości oraz fioletowe logo pozostają wspólnym motywem. Na małych ekranach nawigacja otwiera się w menu, a sekcje układają się pionowo. Podglądy, obsługa błędów i pobieranie danych są zachowane; szkielet ładowania odpowiada nowemu układowi.

Każdy etap powinien stanowić osobną, spójną zmianę możliwą do przeglądu i osobny commit:

1. **Gotowe:** konfiguracja i pierwsza wersja responsywnego interfejsu.
2. Biblioteka: formularz przesyłania, walidacja i uzgodniony z backendem kontrakt materiałów.
3. Edytor playlist: wybór i kolejność materiałów, czasy emisji, zapis.
4. Harmonogramy: formularze i reguły emisji.
5. Integracja: ASP.NET Core i JWT; TanStack Query jest już przygotowany do obsługi danych serwera.
6. Testy integracyjne i obsługa błędów/synchronizacji; odtwarzanie offline po stronie agenta Raspberry Pi.

Monitorowanie urządzeń, zdalne sterowanie i zarządzanie wieloma ekranami są rozszerzeniami z dokumentu projektowego. Nie są częścią pierwszego etapu. Backend (C#, ASP.NET Core, PostgreSQL) i agent (Python, mpv, SQLite) będą rozwijane niezależnie przez zespół.

Proponowany commit pierwszego etapu: `feat(frontend): add responsive dashboard and media library prototype`.

Konfigurację Vite i shadcn/ui oparto na oficjalnych instrukcjach: [Vite](https://vite.dev/guide/) i [shadcn/ui dla Vite](https://ui.shadcn.com/docs/installation/vite).
