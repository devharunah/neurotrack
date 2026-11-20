"""Download the pinned HRA / Allen reference brain GLB and verify its SHA-256.

Run from the repo root:
    python tools/brain-pipeline/fetch_source.py

Reads the URL and hash from structures.json, writes to assets-src/hra/ (git-ignored), and
exits non-zero if the download does not match the pinned hash.
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DEST_DIR = ROOT / "assets-src" / "hra"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    source = json.loads((HERE / "structures.json").read_text())["source"]
    dest = DEST_DIR / Path(source["url"]).name
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        print(f"Downloading {source['url']}")
        urllib.request.urlretrieve(source["url"], dest)
    actual = sha256(dest)
    if actual != source["sha256"]:
        print(f"SHA-256 mismatch for {dest}: expected {source['sha256']}, got {actual}")
        return 1
    print(f"OK {dest} ({dest.stat().st_size} bytes, {source['license']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
