import json
import subprocess
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from search_worker import normalize_results, search_youtube, run_search_worker
from models import DownloadJob


class SearchTests(unittest.TestCase):
    def test_normalize_filters_invalid_duplicate_live_and_missing_metadata(self):
        entries = [None, {"id": "../bad"}, {"id": "abcdefghijk", "title": "Test", "duration": 31},
                   {"id": "abcdefghijk"}, {"id": "12345678901", "live_status": "is_live"},
                   {"id": "ZYXWVUTSRQP", "duration": float("nan")}]
        result = normalize_results({"entries": entries})
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["duration"], 31)
        self.assertIsNone(result[1]["duration"])

    @patch("search_worker.find_executable", return_value="yt-dlp.exe")
    @patch("search_worker.subprocess.Popen")
    def test_query_is_one_argument_and_never_downloads(self, popen, _find):
        proc = MagicMock(returncode=0)
        proc.communicate.return_value = (json.dumps({"entries": []}).encode(), b"")
        proc.poll.return_value = 0
        popen.return_value = proc
        query = 'music & echo --exec malicious'
        self.assertEqual(search_youtube("yt-dlp.exe", query, Path("."), threading.Event()), [])
        command = popen.call_args.args[0]
        self.assertEqual(command[-2:], ["--", "ytsearch20:" + query])
        self.assertIn("--skip-download", command)
        self.assertIn("--ignore-config", command)

    @patch("search_worker.find_executable", return_value="yt-dlp.exe")
    @patch("search_worker.subprocess.Popen")
    @patch("search_worker.terminate_process_tree")
    def test_shutdown_kills_search_process(self, terminate, popen, _find):
        proc = MagicMock()
        proc.poll.return_value = None
        popen.return_value = proc
        stop = threading.Event()
        stop.set()
        with self.assertRaises(InterruptedError):
            search_youtube("yt-dlp.exe", "NASA", Path("."), stop)
        terminate.assert_called_once_with(proc)

    def test_result_count_is_capped(self):
        result = normalize_results({"entries": [{"id": f"{i:011d}"} for i in range(25)]})
        self.assertEqual(len(result), 20)

    @patch("search_worker.subprocess.Popen")
    def test_invalid_query_never_starts_process(self, popen):
        for query in [None, " ", "x" * 201]:
            with self.assertRaises(ValueError):
                search_youtube("yt-dlp.exe", query, Path("."), threading.Event())
        popen.assert_not_called()

    @patch("search_worker.search_youtube", return_value=[])
    def test_worker_uses_only_search_queue(self, search):
        stop, api = threading.Event(), MagicMock()
        api.claim_search.return_value = {"id": "search-id", "query": "NASA"}
        api.finish_search.side_effect = lambda *_args: stop.set()
        worker = threading.Thread(target=run_search_worker, args=(api, stop))
        worker.start()
        worker.join(timeout=3)
        self.assertFalse(worker.is_alive())
        api.finish_search.assert_called_once_with("search-id", {"status": "completed", "results": []})
        api.claim.assert_not_called()

    @patch("search_worker.search_youtube", side_effect=RuntimeError("network failure"))
    def test_failed_search_reports_failure(self, search):
        stop, api = threading.Event(), MagicMock()
        api.claim_search.return_value = {"id": "search-id", "query": "NASA"}
        api.finish_search.side_effect = lambda *_args: stop.set()
        run_search_worker(api, stop)
        api.finish_search.assert_called_once_with("search-id", {"status": "failed"})

    def test_download_rejects_arbitrary_hosts_and_credentials(self):
        for url in ["https://localhost/file", "--exec=bad", "https://youtube.com.evil.test/x", "https://user:pass@youtube.com/watch?v=abcdefghijk"]:
            with self.assertRaises(ValueError):
                DownloadJob.from_dict({"id": "job", "url": url, "outputs": ["mp3"], "playlist_mode": "single"})


if __name__ == "__main__":
    unittest.main()
