import argparse
import hashlib
import json
import os
import sqlite3
import stat
import threading
import time
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

API_ORIGIN = os.getenv("RPI_API_ORIGIN", "https://localhost:5001").rstrip("/")
PAIR_ENDPOINT = f"{API_ORIGIN}/api/devices/get-credentials"
LOGIN_ENDPOINT = f"{API_ORIGIN}/api/devices/login"
SYNC_ENDPOINT = os.getenv("RPI_SYNC_URL", f"{API_ORIGIN}/api/media")

USE_MOCK_API = os.getenv("RPI_USE_MOCK", "true").lower() == "true"
SYNC_INTERVAL_SEC = 15

JWT_REFRESH_MARGIN_SEC = 13 * 60


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

    def login_device(self) -> bool:

        try:
            password = self._load_password()
            resp = requests.post(
                LOGIN_ENDPOINT,
                json={"password": password},
                timeout=10,
                verify=self.verify_ssl
            )
            resp.raise_for_status()

            token = None
            try:
                data = resp.json()
                if isinstance(data, str):
                    token = data.strip()
                elif isinstance(data, dict):

                    for key in ("token", "accessToken", "jwt", "jwtToken", "deviceToken", "Token", "access_token"):
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
                return False

            with self._lock:
                self._jwt_token = token
                self._token_expires_at = time.time() + JWT_REFRESH_MARGIN_SEC

            print("[AUTH] Pobrano nowy token JWT urządzenia (ważny 15 min).")
            return True
        except Exception as e:
            print(f"[AUTH] Błąd logowania urządzenia (/api/devices/login): {e}")
            return False

    def get_valid_token(self, force_refresh: bool = False) -> str | None:
        with self._lock:
            needs_refresh = (
                force_refresh
                or self._jwt_token is None
                or time.time() >= self._token_expires_at
            )

        if needs_refresh:
            if not self.login_device():
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
                CREATE TABLE IF NOT EXISTS playlist_items (
                    position INTEGER PRIMARY KEY,
                    file_id TEXT NOT NULL,
                    duration_sec INTEGER DEFAULT 5,
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

    def update_playlist(self, items: list[dict]):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM playlist_items")
            for idx, item in enumerate(items):
                cursor.execute("""
                    INSERT INTO playlist_items (position, file_id, duration_sec)
                    VALUES (?, ?, ?)
                """, (idx, item["file_id"], item.get("duration_sec", 5)))
            conn.commit()

    def get_active_playlist(self) -> list[dict]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT p.position, m.filename, m.local_path, m.media_type, p.duration_sec
                FROM playlist_items p
                JOIN media_files m ON p.file_id = m.file_id
                ORDER BY p.position ASC
            """)
            return [
                {
                    "position": r[0],
                    "filename": r[1],
                    "local_path": r[2],
                    "media_type": r[3],
                    "duration_sec": r[4]
                }
                for r in cursor.fetchall()
            ]

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
        media_type = item.get("media_type", "image")

        target_path = self.cache_dir / filename
        cached_record = self.db.get_cached_file(file_id)

        if cached_record and target_path.exists() and target_path.stat().st_size > 0:
            if not expected_sha256 or cached_record[2] == expected_sha256:
                return True

        print(f"[CACHE] Pobieranie nowego pliku na dysk: {filename}...")
        try:
            temp_path = target_path.with_suffix(target_path.suffix + ".part")
            is_internal_api = not self.use_mock and url.startswith(API_ORIGIN)
            headers = self.auth.get_headers(include_auth=is_internal_api)

            resp = requests.get(url, headers=headers, stream=True, timeout=15, verify=self.auth.verify_ssl)
            if resp.status_code == 401 and is_internal_api:
                resp.close()
                headers = self.auth.get_headers(include_auth=True, force_refresh=True)
                resp = requests.get(url, headers=headers, stream=True, timeout=15, verify=self.auth.verify_ssl)

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

    def fetch_remote_manifest(self) -> dict | None:
        if self.use_mock:
            try:
                with open(MOCK_MANIFEST_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[AGENT] Błąd odczytu manifestu: {e}")
                return None

        try:
            headers = self.auth.get_headers(include_auth=True)
            resp = requests.get(SYNC_ENDPOINT, headers=headers, timeout=10, verify=self.auth.verify_ssl)


            if resp.status_code == 401:
                print("[AUTH] Token JWT wygasł (401) – ponowne logowanie urządzenia...")
                headers = self.auth.get_headers(include_auth=True, force_refresh=True)
                resp = requests.get(SYNC_ENDPOINT, headers=headers, timeout=10, verify=self.auth.verify_ssl)

            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            print(f"[AGENT] Brak połączenia z API ({e}) – odtwarzanie z lokalnego cache SQLite.")
            return None

    def sync_once(self):
        manifest = self.fetch_remote_manifest()
        if not manifest or "items" not in manifest:
            return

        ready_items = []
        active_ids = set()

        for item in manifest["items"]:
            if self.cache.ensure_file_cached(item):
                ready_items.append(item)
                active_ids.add(item["file_id"])

        if ready_items:
            self.db.update_playlist(ready_items)
            self.cache.cleanup_orphaned_files(active_ids)

    def run(self):
        print("[AGENT] Uruchomiono wątek synchronizacji lokalnego cache w tle.")
        while self.running:
            self.sync_once()
            time.sleep(self.interval)


class MediaPlayerEngine:

    def __init__(self, db: LocalDatabase):
        self.db = db
        self._file_loaded_event = threading.Event()

        self.player = mpv.MPV(
            vo="gpu",
            gpu_context="drm",
            hwdec="auto-safe",
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

        @self.player.on_key_press("q")
        def quit_binding():
            print("\n[PLAYER] Zamykanie agenta i odtwarzacza (klawisz 'q')...")
            os.system("stty sane")
            os._exit(0)

    def play_from_cache_loop(self):
        print("[PLAYER] Start odtwarzania z lokalnego cache SQLite. Naciśnij 'q' lub Ctrl+C, aby zakończyć.")
        try:
            while True:
                playlist = self.db.get_active_playlist()

                if not playlist:
                    print("[PLAYER] Oczekiwanie na pobranie plików do lokalnego cache...")
                    time.sleep(2)
                    continue

                for item in playlist:
                    file_path = Path(item["local_path"])
                    if not file_path.exists():
                        continue

                    duration = item.get("duration_sec", 5)
                    media_type = item.get("media_type", "image")

                    print(f"[PLAYER] Odtwarzanie z cache [{item['position'] + 1}/{len(playlist)}]: {item['filename']} ({duration}s)")

                    self._file_loaded_event.clear()
                    self.player.play(str(file_path))
                    self.player.pause = False

                    self._file_loaded_event.wait(timeout=5)

                    if media_type == "image":
                        time.sleep(duration)
                    else:
                        self.player.wait_for_property("eof-reached", lambda eof: bool(eof))

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

        auth_manager.login_device()

    database = LocalDatabase(DB_PATH)
    cache_manager = CacheManager(CACHE_DIR, database, auth_manager, use_mock=use_mock_mode)

    agent = SyncAgent(database, cache_manager, auth_manager, use_mock=use_mock_mode, interval=SYNC_INTERVAL_SEC)
    agent.sync_once()
    agent.start()

    player_engine = MediaPlayerEngine(database)
    player_engine.play_from_cache_loop()
