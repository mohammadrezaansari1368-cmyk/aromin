"""Keep generated release archives out of future Git snapshots."""

from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
PATTERNS = (
    "releases/*.tgz",
    "releases/*.zip",
    "releases/*.sha256",
    "releases/*.zip.sha256",
    "releases/*.tgz.sha256",
)


class ReleaseArtifactsTests(unittest.TestCase):
    def test_archive_ignore_patterns(self):
        lines = (ROOT / ".gitignore").read_text().splitlines()
        for pattern in PATTERNS:
            with self.subTest(pattern=pattern):
                self.assertIn(pattern, lines)

    def test_no_tracked_release_archives(self):
        if shutil.which("git") is None or not (ROOT / ".git").exists():
            self.skipTest("Git checkout unavailable")
        # Worktrees have a .git file pointing at their actual Git directory.
        git_dir = subprocess.run(
            ["git", "rev-parse", "--absolute-git-dir"], cwd=ROOT,
            capture_output=True, text=True, check=False,
        )
        if git_dir.returncode or not Path(git_dir.stdout.strip()).is_dir():
            self.skipTest("Git directory unavailable")
        tracked = subprocess.run(
            ["git", "ls-files", "-z", "--", "releases"], cwd=ROOT,
            capture_output=True, text=True, check=True,
        ).stdout.split("\0")
        archives = [p for p in tracked if p.endswith((".tgz", ".zip", ".sha256"))]
        self.assertEqual([], archives, "Operator must untrack release archives")
