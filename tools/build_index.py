#!/usr/bin/env python3
"""Scan lyrics/ and write displayer/data/index.json.

A static server cannot list directories, so this manifest is the only way the
browser learns which songs and language files exist. Broken songs are skipped
rather than fatal, so one bad file never blanks the library.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lyriclib  # noqa: E402

OUT = lyriclib.ROOT / "displayer" / "data" / "index.json"


def main():
    songs, langs, globals_ = lyriclib.scan()
    for g in globals_:
        print(f"  skip   {g}", file=sys.stderr)

    good = [s for s in songs if s.ok]
    for s in songs:
        if not s.ok:
            print(f"  skip   {s.id}: {len(s.problems)} problem(s) - run validate.py",
                  file=sys.stderr)

    index = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "languages": langs["languages"],
        "tags": json.loads((lyriclib.REGISTRY / "tags.json").read_text("utf-8"))["tags"],
        "songs": [lyriclib.to_index_entry(s, langs) for s in good],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", "utf-8")

    size = OUT.stat().st_size
    print(f"  wrote  {OUT.relative_to(lyriclib.ROOT)}  "
          f"({len(good)} song{'s' if len(good) != 1 else ''}, {size:,} bytes)")
    return 0 if len(good) == len(songs) and not globals_ else 1


if __name__ == "__main__":
    sys.exit(main())
