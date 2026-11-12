import hashlib
import json
import os
import sqlite3
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

API_BASE_URL = os.getenv("RPI_API_URL", "http://localhost:5000/api/device/sync")
JWT_TOKEN = os.getenv("RPI_JWT_TOKEN", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_token")
USE_MOCK_API = True
SYNC_INTERVAL_SEC = 15


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

    def __init__(self, cache_dir: Path, db: LocalDatabase):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db = db

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
            headers = {"User-Agent": "Mozilla/5.0 (RaspberryPi; Linux armv7l) RPiMediaAgent/1.0"}
            if not USE_MOCK_API:
                headers["Authorization"] = f"Bearer {JWT_TOKEN}"

            with requests.get(url, headers=headers, stream=True, timeout=15) as r:
                r.raise_for_status()
                with open(temp_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=65536):
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
            print(f"[CACHE] Zapisano na stałe w lokalnym cache: {filename} (SHA-256: {actual_sha256[:12]}...)")
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

    def __init__(self, db: LocalDatabase, cache: CacheManager, interval: int = 15):
        super().__init__(daemon=True)
        self.db = db
        self.cache = cache
        self.interval = interval
        self.running = True

    def fetch_remote_manifest(self) -> dict | None:
        if USE_MOCK_API:
            try:
                with open(MOCK_MANIFEST_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[AGENT] Błąd odczytu manifestu: {e}")
                return None
        else:
            headers = {"Authorization": f"Bearer {JWT_TOKEN}"}
            try:
                resp = requests.get(API_BASE_URL, headers=headers, timeout=10)
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
    database = LocalDatabase(DB_PATH)
    cache_manager = CacheManager(CACHE_DIR, database)

    agent = SyncAgent(database, cache_manager, interval=SYNC_INTERVAL_SEC)
    agent.sync_once()
    agent.start()

    player_engine = MediaPlayerEngine(database)
    player_engine.play_from_cache_loop()