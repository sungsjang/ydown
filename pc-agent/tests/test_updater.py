import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from updater import update_yt_dlp


class UpdaterTests(unittest.TestCase):
    @patch("updater.find_executable", return_value="C:/ydownauto/yt-dlp.exe")
    @patch("updater.subprocess.run")
    def test_update_uses_official_self_update(self, run, _find):
        run.return_value = subprocess.CompletedProcess([], 0, "yt-dlp is up to date", "")
        self.assertTrue(update_yt_dlp("C:/ydownauto/yt-dlp.exe", Path("C:/ydownauto")))
        self.assertEqual(run.call_args.args[0], ["C:/ydownauto/yt-dlp.exe", "-U"])

    @patch("updater.find_executable", return_value="C:/ydownauto/yt-dlp.exe")
    @patch("updater.subprocess.run", side_effect=subprocess.TimeoutExpired([], 180))
    def test_update_failure_does_not_stop_agent(self, _run, _find):
        self.assertFalse(update_yt_dlp("C:/ydownauto/yt-dlp.exe", Path("C:/ydownauto")))


if __name__ == "__main__":
    unittest.main()
