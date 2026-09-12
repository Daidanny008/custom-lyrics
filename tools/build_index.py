#!/usr/bin/env python3
"""Scan a lyric corpus and write an index.json for it.

A static server cannot list directories, so this manifest is the only way the
browser learns which songs and language files exist. Broken songs are skipped
rather than fatal, so one bad file never blanks the library.

Defaults to the local pair (lyrics/ + demo/); build_site.py points it at demo/
alone, which is why the corpus directories, the output path and the URL the
browser fetches lyric files from are all arguments rather than constants.

Without --corpus-url each song is pointed at ../<its own corpus dir>, which is
what lets one index serve songs from both.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lyriclib  # noqa: E402

OUT = lyriclib.ROOT / "displayer" / "data" / "index.json"
# Where the browser finds <song>/<file>.txt, relative to the app. Left unset,
# each song gets ../<its corpus dir>; the demo site overrides it, having
# flattened one corpus to a single directory beside index.html.


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lyrics", type=Path, nargs="+", default=list(lyriclib.CORPORA),
                    help="corpora to scan (default: lyrics/ and demo/)")
    ap.add_argument("--out", type=Path, default=OUT,
                    help="where to write index.json")
    ap.add_argument("--corpus-url", default=None,
                    help="override the per-song lyric path, for a flattened build")
    ap.add_argument("--notice", default=None,
                    help="a line shown above the library, e.g. to explain a demo build")
    args = ap.parse_args()

    songs, langs, globals_ = lyriclib.scan(args.lyrics)
    for g in globals_:
        print(f"  skip   {g}", file=sys.stderr)

    good = [s for s in songs if s.ok]
    for s in songs:
        if not s.ok:
            print(f"  skip   {s.id}: {len(s.problems)} problem(s) - run validate.py",
                  file=sys.stderr)

    index = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "corpus": args.corpus_url,
        "notice": args.notice,
        "languages": langs["languages"],
        "tags": json.loads((lyriclib.REGISTRY / "tags.json").read_text("utf-8"))["tags"],
        "songs": [lyriclib.to_index_entry(s, langs, args.corpus_url) for s in good],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", "utf-8")

    size = args.out.stat().st_size
    print(f"  wrote  {args.out}  "
          f"({len(good)} song{'s' if len(good) != 1 else ''}, {size:,} bytes)")
    return 0 if len(good) == len(songs) and not globals_ else 1


if __name__ == "__main__":
    sys.exit(main())
