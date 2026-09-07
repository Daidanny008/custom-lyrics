#!/usr/bin/env python3
"""Check every song: metadata, vocabulary, and the alignment contract."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lyriclib  # noqa: E402


def main():
    songs, _langs, globals_ = lyriclib.scan()
    for g in globals_:
        print(f"  ERROR  {g}")
    bad = [s for s in songs if not s.ok]
    for song in songs:
        if song.ok:
            n = len(song.files)
            print(f"  ok     {song.id}  ({n} file{'s' if n != 1 else ''})")
        else:
            print(f"  FAIL   {song.id}")
            for p in song.problems:
                print(f"           {p}")
    total = len(songs)
    print(f"\n{total - len(bad)}/{total} songs valid"
          + (f", {len(globals_)} folder-level errors" if globals_ else ""))
    return 1 if (bad or globals_) else 0


if __name__ == "__main__":
    sys.exit(main())
