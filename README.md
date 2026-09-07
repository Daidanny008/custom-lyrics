# custom-lyrics

An offline, multilingual lyrics reader. Plain-text lyrics on disk, a dependency-free
static viewer, and one small script that stitches them together.

```bash
git clone --recurse-submodules <this repo>
./run.sh
```

Then open <http://localhost:8080/displayer/>.

> **It needs the local server.** Double-clicking `displayer/index.html` will show an
> error page and nothing else — `fetch()` is blocked under `file://`. Use `./run.sh`.

## Layout

- `lyrics/` — a git submodule pointing at the **private** `custom-lyrics-data` repo.
  One folder per song. This is where all copyrighted text lives.
- `displayer/` — the whole app. Vanilla HTML/CSS/JS, no build step, no dependencies.
- `tools/` — Python 3 scripts (stdlib only) plus the language and tag registries.

## Adding a song

```bash
python3 tools/new_song.py my-song-id --lang ru --variants translit --translations en cmn-Hans
```

Fill in `lyrics/my-song-id/meta.json`, paste the lyrics into the `.txt` files, then
`./run.sh`. Adding a translation later is just dropping a `<lang>.txt` into the folder —
the indexer discovers it.

## Tags

A song is identified by its **original language(s)**, taken from `meta.json`, and — only if
it is one — the tag `opera` or `chinese-opera`. Most songs have no tags; `"tags": []` is
normal. Register a new one deliberately with `python3 tools/new_song.py --add-tag <tag>`.

Language is never a tag. Filtering by a language returns songs *written* in it, not songs
translated into it.

## The alignment contract

Every lyric file for a song must have the **same number of sections** and the **same
number of lines in each section**. Blank line ends a section; `[Brackets]` labels one; a
lone `~` is a deliberately empty slot for when a translation collapses two source lines
into one. That makes position *(section i, line j)* mean the same thing in every language,
which is what makes line-by-line mode correct rather than approximate.

`python3 tools/validate.py` enforces it and names the exact file and section.

## Display

Select versions with the chip row (or number keys `1`–`9`). Lyrics render **line by
line** — every selected version of a line stacked together — at any number of languages.
The mode button switches to **by section** (whole stanza in one language, then the next)
if you ever want it. Selections live in the URL and are remembered per song.

Section labels like `[Chorus]` are **not displayed**. They stay in the files because they
anchor the alignment contract and make validator errors readable; on screen the blank line
between sections is the only separator.

## Working with the submodule

Editing lyrics is two commits — the data repo, then the pointer here:

```bash
cd lyrics && git add -A && git commit -m "..." && git push && cd ..
git add lyrics && git commit -m "lyrics: bump" && git push
```

`.gitmodules` points at `../custom-lyrics-data`, which resolves relative to this repo's
`origin`. Create `custom-lyrics-data` on GitHub (**private**) and push, and clones will
work. Until then the local checkout is wired to the sibling directory on disk.

See `PLAN.md` for the full design.
