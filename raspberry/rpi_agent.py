import argparse
import hashlib
import json
import os
import re
import sqlite3
import stat
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
import mpv
import requests
import urllib3.util.connection as urllib3_cn

urllib3_cn.HAS_IPV6 = False

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "media_cache"
DB_PATH = BASE_DIR / "agent_data.db"
MOCK_MANIFEST_PATH = BASE_DIR / "mock_manifest.json"
CREDENTIALS_FILE = BASE_DIR / ".device_credential"

API_ORIGIN = os.getenv("RPI_API_ORIGIN", "https://localhost:7169").rstrip("/")
PAIR_ENDPOINT = f"{API_ORIGIN}/api/devices/get-credentials"
LOGIN_ENDPOINT = f"{API_ORIGIN}/api/devices/login"
SYNC_ENDPOINT = os.getenv("RPI_SYNC_URL", f"{API_ORIGIN}/api/schedules/device")

USE_MOCK_API = os.getenv("RPI_USE_MOCK", "true").lower() == "true"
SYNC_INTERVAL_SEC = 15

JWT_REFRESH_MARGIN_SEC = 13 * 60
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v", ".ts", ".mpeg", ".mpg"}


def normalize_media_type(raw_type: str | None, filename: str) -> str:
    if raw_type:
        rt = str(raw_type).lower()
        if "video" in rt:
            return "video"
        if "image" in rt or "photo" in rt:
            return "image"
    if Path(filename).suffix.lower() in VIDEO_EXTENSIONS:
        return "video"
    return "image"


def parse_iso_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    s = re.sub(r"\.(\d+)", lambda m: "." + m.group(1)[:6].ljust(6, "0"), s)
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def safe_cache_filename(file_id: str, original_name: str) -> str:
    clean_name = Path(original_name).name or f"{file_id}.bin"
    clean_name = re.sub(r"[^A-Za-z0-9._-]", "_", clean_name)
    return f"{file_id}_{clean_name}"


class DeviceAuthManager:

    def __init__(self, credentials_path: Path, verify_ssl: bool = True):
        self.credentials_path = credentials_path
        self.verify_ssl = verify_ssl
        self._jwt_token: str | None = None
        self._token_expires_at: float = 0.0
        self._lock = threading.Lock()

    def is_paired(self) -> bool:
        return self.credentials_path.exists() and self.credentials_path.stat().st_size > 0

    def _save_password_securely(self, password: str):
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        mode = stat.S_IRUSR | stat.S_IWUSR
        fd = os.open(self.credentials_path, flags, mode)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(password.strip())
        finally:
            os.chmod(self.credentials_path, mode)
        print(f"[AUTH] Zapisano hasło urządzenia w {self.credentials_path.name} (uprawnienia 0600).")

    def _load_password(self) -> str:
        if not self.is_paired():
            raise RuntimeError("Urządzenie nie posiada zapisanego hasła (wymagane parowanie).")
        return self.credentials_path.read_text(encoding="utf-8").strip()

    def pair_device(self, pair_code: str) -> bool:
        print("[AUTH] Parowanie urządzenia przez POST /api/devices/get-credentials...")
        try:
            resp = requests.post(
                PAIR_ENDPOINT,
                json={"pairCode": pair_code.strip()},
                timeout=10,
                verify=self.verify_ssl
            )
            resp.raise_for_status()
            data = resp.json()

            password = data.get("password")
            if not password:
                print("[AUTH] Błąd parowania: odpowiedź API nie zawiera pola 'password'.")
                return False

            self._save_password_securely(password)
            return True
        except Exception as e:
            print(f"[AUTH] Błąd podczas parowania urządzenia: {e}")
            return False

    def login_device(self) -> str:
        try:
            password = self._load_password()
            resp = requests.post(
                LOGIN_ENDPOINT,
                json={"password": password},
                timeout=10,
                verify=self.verify_ssl
            )

            if resp.status_code in (401, 403):
                print(f"[AUTH] Odrzucono poświadczenia urządzenia (HTTP {resp.status_code}).")
                return "unauthorized"

            resp.raise_for_status()

            token = None
            try:
                data = resp.json()
                if isinstance(data, str):
                    token = data.strip()
                elif isinstance(data, dict):
                    for key in ("token", "accessToken", "jwt", "jwtToken", "deviceToken", "Token", "AccessToken", "access_token"):
                        if isinstance(data.get(key), str) and data.get(key):
                            token = data[key].strip()
                            break
                    if not token:
                        for val in data.values():
                            if isinstance(val, str) and val.startswith("eyJ"):
                                token = val.strip()
                                break
                    if not token:
                        print(f"[AUTH] Otrzymany JSON z /api/devices/login: {data}")
            except ValueError:
                raw_text = resp.text.strip().strip('"')
                if raw_text.startswith("eyJ"):
                    token = raw_text

            if not token:
                print(f"[AUTH] Błąd logowania: brak tokenu JWT w odpowiedzi ({resp.text}).")
                return "offline"

            with self._lock:
                self._jwt_token = token
                self._token_expires_at = time.time() + JWT_REFRESH_MARGIN_SEC

            print("[AUTH] Pobrano nowy token JWT urządzenia (ważny 15 min).")
            return "ok"
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code in (401, 403):
                return "unauthorized"
            print(f"[AUTH] Błąd serwera podczas logowania (/api/devices/login): {e}")
            return "offline"
        except Exception as e:
            print(f"[AUTH] Brak łączności przy logowaniu (/api/devices/login): {e}")
            return "offline"

    def get_valid_token(self, force_refresh: bool = False) -> str | None:
        with self._lock:
            needs_refresh = (
                force_refresh
                or self._jwt_token is None
                or time.time() >= self._token_expires_at
            )

        if needs_refresh:
            if self.login_device() != "ok":
                return None

        with self._lock:
            return self._jwt_token

    def get_headers(self, include_auth: bool = True, force_refresh: bool = False) -> dict[str, str]:
        headers = {"User-Agent": "Mozilla/5.0 (RaspberryPi; Linux armv7l) RPiMediaAgent/1.0"}
        if include_auth:
            token = self.get_valid_token(force_refresh=force_refresh)
            if token:
                headers["Authorization"] = f"Bearer {token}"
        return headers


class LocalDatabase:

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        return sqlite3.connect(self.db_path, check_same_thread=False)

    def _init_db(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS media_files (
                    file_id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    local_path TEXT NOT NULL,
                    sha256 TEXT,
                    media_type TEXT NOT NULL,
                    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schedules (
                    schedule_id TEXT PRIMARY KEY,
                    name TEXT,
                    starts_at TEXT NOT NULL,
                    ends_at TEXT NOT NULL,
                    playlist_id TEXT,
                    playlist_name TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schedule_items (
                    schedule_id TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    file_id TEXT NOT NULL,
                    duration_sec INTEGER DEFAULT 5,
                    PRIMARY KEY (schedule_id, position),
                    FOREIGN KEY (schedule_id) REFERENCES schedules (schedule_id),
                    FOREIGN KEY (file_id) REFERENCES media_files (file_id)
                )
            """)
            conn.commit()

    def upsert_media_file(self, file_id: str, filename: str, local_path: str, sha256: str, media_type: str):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO media_files (file_id, filename, local_path, sha256, media_type)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(file_id) DO UPDATE SET
                    filename=excluded.filename,
                    local_path=excluded.local_path,
                    sha256=excluded.sha256,
                    media_type=excluded.media_type,
                    downloaded_at=CURRENT_TIMESTAMP
            """, (file_id, filename, local_path, sha256, media_type))
            conn.commit()

    def get_cached_file(self, file_id: str):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT filename, local_path, sha256 FROM media_files WHERE file_id = ?", (file_id,))
            return cursor.fetchone()

    def replace_schedules(self, schedules: list[dict]):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM schedule_items")
            cursor.execute("DELETE FROM schedules")
            for sched in schedules:
                cursor.execute("""
                    INSERT INTO schedules (schedule_id, name, starts_at, ends_at, playlist_id, playlist_name)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    sched["schedule_id"],
                    sched.get("name", ""),
                    sched["starts_at"],
                    sched["ends_at"],
                    sched.get("playlist_id", ""),
                    sched.get("playlist_name", "")
                ))
                for pos, item in enumerate(sched["items"]):
                    cursor.execute("""
                        INSERT INTO schedule_items (schedule_id, position, file_id, duration_sec)
                        VALUES (?, ?, ?, ?)
                    """, (sched["schedule_id"], pos, item["file_id"], item["duration_sec"]))
            conn.commit()

    def get_active_schedule_playlist(self) -> tuple[str | None, str, list[dict]]:
        now_utc = datetime.now(timezone.utc)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT schedule_id, name, starts_at, ends_at, playlist_name FROM schedules")
            active_candidates = []
            for row in cursor.fetchall():
                sched_id, sched_name, starts_str, ends_str, playlist_name = row
                starts_dt = parse_iso_utc(starts_str)
                ends_dt = parse_iso_utc(ends_str)
                if starts_dt and ends_dt and starts_dt <= now_utc <= ends_dt:
                    active_candidates.append((starts_dt, sched_id, sched_name or playlist_name or sched_id))

            if not active_candidates:
                return None, "", []

            active_candidates.sort(key=lambda x: x[0], reverse=True)
            _, active_id, active_label = active_candidates[0]

            cursor.execute("""
                SELECT s.position, m.filename, m.local_path, m.media_type, s.duration_sec
                FROM schedule_items s
                JOIN media_files m ON s.file_id = m.file_id
                WHERE s.schedule_id = ?
                ORDER BY s.position ASC
            """, (active_id,))
            items = [
                {
                    "position": r[0],
                    "filename": r[1],
                    "local_path": r[2],
                    "media_type": r[3],
                    "duration_sec": r[4]
                }
                for r in cursor.fetchall()
            ]
            return active_id, active_label, items

    def remove_unused_files(self, active_file_ids: set[str]) -> list[str]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT file_id, local_path FROM media_files")
            removed_paths = []
            for file_id, local_path in cursor.fetchall():
                if file_id not in active_file_ids:
                    cursor.execute("DELETE FROM media_files WHERE file_id = ?", (file_id,))
                    removed_paths.append(local_path)
            conn.commit()
            return removed_paths


class CacheManager:

    def __init__(self, cache_dir: Path, db: LocalDatabase, auth: DeviceAuthManager, use_mock: bool):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db = db
        self.auth = auth
        self.use_mock = use_mock

    @staticmethod
    def calculate_sha256(filepath: Path) -> str:
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(65536), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def ensure_file_cached(self, item: dict) -> bool:
        file_id = item["file_id"]
        filename = item["filename"]
        url = item["url"]
        expected_sha256 = item.get("sha256")
        media_type = normalize_media_type(item.get("media_type"), filename)

        target_path = self.cache_dir / safe_cache_filename(file_id, filename)
        cached_record = self.db.get_cached_file(file_id)

        if cached_record:
            existing_path = Path(cached_record[1])
            if existing_path.exists() and existing_path.stat().st_size > 0:
                if not expected_sha256 or cached_record[2] == expected_sha256:
                    return True

        print(f"[CACHE] Pobieranie nowego pliku na dysk: {filename}...")
        temp_path = target_path.with_suffix(target_path.suffix + ".part")
        try:
            is_internal_api = not self.use_mock and url.startswith(API_ORIGIN)
            headers = self.auth.get_headers(include_auth=is_internal_api)
            if is_internal_api and "Authorization" not in headers:
                return False

            resp = requests.get(url, headers=headers, stream=True, timeout=30, verify=self.auth.verify_ssl)
            if resp.status_code == 401 and is_internal_api:
                resp.close()
                headers = self.auth.get_headers(include_auth=True, force_refresh=True)
                if "Authorization" not in headers:
                    return False
                resp = requests.get(url, headers=headers, stream=True, timeout=30, verify=self.auth.verify_ssl)

            with resp:
                resp.raise_for_status()
                with open(temp_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)

            actual_sha256 = self.calculate_sha256(temp_path)
            if expected_sha256 and actual_sha256 != expected_sha256:
                print(f"[CACHE] Niezgodna suma SHA-256 dla {filename}!")
                temp_path.unlink(missing_ok=True)
                return False

            temp_path.replace(target_path)
            self.db.upsert_media_file(
                file_id=file_id,
                filename=filename,
                local_path=str(target_path),
                sha256=actual_sha256,
                media_type=media_type
            )
            print(f"[CACHE] Zapisano w lokalnym cache: {filename} (SHA-256: {actual_sha256[:12]}...)")
            return True

        except Exception as e:
            temp_path.unlink(missing_ok=True)
            print(f"[CACHE] Błąd pobierania {filename}: {e}")
            return False

    def cleanup_orphaned_files(self, active_file_ids: set[str]):
        for path_str in self.db.remove_unused_files(active_file_ids):
            p = Path(path_str)
            if p.exists():
                p.unlink(missing_ok=True)
                print(f"[CACHE] Usunięto wycofany plik z dysku: {p.name}")


class SyncAgent(threading.Thread):

    def __init__(
        self,
        db: LocalDatabase,
        cache: CacheManager,
        auth: DeviceAuthManager,
        use_mock: bool,
        interval: int = 15
    ):
        super().__init__(daemon=True)
        self.db = db
        self.cache = cache
        self.auth = auth
        self.use_mock = use_mock
        self.interval = interval
        self.running = True
        self._was_offline = False
        self._ensure_mock_manifest()

    def _ensure_mock_manifest(self):
        if self.use_mock and not MOCK_MANIFEST_PATH.exists():
            sample_manifest = {
                "playlist_name": "Playlista Testowa RPi",
                "items": [
                    {
                        "file_id": "img_1",
                        "filename": "plansza_1.jpg",
                        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/1280px-Fronalpstock_big.jpg",
                        "media_type": "image",
                        "duration_sec": 4,
                        "sha256": None
                    },
                    {
                        "file_id": "img_2",
                        "filename": "plansza_2.jpg",
                        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/1280px-Camponotus_flavomarginatus_ant.jpg",
                        "media_type": "image",
                        "duration_sec": 4,
                        "sha256": None
                    },
                    {
                        "file_id": "img_3",
                        "filename": "plansza_3.jpg",
                        "url": "https://www.w3schools.com/css/img_5terre.jpg",
                        "media_type": "image",
                        "duration_sec": 4,
                        "sha256": None
                    }
                ]
            }
            with open(MOCK_MANIFEST_PATH, "w", encoding="utf-8") as f:
                json.dump(sample_manifest, f, indent=4, ensure_ascii=False)
            print(f"[AGENT] Utworzono testowy manifest: {MOCK_MANIFEST_PATH.name}")

    def fetch_remote_schedules(self) -> dict | list | None:
        if self.use_mock:
            try:
                with open(MOCK_MANIFEST_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[AGENT] Błąd odczytu manifestu: {e}")
                return None

        try:
            headers = self.auth.get_headers(include_auth=True)
            if "Authorization" not in headers:
                if not self._was_offline:
                    print("[AGENT] Brak sieci lub tokenu JWT – tryb offline (odtwarzanie z lokalnego cache SQLite).")
                    self._was_offline = True
                return None

            resp = requests.get(SYNC_ENDPOINT, headers=headers, timeout=10, verify=self.auth.verify_ssl)

            if resp.status_code == 401:
                print("[AUTH] Token JWT wygasł (401) – ponowne logowanie urządzenia...")
                headers = self.auth.get_headers(include_auth=True, force_refresh=True)
                if "Authorization" not in headers:
                    if not self._was_offline:
                        print("[AGENT] Nie udało się odnowić tokenu – tryb offline (cache SQLite).")
                        self._was_offline = True
                    return None
                resp = requests.get(SYNC_ENDPOINT, headers=headers, timeout=10, verify=self.auth.verify_ssl)

            resp.raise_for_status()
            if self._was_offline:
                print("[AGENT] Przywrócono połączenie z API – wznowiono synchronizację.")
                self._was_offline = False
            return resp.json()
        except Exception as e:
            if not self._was_offline:
                print(f"[AGENT] Brak połączenia z API ({e}) – tryb offline (odtwarzanie z lokalnego cache SQLite).")
                self._was_offline = True
            return None

    def _normalize_payload_to_schedules(self, payload: dict | list) -> list[dict] | None:
        if isinstance(payload, dict) and "items" in payload:
            return [
                {
                    "schedule_id": "mock_schedule",
                    "name": payload.get("playlist_name", "Mock"),
                    "starts_at": "1970-01-01T00:00:00+00:00",
                    "ends_at": "2099-12-31T23:59:59+00:00",
                    "playlist_id": "mock_playlist",
                    "playlist_name": payload.get("playlist_name", "Mock"),
                    "raw_items": payload["items"]
                }
            ]

        if not isinstance(payload, list):
            return None

        normalized = []
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            playlist = entry.get("playlist") or {}
            raw_items = playlist.get("items")
            if not isinstance(raw_items, list):
                continue

            sched_id = str(entry.get("id") or "")
            starts_at = entry.get("startsAt") or entry.get("starts_at")
            ends_at = entry.get("endsAt") or entry.get("ends_at")
            if not sched_id or not starts_at or not ends_at:
                continue

            sorted_items = sorted(raw_items, key=lambda x: x.get("index", 0))
            normalized.append({
                "schedule_id": sched_id,
                "name": entry.get("name") or "",
                "starts_at": starts_at,
                "ends_at": ends_at,
                "playlist_id": str(playlist.get("id") or ""),
                "playlist_name": playlist.get("name") or "",
                "raw_items": sorted_items
            })
        return normalized

    def sync_once(self):
        payload = self.fetch_remote_schedules()
        if payload is None:
            return

        schedules_raw = self._normalize_payload_to_schedules(payload)
        if schedules_raw is None:
            print(f"[AGENT] Nieoczekiwany format odpowiedzi z API: {payload}")
            return

        ready_schedules = []
        active_file_ids = set()

        for sched in schedules_raw:
            ready_items = []
            for raw_item in sched["raw_items"]:
                raw_id = (
                    raw_item.get("mediaItemId")
                    or raw_item.get("file_id")
                    or raw_item.get("id")
                )
                if raw_id is None:
                    continue

                file_id = str(raw_id)
                filename = (
                    raw_item.get("originalName")
                    or raw_item.get("filename")
                    or raw_item.get("fileName")
                    or raw_item.get("name")
                    or f"{file_id}.bin"
                )
                raw_type = (
                    raw_item.get("kind")
                    or raw_item.get("media_type")
                    or raw_item.get("mediaType")
                    or raw_item.get("contentType")
                )
                media_type = normalize_media_type(raw_type, filename)

                raw_duration = (
                    raw_item.get("durationSeconds")
                    if raw_item.get("durationSeconds") is not None
                    else raw_item.get("duration_sec")
                )
                try:
                    duration_val = int(raw_duration) if raw_duration is not None else 0
                except (TypeError, ValueError):
                    duration_val = 0
                if media_type == "image" and duration_val <= 0:
                    duration_val = 5

                item = {
                    "file_id": file_id,
                    "filename": filename,
                    "url": raw_item.get("url") or raw_item.get("downloadUrl") or f"{API_ORIGIN}/api/media/{file_id}/content",
                    "media_type": media_type,
                    "duration_sec": duration_val,
                    "sha256": raw_item.get("sha256")
                }

                if self.cache.ensure_file_cached(item):
                    ready_items.append(item)
                    active_file_ids.add(file_id)

            if ready_items:
                ready_schedules.append({
                    "schedule_id": sched["schedule_id"],
                    "name": sched["name"],
                    "starts_at": sched["starts_at"],
                    "ends_at": sched["ends_at"],
                    "playlist_id": sched["playlist_id"],
                    "playlist_name": sched["playlist_name"],
                    "items": ready_items
                })

        self.db.replace_schedules(ready_schedules)
        self.cache.cleanup_orphaned_files(active_file_ids)

    def run(self):
        print("[AGENT] Uruchomiono wątek synchronizacji harmonogramów i cache w tle.")
        while self.running:
            self.sync_once()
            time.sleep(self.interval)


class MediaPlayerEngine:

    def __init__(self, db: LocalDatabase):
        self.db = db
        self._file_loaded_event = threading.Event()
        self._eof_event = threading.Event()

        self.player = mpv.MPV(
            vo="gpu",
            gpu_context="drm",
            hwdec="no",
            ao="alsa",
            image_display_duration="inf",
            osc=False,
            keep_open="yes",
            keep_open_pause="no",
            terminal=True,
            input_terminal=True,
            msg_level="all=no"
        )

        @self.player.event_callback("file-loaded")
        def on_file_loaded(event):
            self._file_loaded_event.set()

        @self.player.property_observer("eof-reached")
        def on_eof_reached(_name, value):
            if value and self._file_loaded_event.is_set():
                self._eof_event.set()

        @self.player.on_key_press("q")
        def quit_binding():
            print("\n[PLAYER] Zamykanie agenta i odtwarzacza (klawisz 'q')...")
            os.system("stty sane")
            os._exit(0)

    def play_from_cache_loop(self):
        print("[PLAYER] Start odtwarzania z lokalnego cache SQLite. Naciśnij 'q' lub Ctrl+C, aby zakończyć.")
        waiting_logged = False
        try:
            while True:
                active_id, active_label, playlist = self.db.get_active_schedule_playlist()

                if not playlist:
                    if not waiting_logged:
                        print("[PLAYER] Brak aktywnego harmonogramu lub oczekiwanie na pobranie plików...")
                        self.player.command("stop")
                        waiting_logged = True
                    time.sleep(2)
                    continue

                waiting_logged = False
                for item in playlist:
                    current_id, _, _ = self.db.get_active_schedule_playlist()
                    if current_id != active_id:
                        break

                    file_path = Path(item["local_path"])
                    if not file_path.exists():
                        continue

                    duration = item.get("duration_sec") or 5
                    media_type = normalize_media_type(item.get("media_type"), item["filename"])

                    print(f"[PLAYER] [{active_label}] [{item['position'] + 1}/{len(playlist)}]: {item['filename']} ({media_type})")

                    self._file_loaded_event.clear()
                    self._eof_event.clear()
                    if media_type == "image":
                        self.player.vf = "lavfi=[scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2]"
                    else:
                        self.player.vf = ""
                    self.player.play(str(file_path))
                    self.player.pause = False

                    if not self._file_loaded_event.wait(timeout=5):
                        print(f"[PLAYER] Pominięto nieodpowiadający plik: {item['filename']}")
                        continue

                    if media_type == "image":
                        time.sleep(max(1, int(duration)))
                    else:
                        while not self._eof_event.wait(timeout=0.2):
                            if self.player.eof_reached or self.player.idle_active:
                                break

        except KeyboardInterrupt:
            print("\n[PLAYER] Przerwano działanie przez użytkownika (Ctrl+C).")
        finally:
            self.stop()

    def stop(self):
        os.system("stty sane")
        self.player.terminate()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VideoPresenter Raspberry Pi Agent")
    parser.add_argument("--pair-code", type=str, help="Jednorazowy kod parowania od administratora (ważny 5 min)")
    parser.add_argument("--live", action="store_true", help="Wymuś komunikację z prawdziwym VideoPresenter API zamiast mock_manifest.json")
    parser.add_argument("--insecure", action="store_true", help="Pomiń weryfikację certyfikatu SSL (dla lokalnego HTTPS self-signed)")
    args = parser.parse_args()

    use_mock_mode = USE_MOCK_API and not args.live and not args.pair_code
    auth_manager = DeviceAuthManager(CREDENTIALS_FILE, verify_ssl=not args.insecure)

    if not use_mock_mode:
        if args.pair_code:
            if not auth_manager.pair_device(args.pair_code):
                raise SystemExit("[AUTH] Parowanie zakończone niepowodzeniem.")
        elif not auth_manager.is_paired():
            code = input("Podaj 5-minutowy kod parowania (pairCode) z panelu administratora: ")
            if not auth_manager.pair_device(code):
                raise SystemExit("[AUTH] Parowanie zakończone niepowodzeniem.")

        login_status = auth_manager.login_device()
        if login_status == "unauthorized":
            print("[AUTH] Zapisane hasło urządzenia zostało odrzucone (401/403). Wymagane ponowne parowanie.")
            CREDENTIALS_FILE.unlink(missing_ok=True)
            code = input("Podaj nowy 5-minutowy kod parowania (pairCode): ")
            if not auth_manager.pair_device(code) or auth_manager.login_device() != "ok":
                raise SystemExit("[AUTH] Parowanie i logowanie zakończone niepowodzeniem.")
        elif login_status != "ok":
            print("[AUTH] Brak połączenia z API przy starcie – uruchamianie w trybie offline z lokalnego cache.")

    database = LocalDatabase(DB_PATH)
    cache_manager = CacheManager(CACHE_DIR, database, auth_manager, use_mock=use_mock_mode)

    agent = SyncAgent(database, cache_manager, auth_manager, use_mock=use_mock_mode, interval=SYNC_INTERVAL_SEC)
    agent.sync_once()
    agent.start()

    player_engine = MediaPlayerEngine(database)
    player_engine.play_from_cache_loop()