# Zdjęcia i wideo (media)

Dokument opisuje przesyłanie, przechowywanie i pobieranie plików multimedialnych. Pliki leżą na lokalnym dysku serwera (`IMediaStorage` → `LocalFileMediaStorage`), a metadane w tabeli `MediaItems` w PostgreSQL. Biblioteka mediów jest wspólna dla wszystkich użytkowników.

## Endpointy

| Endpoint | Kto | Działanie |
| --- | --- | --- |
| `POST /api/media` | Użytkownik (JWT) | Upload `multipart/form-data`, pole `file`. Zwraca `201` z metadanymi. |
| `GET /api/media` | Użytkownik | Lista mediów (od najnowszych). |
| `GET /api/media/{id}` | Użytkownik | Metadane pliku. |
| `DELETE /api/media/{id}` | Użytkownik | Usuwa rekord i plik. `204` / `404`. |
| `GET /api/media/{id}/content` | Użytkownik lub urządzenie | Pobranie pliku. Obsługuje `Range` (`206`) i `ETag` (SHA-256). |

Kody błędów uploadu: `400` (pusty plik, zły format lub zawartość niezgodna z rozszerzeniem), `413` (plik większy niż limit).

```http
POST /api/media
Authorization: Bearer <user-jwt>
Content-Type: multipart/form-data; boundary=...

--...
Content-Disposition: form-data; name="file"; filename="film.mp4"
```

## Obsługiwane formaty

- Zdjęcia: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`
- Wideo: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`

Lista odpowiada formatom z `raspberry/media_player.py`. Typ (`Kind`) i `ContentType` ustala serwer na podstawie rozszerzenia, a nagłówek `Content-Type` klienta jest ignorowany. Dodatkowo sprawdzane są pierwsze bajty pliku (magic bytes).

## Konfiguracja

```json
"MediaStorage": {
  "RootPath": "media-storage",
  "MaxFileSizeBytes": 524288000
}
```

- `RootPath` – katalog na pliki. Ścieżka względna jest liczona od katalogu aplikacji. W produkcji warto ustawić ścieżkę bezwzględną poza katalogiem aplikacji. Katalog `media-storage/` jest w `.gitignore`.
- `MaxFileSizeBytes` – limit pojedynczego pliku (domyślnie 500 MB). Ustawia też limit Kestrel i `MultipartBodyLengthLimit`.

## Bezpieczeństwo

- Nazwa pliku na dysku to losowy GUID + rozszerzenie; nazwa od użytkownika trafia tylko do `OriginalName`.
- Ścieżka jest sprawdzana, czy leży w `RootPath` (ochrona przed path traversal).
- Zapis idzie przez plik tymczasowy i atomowe przeniesienie; SHA-256 liczone w trakcie zapisu.
- Gdy zapis do bazy się nie powiedzie, świeżo zapisany plik jest usuwany.

## Ograniczenia obecnego etapu

- Każde zalogowane urządzenie może pobrać dowolny plik po `id` (GUID). Ograniczenie do plików z playlisty urządzenia pojawi się razem z playlistami.
- Brak transkodowania i miniatur.
- Przy wielu instancjach API lokalny dysk musi być współdzielony; docelowo można dodać implementację MinIO/S3 pod `IMediaStorage`.
