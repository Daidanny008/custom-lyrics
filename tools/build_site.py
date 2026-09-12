#!/usr/bin/env python3
"""Assemble the public demo site into _site/.

The archive proper lives in a private submodule and must never reach a public
host. This builds the same displayer against demo/ instead, so the code can be
published and shown working without publishing anyone's lyrics.

The last step re-reads what was assembled and fails the build if a song turns up
that is not in demo/ - a check worth having because the cost of getting it wrong
is a copyright takedown, not a broken page.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo"
APP = ROOT / "displayer"
NOTICE = ("A public demo of the displayer, built from demo/ - one public-domain song, "
          "so the code can be shown working without publishing a copyrighted archive. "
          "The real corpus is private.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "_site")
    args = ap.parse_args()
    out = args.out

    songs = sorted(p.name for p in DEMO.iterdir() if p.is_dir() and not p.name.startswith("."))
    if not songs:
        sys.exit(f"{DEMO} has no songs - nothing to publish")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # The app itself, minus any locally built index - the demo gets its own.
    shutil.copytree(APP, out, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("data", ".DS_Store"))
    # The corpus, as a sibling of index.html rather than of displayer/.
    shutil.copytree(DEMO, out / "lyrics", dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns(".DS_Store"))
    # Pages would otherwise run Jekyll over this and drop anything underscored.
    (out / ".nojekyll").write_text("", "utf-8")

    rc = subprocess.call([
        sys.executable, str(ROOT / "tools" / "build_index.py"),
        "--lyrics", str(DEMO),
        "--out", str(out / "data" / "index.json"),
        "--corpus-url", "./lyrics",
        "--notice", NOTICE,
    ])
    if rc != 0:
        sys.exit("demo corpus did not index cleanly - run validate.py against it")

    published = {s["id"] for s in json.loads((out / "data" / "index.json").read_text("utf-8"))["songs"]}
    leaked = published - set(songs)
    if leaked:
        sys.exit(f"refusing to publish songs not in demo/: {', '.join(sorted(leaked))}")
    on_disk = {p.name for p in (out / "lyrics").iterdir() if p.is_dir()}
    if on_disk - set(songs):
        sys.exit(f"refusing to publish lyric files not in demo/: {on_disk - set(songs)}")

    print(f"  built  {out}  ({len(published)} song{'s' if len(published) != 1 else ''}: "
          f"{', '.join(sorted(published))})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
