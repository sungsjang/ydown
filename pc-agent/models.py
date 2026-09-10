from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DownloadJob:
    id: str
    url: str
    outputs: tuple[str, ...]
    playlist_mode: str
    attempt_count: int = 1

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "DownloadJob":
        outputs = tuple(item for item in value.get("outputs", []) if item in {"video", "mp3"})
        if not value.get("id") or not value.get("url") or not outputs:
            raise ValueError("Server returned an invalid job")
        mode = value.get("playlist_mode")
        if mode not in {"single", "full"}:
            raise ValueError("Server returned an invalid playlist mode")
        return cls(
            id=str(value["id"]),
            url=str(value["url"]),
            outputs=outputs,
            playlist_mode=mode,
            attempt_count=int(value.get("attempt_count") or 1),
        )
