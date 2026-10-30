import os
import time
from pathlib import Path
import mpv


MEDIA_DIR = Path("./sample_media")
IMAGE_DURATION_SEC = 5

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


class MediaPlayerPrototype:
    def __init__(self, image_duration: int = 5):
        
        self.player = mpv.MPV(
            vo="gpu",
            gpu_context="drm",          
            hwdec="auto-safe",
            image_display_duration=image_duration,
            osc=False,
            keep_open="no",
            background="#000000"
        )

        
      

    def get_local_playlist(self, directory: Path) -> list[Path]:
        if not directory.exists():
            directory.mkdir(parents=True, exist_ok=True)
            return []

        valid_extensions = VIDEO_EXTENSIONS.union(IMAGE_EXTENSIONS)
        files = [
            f for f in sorted(directory.iterdir())
            if f.is_file() and f.suffix.lower() in valid_extensions
        ]
        return files

    def play_loop(self, directory: Path):
        print(f"Start. Szukanie plików w: {directory.resolve()}")
        print("Naciśnij 'q' w oknie odtwarzacza lub Ctrl+C w terminalu, aby zakończyć.")

        try:
            while True:
                playlist = self.get_local_playlist(directory)

                if not playlist:
                    print("Brak plików w katalogu. Dodaj zdjęcia lub filmy do folderu 'sample_media'.")
                    time.sleep(5)
                    continue

                for media_file in playlist:
                    print(f"Odtwarzanie: {media_file.name}")
                    self.player.play(str(media_file.resolve()))
                    self.player.wait_for_playback()

        except KeyboardInterrupt:
            print("\nPrzerwano działanie przez użytkownika.")
        finally:
            self.stop()

    def stop(self):
        self.player.terminate()


if __name__ == "__main__":
    player_prototype = MediaPlayerPrototype(image_duration=IMAGE_DURATION_SEC)
    player_prototype.play_loop(MEDIA_DIR)
