import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from downloader import output_template, parse_progress, parse_result
from models import DownloadJob


class DownloaderTests(unittest.TestCase):
    def test_progress_single(self):
        self.assertEqual(parse_progress("YD_PROGRESS|1|1| 42.5%|00:10"), 42)

    def test_progress_playlist(self):
        self.assertEqual(parse_progress("YD_PROGRESS|2|4|50.0%|00:10"), 38)

    def test_result_json_path(self):
        result = parse_result('YD_RESULT|"C:\\\\Downloads\\\\title [id].mkv"')
        self.assertEqual(result, Path("C:\\Downloads\\title [id].mkv"))

    def test_playlist_template(self):
        job = DownloadJob("id", "https://youtu.be/test", ("video",), "full")
        template = output_template(job, Path("C:/Downloads"))
        self.assertIn("%(playlist_index)03d", template)
        self.assertIn("%(playlist_title).180B", template)


if __name__ == "__main__":
    unittest.main()
