import shutil
import subprocess
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from refrain_server.config import Settings
from refrain_server.main import create_app
from refrain_server.separator import PhaseCancelSeparator


class FakeSeparator:
    """Remplace Demucs : écrit deux faux MP3 et compte les appels."""

    def __init__(self, fail: bool = False) -> None:
        self.calls = 0
        self.fail = fail

    def __call__(self, source: Path, dest_dir: Path) -> None:
        self.calls += 1
        if self.fail:
            raise RuntimeError("boum")
        (dest_dir / "vocals.mp3").write_bytes(b"voix:" + source.read_bytes())
        (dest_dir / "music.mp3").write_bytes(b"musique:" + source.read_bytes())


def wait_for(client: TestClient, song_id: str, status: str, timeout: float = 5) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        song = client.get(f"/api/songs/{song_id}").json()
        if song["status"] == status:
            return song
        time.sleep(0.02)
    raise AssertionError(f"statut {status!r} jamais atteint : {song}")


@pytest.fixture
def make_client(tmp_path):
    def make(separator):
        app = create_app(Settings(data_dir=tmp_path), separator)
        return TestClient(app)

    return make


def upload(client: TestClient, name: str = "Ma chanson.mp3", data: bytes = b"audio") -> dict:
    res = client.post("/api/songs", files={"file": (name, data, "audio/mpeg")})
    assert res.status_code == 201, res.text
    return res.json()


def test_upload_separates_and_serves_stems(make_client):
    sep = FakeSeparator()
    with make_client(sep) as client:
        song = upload(client)
        assert song["title"] == "Ma chanson"
        assert "original" not in song
        wait_for(client, song["id"], "ready")

        vocals = client.get(f"/api/songs/{song['id']}/stems/vocals")
        assert vocals.status_code == 200
        assert vocals.headers["content-type"] == "audio/mpeg"
        assert vocals.content == b"voix:audio"
        assert client.get(f"/api/songs/{song['id']}/stems/music").content == b"musique:audio"
        assert [s["id"] for s in client.get("/api/songs").json()] == [song["id"]]


def test_same_file_is_separated_only_once(make_client):
    sep = FakeSeparator()
    with make_client(sep) as client:
        first = upload(client, "a.mp3")
        wait_for(client, first["id"], "ready")
        second = upload(client, "copie.mp3")
        assert second["id"] == first["id"]
        assert second["status"] == "ready"
        assert sep.calls == 1
        assert len(client.get("/api/songs").json()) == 1


def test_failed_separation_is_reported_then_retried(make_client):
    sep = FakeSeparator(fail=True)
    with make_client(sep) as client:
        song = upload(client)
        failed = wait_for(client, song["id"], "error")
        assert failed["error"] == "boum"
        assert client.get(f"/api/songs/{song['id']}/stems/vocals").status_code == 409

        sep.fail = False
        upload(client)
        wait_for(client, song["id"], "ready")
        assert sep.calls == 2


def test_rejects_unknown_format_and_bad_ids(make_client):
    with make_client(FakeSeparator()) as client:
        res = client.post("/api/songs", files={"file": ("notes.txt", b"x", "text/plain")})
        assert res.status_code == 415
        assert client.get("/api/songs/inconnu").status_code == 404
        assert client.get("/api/songs/..%2F..%2Fetc").status_code == 404


def test_interrupted_jobs_resume_on_startup(tmp_path):
    sep = FakeSeparator()
    app = create_app(Settings(data_dir=tmp_path), sep)
    store = app.state.store
    song_dir = store.song_dir("abc123")
    song_dir.mkdir(parents=True)
    (song_dir / "original.mp3").write_bytes(b"audio")
    store.create("abc123", "Reprise", "original.mp3")
    store.update("abc123", status="processing")

    with TestClient(app) as client:
        wait_for(client, "abc123", "ready")
    assert sep.calls == 1


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg absent")
def test_demo_separator_writes_two_mp3(tmp_path):
    src = tmp_path / "tone.wav"
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
         "-ac", "2", str(src)],
        check=True,
    )
    PhaseCancelSeparator()(src, tmp_path / "out")
    assert (tmp_path / "out" / "vocals.mp3").stat().st_size > 0
    assert (tmp_path / "out" / "music.mp3").stat().st_size > 0
