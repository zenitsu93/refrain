"""Bibliothèque de chansons sur disque.

Chaque chanson vit dans data/songs/<id>/ avec :
  original.<ext>  le fichier envoyé
  vocals.mp3      la voix seule
  music.mp3       tout sauf la voix
  meta.json       titre, statut, date

L'id vient du SHA-256 du fichier : renvoyer le même fichier réutilise le résultat
sans relancer Demucs.
"""

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

Status = Literal["queued", "processing", "ready", "error"]
STEMS = ("vocals", "music")


class Song(BaseModel):
    id: str
    title: str
    status: Status
    error: str | None = None
    created_at: str
    original: str


class SongStore:
    def __init__(self, root: Path) -> None:
        self.root = root / "songs"
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def song_dir(self, song_id: str) -> Path:
        return self.root / song_id

    def get(self, song_id: str) -> Song | None:
        meta = self.song_dir(song_id) / "meta.json"
        if not meta.exists():
            return None
        return Song.model_validate_json(meta.read_text("utf-8"))

    def list(self) -> list[Song]:
        songs = [s for d in self.root.iterdir() if d.is_dir() and (s := self.get(d.name))]
        return sorted(songs, key=lambda s: s.created_at, reverse=True)

    def create(self, song_id: str, title: str, original: str) -> Song:
        song = Song(
            id=song_id,
            title=title,
            status="queued",
            created_at=datetime.now(timezone.utc).isoformat(),
            original=original,
        )
        self.save(song)
        return song

    def save(self, song: Song) -> None:
        path = self.song_dir(song.id) / "meta.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        with self._lock:
            tmp.write_text(json.dumps(song.model_dump(), ensure_ascii=False, indent=2), "utf-8")
            tmp.replace(path)

    def update(self, song_id: str, **changes) -> Song:
        song = self.get(song_id)
        if song is None:
            raise KeyError(song_id)
        song = song.model_copy(update=changes)
        self.save(song)
        return song

    def stem_path(self, song_id: str, stem: str) -> Path:
        return self.song_dir(song_id) / f"{stem}.mp3"
