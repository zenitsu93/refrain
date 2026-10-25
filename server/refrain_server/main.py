"""API HTTP de Refrain.

  POST /api/songs                    envoie un fichier audio, lance la séparation
  GET  /api/songs                    liste les chansons et leur statut
  GET  /api/songs/{id}               statut d'une chanson
  GET  /api/songs/{id}/stems/{stem}  piste séparée (vocals ou music), en MP3
"""

import hashlib
import logging
import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import Settings
from .separator import DemucsSeparator, PhaseCancelSeparator, Separator
from .store import STEMS, Song, SongStore

log = logging.getLogger("refrain")

ID_LENGTH = 16
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".webm"}


def public(song: Song) -> dict:
    return song.model_dump(exclude={"original"})


def create_app(settings: Settings | None = None, separator: Separator | None = None) -> FastAPI:
    settings = settings or Settings()
    if separator is None:
        if settings.separator == "demo":
            separator = PhaseCancelSeparator()
        else:
            separator = DemucsSeparator(settings.demucs_model, settings.demucs_device)
    store = SongStore(settings.data_dir)
    # Un seul travail à la fois : Demucs utilise déjà tout le GPU ou tous les cœurs.
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="demucs")

    def separate(song_id: str) -> None:
        song = store.get(song_id)
        if song is None:
            return
        store.update(song_id, status="processing", error=None)
        log.info("Séparation de %s (%s)", song.title, song_id)
        try:
            separator(store.song_dir(song_id) / song.original, store.song_dir(song_id))
        except Exception as exc:  # noqa: BLE001 : on garde l'erreur pour l'afficher
            log.exception("Échec de la séparation de %s", song_id)
            store.update(song_id, status="error", error=str(exc))
        else:
            store.update(song_id, status="ready")
            log.info("Pistes prêtes pour %s", song_id)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # Reprend les travaux interrompus par un redémarrage du serveur.
        for song in store.list():
            if song.status in ("queued", "processing"):
                store.update(song.id, status="queued")
                executor.submit(separate, song.id)
        yield
        executor.shutdown(wait=False, cancel_futures=True)

    app = FastAPI(title="Refrain", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.store = store
    app.state.executor = executor

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "model": settings.demucs_model}

    @app.get("/api/songs")
    def list_songs() -> list[dict]:
        return [public(s) for s in store.list()]

    @app.get("/api/songs/{song_id}")
    def get_song(song_id: str) -> dict:
        return public(_require(store, song_id))

    @app.post("/api/songs", status_code=201)
    def upload_song(file: UploadFile) -> dict:
        name = Path(file.filename or "chanson")
        ext = name.suffix.lower()
        if ext not in AUDIO_EXTENSIONS:
            raise HTTPException(415, f"Format non pris en charge : {ext or 'inconnu'}")

        # Copie dans un fichier temporaire en calculant l'empreinte au passage.
        digest = hashlib.sha256()
        with tempfile.NamedTemporaryFile(dir=store.root, delete=False, suffix=ext) as tmp:
            while chunk := file.file.read(1 << 20):
                digest.update(chunk)
                tmp.write(chunk)
        tmp_path = Path(tmp.name)
        song_id = digest.hexdigest()[:ID_LENGTH]

        existing = store.get(song_id)
        if existing is not None:
            tmp_path.unlink(missing_ok=True)
            # Déjà séparée (ou en cours) : on ne relance pas Demucs.
            if existing.status == "error":
                store.update(song_id, status="queued", error=None)
                executor.submit(separate, song_id)
                existing = store.get(song_id)
            return public(existing)

        original = f"original{ext}"
        store.song_dir(song_id).mkdir(parents=True, exist_ok=True)
        shutil.move(tmp_path, store.song_dir(song_id) / original)
        song = store.create(song_id, title=name.stem, original=original)
        executor.submit(separate, song_id)
        return public(song)

    @app.get("/api/songs/{song_id}/stems/{stem}")
    def get_stem(song_id: str, stem: str) -> FileResponse:
        song = _require(store, song_id)
        if stem not in STEMS:
            raise HTTPException(404, "Piste inconnue")
        if song.status != "ready":
            raise HTTPException(409, "Les pistes ne sont pas encore prêtes")
        return FileResponse(
            store.stem_path(song_id, stem),
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    return app


def _require(store: SongStore, song_id: str) -> Song:
    song = store.get(song_id) if song_id.isalnum() else None
    if song is None:
        raise HTTPException(404, "Chanson introuvable")
    return song


app = create_app()
