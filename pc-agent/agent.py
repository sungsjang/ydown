from __future__ import annotations

import logging
import os
import sys
import time
import threading
from pathlib import Path

from api_client import ApiClient, ApiError
from config import Settings, application_dir
from downloader import DownloadCancelled, DownloadFailed, execute_job, find_executable
from updater import update_yt_dlp
from search_worker import run_search_worker

VERSION = "1.0"


class SingleInstance:
    def __init__(self, path: Path):
        self.path = path
        self.handle = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.path.open("a+")
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise RuntimeError("YDown 에이전트가 이미 실행 중입니다.") from error
        return self

    def __exit__(self, *_args):
        if self.handle:
            self.handle.close()


def configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.FileHandler(settings.base_dir / "logs" / "agent.log", encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def run() -> int:
    settings = Settings.load()
    configure_logging(settings)
    find_executable(settings.yt_dlp)
    find_executable(settings.ffmpeg)
    find_executable(settings.ffprobe)
    update_yt_dlp(settings.yt_dlp, settings.base_dir)
    api = ApiClient(settings, VERSION)
    stop = threading.Event()
    worker = threading.Thread(target=run_search_worker, args=(ApiClient(settings, VERSION), stop), daemon=True)
    worker.start()
    try:
        return run_downloads(settings, api)
    except KeyboardInterrupt:
        logging.info("Agent stopped")
        return 0
    finally:
        stop.set()
        worker.join(timeout=30)


def run_downloads(settings: Settings, api: ApiClient) -> int:
    idle_delay = 5
    logging.info("YDown Agent %s started; downloads=%s", VERSION, settings.download_dir)

    while True:
        try:
            job = api.claim()
            if job is None:
                time.sleep(idle_delay)
                idle_delay = min(settings.idle_poll_seconds, idle_delay + 5)
                continue
            idle_delay = 5
            logging.info("Claimed job %s", job.id)

            def report(percent: int, stage: str) -> bool:
                response = api.update(
                    job.id,
                    "progress",
                    progress=percent,
                    stage=stage,
                    status="postprocessing" if "변환" in stage else "downloading",
                )
                return bool(response.get("cancel_requested"))

            try:
                files = execute_job(job, settings, report)
                api.update(job.id, "complete", result_files=[str(path) for path in files])
                logging.info("Completed job %s with %d files", job.id, len(files))
            except DownloadCancelled as error:
                api.update(job.id, "fail", error_code="cancelled", error_message=str(error))
                logging.info("Cancelled job %s", job.id)
            except (DownloadFailed, FileNotFoundError) as error:
                api.update(job.id, "fail", error_code="download_failed", error_message=str(error))
                logging.exception("Job %s failed", job.id)
            except Exception as error:
                try:
                    api.update(job.id, "fail", error_code="agent_error", error_message=str(error))
                except ApiError:
                    pass
                logging.exception("Unexpected job error: %s", job.id)
        except ApiError as error:
            logging.warning("API unavailable: %s", error)
            time.sleep(min(120, max(10, idle_delay * 2)))
            idle_delay = min(60, idle_delay * 2)
        except KeyboardInterrupt:
            logging.info("Agent stopped")
            return 0


if __name__ == "__main__":
    try:
        root = application_dir()
        with SingleInstance(root / "state" / "agent.lock"):
            raise SystemExit(run())
    except Exception as exc:
        print(f"YDown Agent error: {exc}", file=sys.stderr)
        raise SystemExit(1)
