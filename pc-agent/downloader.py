from __future__ import annotations

import json
import os
import queue
import re
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable

from config import Settings
from models import DownloadJob


ProgressCallback = Callable[[int, str], bool]
PROGRESS_PREFIX = "YD_PROGRESS|"
RESULT_PREFIX = "YD_RESULT|"
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


class DownloadCancelled(RuntimeError):
    pass


class DownloadFailed(RuntimeError):
    pass


def find_executable(command: str) -> str:
    candidate = Path(command)
    if candidate.exists():
        return str(candidate.resolve())
    found = shutil.which(command)
    if found:
        return found
    raise FileNotFoundError(f"실행 파일을 찾을 수 없습니다: {command}")


def parse_progress(line: str) -> int | None:
    clean = ANSI_RE.sub("", line).strip()
    if not clean.startswith(PROGRESS_PREFIX):
        return None
    parts = clean.split("|")
    if len(parts) < 5:
        return None
    try:
        index = max(1, int(parts[1].strip() or "1"))
        total = max(index, int(parts[2].strip() or "1"))
        item_percent = max(0.0, min(100.0, float(parts[3].replace("%", "").strip())))
    except ValueError:
        return None
    return max(0, min(99, round(((index - 1) + item_percent / 100.0) / total * 100)))


def parse_result(line: str) -> Path | None:
    clean = ANSI_RE.sub("", line).strip()
    if not clean.startswith(RESULT_PREFIX):
        return None
    raw = clean[len(RESULT_PREFIX):]
    try:
        return Path(json.loads(raw))
    except (json.JSONDecodeError, TypeError):
        return None


def output_template(job: DownloadJob, output_dir: Path) -> str:
    if job.playlist_mode == "full":
        return str(output_dir / "%(playlist_title).180B" / "%(playlist_index)03d - %(title).160B [%(id)s].%(ext)s")
    return str(output_dir / "%(title).180B [%(id)s].%(ext)s")


def base_command(job: DownloadJob, settings: Settings) -> list[str]:
    command = [
        find_executable(settings.yt_dlp),
        "--newline",
        "--progress",
        "--progress-template", "download:YD_PROGRESS|%(info.playlist_index|1)s|%(info.n_entries|1)s|%(progress._percent_str)s|%(progress._eta_str)s",
        "--print", "after_move:YD_RESULT|%(filepath)j",
        "--retries", "5",
        "--fragment-retries", "5",
        "--windows-filenames",
        "--no-mtime",
    ]
    if settings.ffmpeg_location:
        command += ["--ffmpeg-location", settings.ffmpeg_location]
    if job.playlist_mode == "full":
        command += ["--yes-playlist", "--playlist-end", str(settings.max_playlist_items)]
    else:
        command.append("--no-playlist")
    return command


def build_download_command(job: DownloadJob, settings: Settings) -> list[str]:
    command = base_command(job, settings)
    template = output_template(job, settings.download_dir)
    if job.outputs == ("mp3",) or set(job.outputs) == {"mp3"}:
        command += [
            "-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0",
            "--embed-metadata", "--write-thumbnail", "--convert-thumbnails", "jpg", "--embed-thumbnail",
        ]
    else:
        command += [
            "-f", "bv*+ba/b", "--merge-output-format", "mkv", "--embed-metadata",
            "--write-thumbnail", "--convert-thumbnails", "jpg", "--embed-thumbnail",
        ]
    return command + ["-o", template, job.url]


def terminate_process_tree(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False)
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def run_streaming(command: list[str], log_file: Path, progress: ProgressCallback, stage: str) -> list[Path]:
    creationflags = 0
    kwargs: dict[str, object] = {}
    if os.name == "nt":
        creationflags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["PYTHONUTF8"] = "1"
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=creationflags,
        env=environment,
        **kwargs,
    )
    lines: queue.Queue[str | None] = queue.Queue()

    def reader() -> None:
        assert process.stdout is not None
        for output_line in process.stdout:
            lines.put(output_line.rstrip())
        lines.put(None)

    threading.Thread(target=reader, daemon=True).start()
    results: list[Path] = []
    current_percent = 0
    last_heartbeat = 0.0
    with log_file.open("a", encoding="utf-8") as log:
        log.write("\nCOMMAND: " + json.dumps(command, ensure_ascii=False) + "\n")
        while True:
            try:
                line = lines.get(timeout=1)
            except queue.Empty:
                line = ""
            if line is None:
                break
            if line:
                if not line.startswith(PROGRESS_PREFIX):
                    log.write(line + "\n")
                    log.flush()
                parsed = parse_progress(line)
                if parsed is not None:
                    current_percent = parsed
                result = parse_result(line)
                if result:
                    results.append(result)
            now = time.monotonic()
            if now - last_heartbeat >= 5 or (line and parse_progress(line) is not None):
                last_heartbeat = now
                try:
                    cancelled = progress(current_percent, stage)
                except Exception:
                    terminate_process_tree(process)
                    process.wait(timeout=15)
                    raise
                if cancelled:
                    terminate_process_tree(process)
                    process.wait(timeout=15)
                    raise DownloadCancelled("사용자가 작업을 취소했습니다.")
    return_code = process.wait()
    if return_code != 0:
        raise DownloadFailed(f"yt-dlp가 오류 코드 {return_code}로 종료되었습니다. 로그: {log_file}")
    return results


def derive_mp3(video_path: Path, settings: Settings, log_file: Path) -> Path:
    ffmpeg = find_executable(settings.ffmpeg)
    target = video_path.with_suffix(".mp3")
    temporary = video_path.with_suffix(".ydown.tmp.mp3")
    thumbnail = video_path.with_suffix(".jpg")
    command = [ffmpeg, "-y", "-i", str(video_path)]
    if thumbnail.exists():
        command += ["-i", str(thumbnail), "-map", "0:a:0", "-map", "1:v:0", "-c:v", "mjpeg", "-id3v2_version", "3", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)"]
    else:
        command += ["-map", "0:a:0", "-vn"]
    command += ["-map_metadata", "0", "-c:a", "libmp3lame", "-q:a", "0", str(temporary)]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    with log_file.open("a", encoding="utf-8") as log:
        log.write("\nFFMPEG: " + json.dumps(command, ensure_ascii=False) + "\n" + (result.stdout or "") + "\n")
    if result.returncode != 0 or not temporary.exists():
        temporary.unlink(missing_ok=True)
        raise DownloadFailed(f"MP3 변환에 실패했습니다: {video_path.name}")
    os.replace(temporary, target)
    return target


def cleanup_thumbnails(paths: list[Path]) -> None:
    for path in paths:
        for extension in (".jpg", ".jpeg", ".webp", ".png"):
            path.with_suffix(extension).unlink(missing_ok=True)


def execute_job(job: DownloadJob, settings: Settings, progress: ProgressCallback) -> list[Path]:
    log_file = settings.base_dir / "logs" / f"job-{job.id}.log"
    command = build_download_command(job, settings)
    downloaded = run_streaming(command, log_file, progress, "YouTube에서 다운로드 중")
    existing = [path.resolve() for path in downloaded if path.exists()]
    if not existing:
        raise DownloadFailed("다운로드는 종료됐지만 결과 파일을 확인하지 못했습니다.")

    results = list(existing)
    if "video" in job.outputs and "mp3" in job.outputs:
        if progress(99, "MP3 변환 중"):
            raise DownloadCancelled("사용자가 작업을 취소했습니다.")
        results.extend(derive_mp3(path, settings, log_file) for path in existing if path.suffix.lower() != ".mp3")
    cleanup_thumbnails(existing)
    return results
