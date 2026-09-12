from __future__ import annotations

import json
import logging
import math
import os
import re
import subprocess
import threading
import time
from pathlib import Path

from api_client import ApiClient
from downloader import find_executable, terminate_process_tree

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def normalize_results(payload: dict) -> list[dict]:
    results, seen = [], set()
    for entry in payload.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        video_id = entry.get("id")
        if not isinstance(video_id, str) or not VIDEO_ID.fullmatch(video_id) or video_id in seen:
            continue
        if entry.get("live_status") in {"is_live", "is_upcoming"}:
            continue
        seen.add(video_id)
        duration = entry.get("duration")
        results.append({
            "id": video_id,
            "title": str(entry.get("title") or video_id)[:500],
            "channel": str(entry.get("channel") or entry.get("uploader") or "")[:200],
            "duration": duration if isinstance(duration, (int, float)) and math.isfinite(duration) and duration >= 0 else None,
        })
        if len(results) == 20:
            break
    return results


def search_youtube(executable: str, query: str, base_dir: Path, stop: threading.Event, heartbeat=None) -> list[dict]:
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 200:
        raise ValueError("Invalid search query")
    command = [
        find_executable(executable), "--ignore-config", "--flat-playlist",
        "--dump-single-json", "--skip-download", "--socket-timeout", "15",
        "--retries", "1", "--extractor-retries", "1", "--", "ytsearch20:" + query.strip(),
    ]
    process = subprocess.Popen(command, cwd=base_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=os.name != "nt",
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    deadline, last_heartbeat = time.monotonic() + 90, time.monotonic()
    try:
        while True:
            if stop.is_set():
                raise InterruptedError("Search worker stopped")
            if time.monotonic() >= deadline:
                raise TimeoutError("YouTube search exceeded 90 seconds")
            if heartbeat and time.monotonic() - last_heartbeat >= 10:
                heartbeat()
                last_heartbeat = time.monotonic()
            try:
                output, error = process.communicate(timeout=1)
                break
            except subprocess.TimeoutExpired:
                continue
        if process.returncode:
            raise RuntimeError(error.decode("utf-8", errors="replace")[-1500:])
        return normalize_results(json.loads(output.decode("utf-8")))
    finally:
        if process.poll() is None:
            terminate_process_tree(process)
            process.communicate()


def run_search_worker(api: ApiClient, stop: threading.Event) -> None:
    logging.info("YouTube search worker ready")
    while not stop.is_set():
        delay = 5
        try:
            search = api.claim_search()
            if search:
                try:
                    results = search_youtube(api.settings.yt_dlp, search["query"], api.settings.base_dir, stop, api.search_heartbeat)
                    payload = {"status": "completed", "results": results}
                except InterruptedError:
                    return
                except Exception as error:
                    logging.warning("Search %s failed: %s", search["id"], error)
                    payload = {"status": "failed"}
                # Retry the same result; never create another search or download.
                for attempt in range(3):
                    try:
                        api.finish_search(search["id"], payload)
                        break
                    except Exception:
                        if attempt == 2:
                            raise
                        if stop.wait(2):
                            return
        except Exception as error:
            logging.warning("Search service unavailable: %s", error)
            delay = 30
        stop.wait(delay)
