import os
from dataclasses import dataclass, field
from pathlib import Path


def _origins() -> list[str]:
    raw = os.environ.get("REFRAIN_CORS_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


@dataclass
class Settings:
    # Dossier où sont rangés les fichiers originaux, les pistes séparées et le cache.
    data_dir: Path = field(
        default_factory=lambda: Path(
            os.environ.get("REFRAIN_DATA_DIR", Path(__file__).resolve().parent.parent / "data")
        )
    )
    # htdemucs_ft : meilleure qualité, ~4x plus lent que htdemucs. Sur CPU, htdemucs suffit pour tester.
    demucs_model: str = field(default_factory=lambda: os.environ.get("REFRAIN_DEMUCS_MODEL", "htdemucs_ft"))
    # "cuda", "mps" ou "cpu". Vide = choix automatique de Demucs.
    demucs_device: str = field(default_factory=lambda: os.environ.get("REFRAIN_DEMUCS_DEVICE", ""))
    # "demucs" (par défaut) ou "demo" pour tester l'interface sans Demucs.
    separator: str = field(default_factory=lambda: os.environ.get("REFRAIN_SEPARATOR", "demucs"))
    cors_origins: list[str] = field(default_factory=_origins)
