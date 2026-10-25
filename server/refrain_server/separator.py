"""Appel de Demucs en sous-processus pour isoler la voix du reste."""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Protocol


class Separator(Protocol):
    def __call__(self, source: Path, dest_dir: Path) -> None:
        """Écrit dest_dir/vocals.mp3 et dest_dir/music.mp3 à partir de source."""


class SeparationError(RuntimeError):
    pass


class DemucsSeparator:
    def __init__(self, model: str = "htdemucs_ft", device: str = "") -> None:
        self.model = model
        self.device = device

    def __call__(self, source: Path, dest_dir: Path) -> None:
        with tempfile.TemporaryDirectory(prefix="refrain-demucs-") as tmp:
            cmd = [
                sys.executable, "-m", "demucs",
                "--two-stems", "vocals",
                "-n", self.model,
                "--mp3", "--mp3-bitrate", "256",
                "--filename", "{stem}.{ext}",
                "-o", tmp,
            ]
            if self.device:
                cmd += ["-d", self.device]
            cmd.append(str(source))

            # Sous-processus : la mémoire du modèle est rendue au système à la fin.
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode != 0:
                tail = (proc.stderr or proc.stdout).strip().splitlines()[-5:]
                raise SeparationError("Demucs a échoué : " + " | ".join(tail))

            out = Path(tmp) / self.model
            vocals, music = out / "vocals.mp3", out / "no_vocals.mp3"
            if not vocals.exists() or not music.exists():
                raise SeparationError("Demucs n'a pas produit les pistes attendues")
            dest_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(vocals, dest_dir / "vocals.mp3")
            shutil.move(music, dest_dir / "music.mp3")


class PhaseCancelSeparator:
    """Mode démo sans Demucs ni GPU : l'astuce des vieux karaokés.

    La voix est souvent au centre du mixage stéréo : gauche − droite l'efface
    (approximativement) pour la musique, et gauche + droite sert de « voix ».
    Qualité médiocre, mais suffisant pour tester l'interface. Demande ffmpeg.
    """

    def __call__(self, source: Path, dest_dir: Path) -> None:
        if shutil.which("ffmpeg") is None:
            raise SeparationError("ffmpeg est introuvable")
        dest_dir.mkdir(parents=True, exist_ok=True)
        filters = {
            "music.mp3": "pan=stereo|c0=0.5*c0-0.5*c1|c1=0.5*c1-0.5*c0",
            "vocals.mp3": "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1",
        }
        for name, af in filters.items():
            proc = subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
                 "-ac", "2", "-af", af, "-b:a", "192k", str(dest_dir / name)],
                capture_output=True, text=True,
            )
            if proc.returncode != 0:
                raise SeparationError("ffmpeg a échoué : " + proc.stderr.strip()[-300:])
