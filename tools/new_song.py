#!/usr/bin/env python3
"""Scaffold a song folder, or grow the tag vocabulary.

  new_song.py <id> --lang ru [--variants translit] [--translations en cmn-Hans]
  new_song.py --add-tag opera
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lyriclib  # noqa: E402

STUB = "[Verse 1]\nline one\nline two\n\n[Chorus]\nline one\nline two\n"


def add_tag(tag):
    path = lyriclib.REGISTRY / "tags.json"
    data = json.loads(path.read_text("utf-8"))
    if tag in data["tags"]:
        print(f"  ok     '{tag}' is already registered")
        return 0
    data["tags"].append(tag)
    data["tags"].sort()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"  added  {tag}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id", nargs="?")
    ap.add_argument("--lang", help="original language code")
    ap.add_argument("--variants", nargs="*", default=[], help="e.g. translit pinyin")
    ap.add_argument("--translations", nargs="*", default=[], help="e.g. en cmn-Hans")
    ap.add_argument("--add-tag", help="register a new tag")
    args = ap.parse_args()

    if args.add_tag:
        return add_tag(args.add_tag)
    if not args.id or not args.lang:
        ap.error("need <id> and --lang (or --add-tag)")

    langs, _t, _a = lyriclib.load_registry()
    for code in [args.lang, *args.translations]:
        if code not in langs["languages"]:
            sys.exit(f"unknown language '{code}' - add it to registry/languages.json")

    folder = lyriclib.LYRICS / args.id
    if folder.exists():
        sys.exit(f"{folder} already exists")
    folder.mkdir(parents=True)

    names = [f"{args.lang}.txt"]
    names += [f"{args.lang}.{v}.txt" for v in args.variants]
    names += [f"{t}.txt" for t in args.translations]
    for name in names:
        (folder / name).write_text(STUB, "utf-8")

    meta = {
        "id": args.id,
        "title": {args.lang: "", "en": ""},
        "artist": [{"name": "", "romanized": ""}],
        "album": "",
        "year": 0,
        "original_languages": [args.lang],
        "tags": [],
        "order": names,
        "notes": "",
    }
    (folder / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"  created  lyrics/{args.id}/  ({len(names)} lyric files + meta.json)")
    print("  next     fill in meta.json, paste the lyrics, then ./run.sh")
    return 0


if __name__ == "__main__":
    sys.exit(main())
