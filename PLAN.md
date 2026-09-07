# custom-lyrics — design plan

A local, offline, multilingual lyrics reader. Plain-text lyrics on disk, a dependency-free
static viewer, and one small script that stitches them together.

Stack: vanilla HTML/CSS/JS, no framework, no npm. Python 3 only for the offline tooling.

---

## 1. Repo shape

Two repos. `custom-lyrics` holds the code and can be public; `custom-lyrics-data` holds
the copyrighted text and stays private, mounted at `lyrics/` as a git submodule.

```
custom-lyrics/                        # code repo — safe to make public
├── .gitmodules                       # pins lyrics/ -> custom-lyrics-data
├── .gitignore
├── README.md
├── PLAN.md
├── run.sh                            # validate -> build index -> serve -> open
│
├── displayer/                        # all app code
│   ├── index.html
│   ├── app.css
│   ├── app.js                        # router + wiring
│   ├── lib/
│   │   ├── parse.js                  # lyric text -> section/line model
│   │   ├── render.js                 # model + selection -> DOM
│   │   ├── library.js                # search / tag / language filtering
│   │   └── state.js                  # URL hash + localStorage
│   └── data/
│       └── index.json                # GENERATED, gitignored
│
├── tools/
│   ├── build_index.py                # scan lyrics/ -> displayer/data/index.json
│   ├── validate.py                   # schema + alignment + vocabulary checks
│   ├── new_song.py                   # scaffold a song folder
│   └── registry/
│       ├── languages.json            # the 14 language tags below
│       ├── tags.json                 # controlled tag vocabulary
│       └── meta.schema.json          # JSON Schema for editor autocomplete
│
└── lyrics/  ──▶ git submodule
```

```
custom-lyrics-data/                   # private — copyrighted text lives only here
├── README.md
├── example-mandarin-ballad/          # cmn-Hans + pinyin + en
│   ├── meta.json
│   ├── cmn-Hans.txt
│   ├── cmn-Hans.pinyin.txt
│   └── en.txt
├── example-cantonese-opera/          # yue-Hant + jyutping + cmn-Hant + en  (4 -> line mode)
├── example-hokkien-folk/             # nan-TW + tailo + en
├── example-japanese-citypop/         # ja + kana + romaji + en
├── example-ukrainian-lament/         # uk + translit + en
├── example-italian-aria/             # it + en          #opera #aria
├── example-gaelic-waulking-song/     # gd + en          #folk #work-song
└── example-latin-hymn/               # la + en          #hymn
```

The registry lives in the **code** repo: it is vocabulary and schema, not copyrighted
content, and `validate.py` needs it to run.

`.gitignore`: `displayer/data/index.json`, `.DS_Store`, `__pycache__/`, `*.pyc`, `.venv/`.

**Submodule cost, stated plainly:** clones need `--recurse-submodules`, pulls need
`git submodule update --remote`, and committing a lyric edit is two commits (data repo,
then the pointer bump in the code repo). `run.sh` will warn if the submodule is empty,
and a `make sync` target can collapse the two-commit dance into one command.

---

## 2. Languages vs. tags — two separate axes

Your list mixes three different things, and they must not share a field:

- **Language** — derived from filenames, never typed by hand as a tag.
- **Variant** — a romanization, phonetic scheme, or alternate script of a language.
- **Tag** — only what the language facet cannot express. In practice: opera-ness.

### Three corrections to the list you gave

**Japanese / romaji / kanji are not three languages.** Japanese is one language, `ja`.
Kanji is a script used *inside* the original file, not a separate file. The three files
worth having are `ja.txt` (the original as written, kanji + kana), `ja.romaji.txt`, and
`ja.kana.txt` — an all-kana reading, which is the genuinely useful third one for singing
along, since it resolves the kanji readings a romanization also resolves but keeps the
Japanese script.

**闽南语 and Taiwanese are the same language.** Taiwanese (臺語) is Taiwanese Hokkien, a
variety of Min Nan (闽南语). Both are registered below so you *can* separate mainland
Minnan material from Taiwanese when it matters, but they are `nan-Hant` and `nan-TW` —
same language, different region — not two unrelated entries.

**Opera and Chinese opera are genres, not languages.** They belong in `tags`, and they cut
across languages: Cantonese opera 粵劇 is `yue-Hant`, Taiwanese opera 歌仔戲 is `nan-TW`,
Kunqu and Peking opera are `cmn-Hant`, and Italian opera is `it`. This is exactly why the
axes stay separate — filed as a language, "chinese opera" would make it impossible to find
all your Cantonese material in one place.

### `tools/registry/languages.json`

| Code | Language | Endonym | Variants available |
|---|---|---|---|
| `en` | English | English | — |
| `cmn-Hans` | Mandarin (simplified) | 普通话 | `pinyin`, `bopomofo` |
| `cmn-Hant` | Mandarin (traditional) | 國語 | `pinyin`, `bopomofo` |
| `yue-Hant` | Cantonese | 粵語 | `jyutping`, `yale` |
| `nan-Hant` | Hokkien / Min Nan | 閩南語 | `poj`, `tailo` |
| `nan-TW` | Taiwanese Hokkien | 臺語 | `poj`, `tailo` |
| `ja` | Japanese | 日本語 | `kana`, `romaji` |
| `ru` | Russian | Русский | `translit` |
| `uk` | Ukrainian | Українська | `translit` |
| `fr` | French | Français | — |
| `it` | Italian | Italiano | — |
| `es` | Spanish | Español | — |
| `la` | Latin | Latina | — |
| `gd` | Scottish Gaelic | Gàidhlig | — |

`ipa` is a universal variant, valid on any language.

Two notes on this table:

- **Scottish Gaelic vs Irish.** If a file turns out to be Irish (`ga`) rather than Scottish
  Gaelic, the accents tell you: Gàidhlig uses grave accents leaning left (à è ì ò ù),
  Gaeilge uses acutes leaning right (á é í ó ú). Adding `ga` is a one-line registry edit.
- **`cmn`/`yue`/`nan` vs plain `zh`.** The precise codes are correct and necessary once you
  hold all three Sinitic languages, but browser font matching keys on `zh`. Each entry
  therefore carries a `render_lang` (`zh-Hans` / `zh-Hant`) that the renderer emits in the
  `lang` attribute, keeping identity precise and font selection working.

### `tools/registry/tags.json`

Deliberately tiny. A song is identified by its **original language(s)** and, if it is one,
that it is opera:

```json
{ "tags": ["opera", "chinese-opera"] }
```

Most songs carry no tags at all — an empty list is valid and normal. `validate.py` rejects
anything outside the registry, and `new_song.py --add-tag <tag>` grows it deliberately, so
the vocabulary can never fragment into `90s` / `1990s` / `nineties` by accident.

Language is not in here and never will be. The library's language facet is generated from
`original_languages`, so filtering by Русский returns songs *written* in Russian — not
songs merely translated into it. Language badges on each row still show every version a
song has, so you can see at a glance that a Russian song also has Chinese and English.

---

## 3. File naming convention

```
<lang>[.<variant>].txt
```

| Filename | lang | variant | inferred kind |
|---|---|---|---|
| `cmn-Hans.txt` | Mandarin | — | original¹ |
| `cmn-Hans.pinyin.txt` | Mandarin | pinyin | romanization |
| `yue-Hant.jyutping.txt` | Cantonese | jyutping | romanization |
| `nan-TW.tailo.txt` | Taiwanese | tailo | romanization |
| `ja.kana.txt` | Japanese | kana | alternate script |
| `ja.romaji.txt` | Japanese | romaji | romanization |
| `uk.translit.txt` | Ukrainian | translit | romanization |
| `it.ipa.txt` | Italian | ipa | phonetic |
| `en.txt` | English | — | translation¹ |
| `en.singable.txt` | English | singable | translation (variant) |

¹ `original` if the language is in `original_languages`, otherwise `translation`.

Files are **discovered by the indexer**, not listed by hand — drop a new `.txt` into the
folder and re-run the index. `meta.json` speaks up only to override a label or force the
chip order.

---

## 4. `meta.json`

```json
{
  "id": "example-cantonese-opera",
  "title": { "yue-Hant": "原題", "en": "Example Title" },
  "artist": [{ "name": "歌手名", "romanized": "Singer Name" }],
  "album": "Album Name",
  "year": 1998,
  "original_languages": ["yue-Hant"],
  "tags": ["chinese-opera"],
  "labels": { "yue-Hant.jyutping.txt": "Jyutping" },
  "order": ["yue-Hant.txt", "yue-Hant.jyutping.txt", "cmn-Hant.txt", "en.txt"],
  "notes": "free-text, shown in an info popover"
}
```

- `title` is a map so a song is findable by any of its names; the displayed title uses the
  first `original_languages` entry.
- `id` must equal the folder name (validator enforces it).
- `labels`, `order`, `notes` optional; everything else required.
- JSON over YAML/TOML: zero runtime dependency, and `meta.schema.json` gives autocomplete
  and inline validation in any modern editor. `new_song.py` writes the boilerplate so
  nobody hand-types braces.

---

## 5. Lyric file format — the load-bearing part

Plain UTF-8 text.

```
[Verse 1]
line one
line two
line three

[Chorus]
chorus line one
~
chorus line three
```

Rules:
1. A **blank line** ends a section.
2. A line in `[brackets]` at the top of a section is that section's **label**.
3. Every other line is one **lyric line**.
4. A line containing only `~` is a **deliberately empty slot** — used when a translation
   collapses two source lines into one, so the counts still line up.

**The alignment contract:** every file for a song must have the same number of sections and
the same number of lines per section. Position `(section i, line j)` therefore means the
same thing in every language — no per-line IDs, no markup, no fragile matching. And
`validate.py` reports mismatches precisely: `en.txt: section 3 has 6 lines, expected 5`.

This strictness is the price of making line-by-line mode trivial and correct. `~` is the
escape valve for the cases that don't quite fit 1:1.

Repeated choruses are written out in full; a `[Chorus x2]` shorthand would break the
line-count contract. Reserved for later, ignored by v1: a leading `[00:12.34]` timestamp on
lines of the original, for karaoke sync.

---

## 6. Screens

### Library (`#/`)

- Search over title (every script), artist (native + romanized), album, and tags, against a
  precomputed lowercase blob in the index — so typing `wang fei` finds 王菲.
- An original-language facet and (rarely) an opera tag chip, stacking with the text query.
  A facet row with only one possible value hides itself — it would filter nothing.
- Result rows show title • artist with small language badges.
- Hundreds of entries filter instantly client-side.

### Song (`#/song/<id>?v=yue-Hant,en`)

```
┌──────────────────────────────────────────────────┐
│  ←  原題 • 歌手名                             ⓘ │
│     #chinese-opera                               │
│  ┌───────────────────────────────────────────┐   │
│  │ [粵語] [Jyutping] [國語] [English] [IPA] →│   │  ← horizontal multi-select
│  └───────────────────────────────────────────┘   │
├──────────────────────────────────────────────────┤
│  [Verse 1]                                       │
│  …                                               │
└──────────────────────────────────────────────────┘
```

Chips are a horizontally scrollable toggle row, ordered original → variants of the original
→ other languages → their variants. Keys `1`–`9` toggle the nth chip. Selection lives in
the URL hash (linkable, back-button works) and is remembered per song in `localStorage`.

---

## 7. Render modes

**Line-by-line is the default at any count.** Per line position, all selected versions
stacked, then a gap. This holds whether one language is selected or five.

```
Слышу голос из прекрасного далёка,
Slyshu golos iz prekrasnogo dalyoka,
有个声音来自最美好的远处，
I hear a voice from the beautiful afar,

Голос утренний в серебряной росе.
Golos utrenniy v serebryanoy rose.
它在黎明时分含着晨露。
A morning voice in the silver dew.
```

**By section** is an explicit opt-in via the mode button: the whole section in language A,
then the whole section in B. Useful for reading one language continuously.

Both modes render from the same parsed model; only the loop order differs.

**Section labels are never displayed.** `[Verse 1]` / `[Chorus]` stay in the files — they
anchor the alignment contract and make validator errors legible (`section 3 [Chorus] has
6 lines, expected 5`) — but on screen the blank line between sections is the only
separator, and it carries that weight alone.

---

## 8. Typography

Not cosmetic — Han script, Cyrillic, IPA, and accented Latin in one column is the whole
use case.

- Every line carries a `lang` attribute (the registry's `render_lang`): correct font
  selection, line breaking, and screen-reader pronunciation.
- Role-based styling: original at full weight; romanization smaller, lighter, tighter;
  translation normal weight, slightly muted.
- Per-script font stack and line-height — Han needs more leading than Latin; IPA and
  Vietnamese-style stacked diacritics (POJ's ō͘, Gàidhlig's grave accents) need fonts that
  actually carry the glyphs, with a declared fallback chain.
- Wrapped long lines get a hanging indent so a continuation never reads as a new line.
- Dark theme default, light available; font-size and line-spacing controls, persisted.
- A print stylesheet, for booklet pages.

---

## 9. Tooling

| Command | Does |
|---|---|
| `python3 tools/new_song.py <id>` | Scaffolds a song folder with filled `meta.json` + empty original |
| `python3 tools/build_index.py` | Walks `lyrics/`, discovers files, writes `displayer/data/index.json` |
| `python3 tools/validate.py` | Schema + alignment + vocabulary checks; non-zero exit on failure |
| `./run.sh` | validate → build index → serve on :8080 → open browser |

`build_index.py` runs the validator's checks and refuses to emit a broken song, but still
indexes the rest so one bad file never blanks the library.

**Why a server at all:** `fetch()` is blocked under `file://`, so double-clicking
`index.html` gives a blank page. `run.sh` runs `python3 -m http.server` at the repo root so
both `/lyrics` and `/displayer` are reachable. Still fully offline.

**Why an index file:** a static server cannot list a directory, so the browser has no way
to discover which songs and language files exist. This is the only build step and it takes
milliseconds.

---

## 10. Build order

- **Phase 0 — skeleton.** Both repos, submodule wired, registry files, schema, and the 8
  sample songs above, chosen to cover: single language; original + romanization +
  translation; 4-file line mode; two original languages.
- **Phase 1 — tooling.** `build_index.py`, `validate.py`, `new_song.py`, `run.sh`.
  Verifiable on its own before any UI exists.
- **Phase 2 — library.** Shell, hash router, library view, search, language + tag facets.
- **Phase 3 — song view.** Fetch + parse, multi-select chips, both render modes, state.
- **Phase 4 — polish.** Typography pass, themes, keyboard, print stylesheet, error states.
- **Phase 5 — later.** Timestamp sync, section-repeat references, fuzzy search, PDF export,
  side-by-side column mode for wide screens.

---

## 11. Known risks

- **The alignment contract is the main bet.** Translations don't always map 1:1 to source
  lines. `~` slots cover most of it; if it proves too rigid, the escape hatch is optional
  explicit line IDs (`3| lyric text`) overriding positional matching — additive, not a
  rewrite.
- **Submodule friction** is real and daily. If two-commit edits become annoying, collapsing
  to one private repo is a cheap reversal.
- **`file://` will not work**, only the local server. `run.sh` and a README note are the
  answer.
- **Copyright.** The split keeps full lyric text out of the public repo, which is the point.
  If `custom-lyrics-data` is ever made public, that decision should be deliberate.
