from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

from downloader import find_executable


def update_yt_dlp(executable: str, working_dir: Path) -> bool:
    """Ask the official yt-dlp executable to update itself on every agent start."""
    command = [find_executable(executable), "-U"]
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        result = subprocess.run(
            command,
            cwd=working_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            check=False,
            creationflags=creation_flags,
        )
    except (OSError, subprocess.SubprocessError) as error:
        logging.warning("yt-dlp update check failed; using installed version: %s", error)
        return False

    message = (result.stdout or result.stderr).strip().replace("\n", " | ")
    if result.returncode == 0:
        logging.info("yt-dlp update check: %s", message or "completed")
        return True
    logging.warning("yt-dlp update failed (exit %s); using installed version: %s", result.returncode, message)
    return False
