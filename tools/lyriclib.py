"""Shared scanning, parsing and validation for custom-lyrics.

The load-bearing rule lives in check_alignment(): every lyric file for a song must
have the same section count and the same line count in each section, so that
position (section i, line j) means the same thing in every language.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "tools" / "registry"
LYRICS = ROOT / "lyrics"

SECTION_LABEL_RE = re.compile(r"^\[([^\]]+)\]$")
TIMESTAMP_RE = re.compile(r"^\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*")
EMPTY_SLOT = "~"
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def load_registry():
    langs = json.loads((REGISTRY / "languages.json").read_text("utf-8"))
    tags = json.loads((REGISTRY / "tags.json").read_text("utf-8"))
    allowed_tags = set(tags["tags"])
    return langs, tags, allowed_tags


# --------------------------------------------------------------------------- parsing

def parse_sections(text: str):
    """-> [{"label": str|None, "lines": [str|None]}].  None line == '~' empty slot."""
    sections, cur = [], None
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line:
            if cur:
                sections.append(cur)
                cur = None
            continue
        if cur is None:
            cur = {"label": None, "lines": []}
        m = SECTION_LABEL_RE.match(line)
        if m and not cur["lines"] and not TIMESTAMP_RE.match(line):
            cur["label"] = m.group(1)
            continue
        line = TIMESTAMP_RE.sub("", line)  # reserved for karaoke sync; ignored in v1
        cur["lines"].append(None if line == EMPTY_SLOT else line)
    if cur:
        sections.append(cur)
    return sections


def parse_filename(name: str):
    """'ru.translit.txt' -> ('ru', 'translit').  Returns None if not a lyric file."""
    if not name.endswith(".txt"):
        return None
    parts = name[:-4].split(".")
    if len(parts) == 1:
        return parts[0], None
    if len(parts) == 2:
        return parts[0], parts[1]
    return None


# --------------------------------------------------------------------------- model

@dataclass
class Song:
    id: str
    path: Path
    meta: dict
    files: list = field(default_factory=list)
    problems: list = field(default_factory=list)

    @property
    def ok(self):
        return not self.problems


def _sort_key(f, originals):
    is_orig = f["lang"] in originals
    group = (0 if is_orig else 2) + (0 if f["variant"] is None else 1)
    return (group, f["lang"], f["variant"] or "")


def discover_files(folder: Path, meta: dict, langs: dict):
    registry = langs["languages"]
    universal = langs["universal_variants"]
    originals = set(meta.get("original_languages", []))
    labels = meta.get("labels", {})
    found, problems = [], []

    for p in sorted(folder.iterdir()):
        if not p.is_file() or p.name.startswith("."):
            continue
        if p.name == "meta.json":
            continue
        parsed = parse_filename(p.name)
        if parsed is None:
            problems.append(f"{p.name}: not a recognised lyric filename (<lang>[.<variant>].txt)")
            continue
        lang, variant = parsed
        if lang not in registry:
            problems.append(f"{p.name}: unknown language '{lang}' - add it to registry/languages.json")
            continue
        entry = registry[lang]
        variants = {**entry.get("variants", {}), **universal}
        if variant is not None and variant not in variants:
            problems.append(
                f"{p.name}: '{variant}' is not a registered variant of {lang} "
                f"(have: {', '.join(sorted(variants)) or 'none'})")
            continue

        if variant is None:
            kind = "original" if lang in originals else "translation"
            label = entry.get("endonym") or entry["label"]
        else:
            kind = variants[variant].get("kind", "romanization")
            label = variants[variant]["label"]

        found.append({
            "file": p.name,
            "lang": lang,
            "variant": variant,
            "kind": kind,
            "label": labels.get(p.name, label),
            "render_lang": entry.get("render_lang", lang),
            "script": entry.get("script", "latin"),
        })

    order = meta.get("order", [])
    rank = {name: i for i, name in enumerate(order)}
    found.sort(key=lambda f: (rank.get(f["file"], len(order)), _sort_key(f, originals)))
    for name in order:
        if name not in {f["file"] for f in found}:
            problems.append(f"meta.json: 'order' lists {name}, which does not exist")
    return found, problems


# --------------------------------------------------------------------------- checks

def check_meta(song_id: str, meta: dict, allowed_tags: set, langs: dict):
    problems = []
    registry = langs["languages"]
    if meta.get("id") != song_id:
        problems.append(f"meta.json: id '{meta.get('id')}' does not match folder name '{song_id}'")
    if not ID_RE.match(song_id):
        problems.append(f"folder name '{song_id}' is not a lowercase-kebab slug")
    for required in ("title", "original_languages"):
        if not meta.get(required):
            problems.append(f"meta.json: missing required field '{required}'")
    if "tags" not in meta:
        problems.append("meta.json: missing 'tags' (an empty list is fine - most songs have none)")
    # A scaffold's blank strings sit inside non-empty containers, so emptiness
    # has to be checked one level down or a stub indexes with no title.
    if meta.get("title") and not any(v.strip() for v in meta["title"].values()):
        problems.append("meta.json: every title is blank - fill in at least one")
    if "artist" in meta and meta["artist"] and \
            not any(a.get("name", "").strip() for a in meta["artist"]):
        problems.append("meta.json: artist is present but every name is blank - "
                        "drop the field entirely if the performer is unknown")
    for lang in meta.get("original_languages", []):
        if lang not in registry:
            problems.append(f"meta.json: original_languages has unknown language '{lang}'")
    for lang in meta.get("title", {}):
        if lang not in registry:
            problems.append(f"meta.json: title has unknown language key '{lang}'")
    for tag in meta.get("tags", []):
        if tag not in allowed_tags:
            problems.append(
                f"meta.json: tag '{tag}' is not in registry/tags.json "
                f"(add it deliberately: new_song.py --add-tag {tag})")
        if tag in registry:
            problems.append(f"meta.json: '{tag}' is a language, not a tag - it comes from filenames")
    return problems


def check_stray_labels(folder: Path, files: list, parsed: dict):
    """A [Bracketed] line below the first line of a section is almost always a
    missing blank line above it. Alignment alone won't catch it when every file
    shares the mistake, so flag it directly."""
    problems = []
    for f in files:
        for i, sec in enumerate(parsed[f["file"]], start=1):
            for j, line in enumerate(sec["lines"]):
                if j and line and SECTION_LABEL_RE.match(line):
                    problems.append(
                        f"{f['file']}: section {i} line {j + 1} is '{line}' - "
                        f"section labels need a blank line above them, "
                        f"or it is read as a lyric line")
    return problems


def check_section_languages(meta: dict, files: list, parsed: dict, langs: dict):
    """section_languages names which sections switch language, so its keys must
    be real section numbers and its values registered languages the song
    actually claims to be in."""
    mapping = meta.get("section_languages")
    if not mapping:
        return []
    problems = []
    registry = langs["languages"]
    originals = meta.get("original_languages", [])
    if len(originals) < 2:
        problems.append("meta.json: section_languages needs at least two original_languages")
    ref = next((f["file"] for f in files if f["kind"] == "original"), None)
    total = len(parsed.get(ref, [])) if ref else 0
    for key, lang in mapping.items():
        if not key.isdigit() or not 1 <= int(key) <= total:
            problems.append(
                f"meta.json: section_languages has section '{key}', "
                f"but the song has {total} sections")
        if lang not in registry:
            problems.append(f"meta.json: section_languages uses unknown language '{lang}'")
        elif lang not in originals:
            problems.append(
                f"meta.json: section_languages uses '{lang}', "
                f"which is not in original_languages")
    return problems


def check_alignment(folder: Path, files: list):
    """The alignment contract. Returns (problems, parsed_by_filename)."""
    problems, parsed = [], {}
    for f in files:
        parsed[f["file"]] = parse_sections((folder / f["file"]).read_text("utf-8"))

    if not files:
        return ["no lyric files found"], parsed

    ref_name = next((f["file"] for f in files if f["kind"] == "original"), files[0]["file"])
    ref = parsed[ref_name]
    if not ref:
        problems.append(f"{ref_name}: file is empty")
        return problems, parsed

    for f in files:
        name = f["file"]
        if name == ref_name:
            continue
        got = parsed[name]
        if len(got) != len(ref):
            problems.append(
                f"{name}: has {len(got)} sections, expected {len(ref)} (from {ref_name})")
            continue
        for i, (a, b) in enumerate(zip(ref, got), start=1):
            if len(b["lines"]) != len(a["lines"]):
                problems.append(
                    f"{name}: section {i}"
                    + (f" [{a['label']}]" if a["label"] else "")
                    + f" has {len(b['lines'])} lines, expected {len(a['lines'])}")
            if a["label"] and b["label"] and a["label"] != b["label"]:
                problems.append(
                    f"{name}: section {i} labelled '{b['label']}', "
                    f"but {ref_name} calls it '{a['label']}'")
    return problems, parsed


# --------------------------------------------------------------------------- scan

def scan(lyrics_dir: Path = LYRICS):
    langs, _tags, allowed_tags = load_registry()
    songs = []
    if not lyrics_dir.exists():
        return songs, langs, [f"{lyrics_dir} does not exist"]
    globals_ = []
    for folder in sorted(p for p in lyrics_dir.iterdir() if p.is_dir()):
        if folder.name.startswith((".", "_")):
            continue
        meta_path = folder / "meta.json"
        if not meta_path.exists():
            globals_.append(f"{folder.name}/: no meta.json")
            continue
        try:
            meta = json.loads(meta_path.read_text("utf-8"))
        except json.JSONDecodeError as e:
            globals_.append(f"{folder.name}/meta.json: invalid JSON - {e}")
            continue
        song = Song(id=folder.name, path=folder, meta=meta)
        song.problems += check_meta(folder.name, meta, allowed_tags, langs)
        files, probs = discover_files(folder, meta, langs)
        song.files = files
        song.problems += probs
        align, parsed = check_alignment(folder, files)
        song.problems += align
        song.problems += check_stray_labels(folder, files, parsed)
        song.problems += check_section_languages(meta, files, parsed, langs)
        songs.append(song)
    return songs, langs, globals_


# --------------------------------------------------------------------------- index

def search_blob(song: Song, langs: dict):
    parts = [song.id, *song.meta.get("title", {}).values()]
    for a in song.meta.get("artist", []):
        parts += [a.get("name", ""), a.get("romanized", "")]
    parts.append(song.meta.get("album", ""))
    parts += song.meta.get("tags", [])
    for f in song.files:
        entry = langs["languages"][f["lang"]]
        parts += [entry["label"], entry.get("endonym", ""), f["label"]]
    return " ".join(p for p in parts if p).lower()


def display_title(song: Song):
    title = song.meta.get("title", {})
    for lang in song.meta.get("original_languages", []):
        if lang in title:
            return title[lang]
    return next(iter(title.values()), song.id)


def song_languages(song: Song):
    """Original language(s) first, then the rest in file order — so a row's
    badges lead with what the song was actually written in."""
    ordered, seen = [], set()
    for lang in song.meta.get("original_languages", []):
        if lang not in seen:
            ordered.append(lang)
            seen.add(lang)
    for f in song.files:
        if f["lang"] not in seen:
            ordered.append(f["lang"])
            seen.add(f["lang"])
    return ordered


def to_index_entry(song: Song, langs: dict):
    return {
        "id": song.id,
        "title": song.meta.get("title", {}),
        "display_title": display_title(song),
        "artist": song.meta.get("artist", []),
        "artist_separator": song.meta.get("artist_separator"),
        "section_languages": song.meta.get("section_languages"),
        "album": song.meta.get("album"),
        "year": song.meta.get("year"),
        "original_languages": song.meta.get("original_languages", []),
        "languages": song_languages(song),
        "tags": song.meta.get("tags", []),
        "notes": song.meta.get("notes"),
        "files": song.files,
        "search": search_blob(song, langs),
    }
