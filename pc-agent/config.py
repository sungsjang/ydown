from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required setting: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    api_url: str
    agent_token: str
    agent_id: str
    download_dir: Path
    yt_dlp: str
    ffmpeg: str
    ffprobe: str
    ffmpeg_location: str | None
    max_playlist_items: int
    idle_poll_seconds: int
    base_dir: Path

    @classmethod
    def load(cls, base_dir: Path | None = None) -> "Settings":
        root = (base_dir or Path(__file__).resolve().parent).resolve()
        load_dotenv(root / ".env")
        max_items = max(1, min(500, int(os.environ.get("YDOWN_MAX_PLAYLIST_ITEMS", "50"))))
        poll = max(5, min(300, int(os.environ.get("YDOWN_IDLE_POLL_SECONDS", "30"))))
        output = Path(required("YDOWN_DOWNLOAD_DIR")).expanduser().resolve()
        output.mkdir(parents=True, exist_ok=True)
        (root / "logs").mkdir(parents=True, exist_ok=True)
        (root / "state").mkdir(parents=True, exist_ok=True)
        return cls(
            api_url=required("YDOWN_API_URL").rstrip("/"),
            agent_token=required("YDOWN_AGENT_TOKEN"),
            agent_id=required("YDOWN_AGENT_ID")[:80],
            download_dir=output,
            yt_dlp=os.environ.get("YDOWN_YTDLP", "yt-dlp").strip() or "yt-dlp",
            ffmpeg=os.environ.get("YDOWN_FFMPEG", "ffmpeg").strip() or "ffmpeg",
            ffprobe=os.environ.get("YDOWN_FFPROBE", "ffprobe").strip() or "ffprobe",
            ffmpeg_location=os.environ.get("YDOWN_FFMPEG_LOCATION", "").strip() or None,
            max_playlist_items=max_items,
            idle_poll_seconds=poll,
            base_dir=root,
        )
