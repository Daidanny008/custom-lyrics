import { parseSections } from "./lib/parse.js";
import { renderLyrics, resolveMode, DEFAULT_MODE, extractSpeakers, stripSpeakers }
  from "./lib/render.js";
import { filterSongs, songRow, presentFacets, artistLine, bylineFor } from "./lib/library.js";
import * as S from "./lib/state.js";

const MODE_LABELS = {
  columns: "by column",   // whole stanza per version, side by side (default)
  line: "by line",        // every version of a line, stacked
  section: "by section",  // whole stanza per version, one after another
};

const app = document.getElementById("app");
const crumb = document.getElementById("crumb");
const backBtn = document.getElementById("back");

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const keyOf = (f) => f.file.replace(/\.txt$/, "");
const lyricCache = new Map();

let INDEX = null;

// --------------------------------------------------------------------------- boot

S.initChrome();
document.getElementById("theme").addEventListener("click", S.toggleTheme);
document.getElementById("scale-up").addEventListener("click", () => S.bumpScale(0.1));
document.getElementById("scale-down").addEventListener("click", () => S.bumpScale(-0.1));
backBtn.addEventListener("click", () => S.goLibrary("", []));

(async function boot() {
  try {
    const res = await fetch("./data/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    INDEX = await res.json();
  } catch (err) {
    app.appendChild(el("div", "fatal",
      `Could not load data/index.json (${err.message}).\n\n` +
      `Run ./run.sh — this needs a local server, and the index has to be built first. ` +
      `Opening index.html directly from the filesystem will never work: fetch() is blocked under file://.`));
    return;
  }
  window.addEventListener("hashchange", route);
  route();
})();

function route() {
  const r = S.readRoute();
  app.textContent = "";
  document.removeEventListener("keydown", songKeys);
  if (r.view === "song") renderSong(r);
  else renderLibrary(r);
}

// --------------------------------------------------------------------------- library

function renderLibrary(route) {
  backBtn.hidden = true;
  crumb.textContent = "Lyrics";
  document.title = "Lyrics";

  const frag = document.getElementById("tpl-library").content.cloneNode(true);
  app.appendChild(frag);

  const search = document.getElementById("search");
  const facets = document.getElementById("facets");
  const results = document.getElementById("results");
  const count = document.getElementById("count");

  let query = route.q || "";
  let tags = [...(route.tags || [])];
  let langs = [];
  search.value = query;

  const { tags: presentTags, languages } = presentFacets(INDEX.songs, INDEX);

  function chipRow(labelText, items, active, onToggle) {
    const row = el("div", "facet-row");
    row.appendChild(el("span", "facet-name", labelText));
    for (const [value, label, n] of items) {
      const b = el("button", "chip chip-sm", n > 1 ? `${label} ${n}` : label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(active.includes(value)));
      if (active.includes(value)) b.classList.add("on");
      b.addEventListener("click", () => onToggle(value));
      row.appendChild(b);
    }
    return row;
  }

  function drawFacets() {
    facets.textContent = "";
    if (languages.length > 1 || langs.length) {
      facets.appendChild(chipRow("language",
        languages.map(([l, n]) => [l, (INDEX.languages[l] || {}).endonym || l, n]),
        langs,
        (v) => { langs = langs.includes(v) ? langs.filter((x) => x !== v) : [...langs, v]; draw(); }));
    }
    if (presentTags.length) {
      facets.appendChild(chipRow("tag",
        presentTags.map(([v, n]) => [v, v, n]),
        tags,
        (v) => { tags = tags.includes(v) ? tags.filter((x) => x !== v) : [...tags, v]; draw(); }));
    }
  }

  function draw() {
    drawFacets();
    const matched = filterSongs(INDEX.songs, query, tags, langs);
    results.textContent = "";
    for (const song of matched) results.appendChild(songRow(song, INDEX, open));
    if (!matched.length) {
      results.appendChild(el("p", "empty-note",
        INDEX.songs.length ? "Nothing matches those filters." : "No songs indexed yet — run ./run.sh"));
    }
    count.textContent = `${matched.length} of ${INDEX.songs.length}`;
    history.replaceState(null, "",
      "#/" + (query || tags.length
        ? "?" + new URLSearchParams({ ...(query && { q: query }), ...(tags.length && { tags: tags.join(",") }) })
        : ""));
  }

  function open(id) { S.goSong(id, S.recall(id) || undefined); }

  search.addEventListener("input", () => { query = search.value; draw(); });
  draw();
  search.focus();
}

// --------------------------------------------------------------------------- song

let songCtx = null;

function defaultSelection(song) {
  const originals = song.files.filter((f) => f.kind === "original").map(keyOf);
  const firstTranslation = song.files.find((f) => f.kind === "translation");
  return firstTranslation ? [...originals, keyOf(firstTranslation)] : originals;
}

async function renderSong(route) {
  const song = INDEX.songs.find((s) => s.id === route.id);
  if (!song) {
    app.appendChild(el("div", "fatal", `No song with id "${route.id}" in the index.`));
    return;
  }
  backBtn.hidden = false;
  crumb.textContent = song.display_title;
  document.title = `${song.display_title} — Lyrics`;

  app.appendChild(document.getElementById("tpl-song").content.cloneNode(true));
  document.getElementById("title").textContent = song.display_title;

  const byline = document.getElementById("byline");
  byline.textContent = bylineFor(song);
  const named = Boolean(artistLine(song));
  const sub = [named ? song.album : null, song.year].filter(Boolean).join(" · ");
  if (sub) byline.appendChild(el("span", "byline-sub", ` — ${sub}`));
  // A traditional song may have neither performer nor source; drop the empty
  // element rather than leaving a gap under the title.
  if (!byline.textContent) byline.remove();

  const tagline = document.getElementById("tags");
  for (const t of song.tags) tagline.appendChild(el("span", "tag", `#${t}`));

  const notes = document.getElementById("notes");
  if (song.notes) notes.textContent = song.notes; else notes.remove();

  const valid = new Set(song.files.map(keyOf));
  let selected = (route.selected || S.recall(song.id) || defaultSelection(song))
    .filter((k) => valid.has(k));
  if (!selected.length) selected = defaultSelection(song);
  let mode = route.mode || DEFAULT_MODE;
  let who = Boolean(route.who);

  songCtx = { song, get selected() { return selected; }, toggle };
  document.addEventListener("keydown", songKeys);

  const chips = document.getElementById("chips");
  const modeBtn = document.getElementById("mode");
  const whoBtn = document.getElementById("who");

  function drawChips() {
    chips.textContent = "";
    song.files.forEach((f, i) => {
      const key = keyOf(f);
      const b = el("button", "chip");
      b.type = "button";
      b.dataset.kind = f.kind;
      b.setAttribute("aria-pressed", String(selected.includes(key)));
      if (selected.includes(key)) b.classList.add("on");
      b.appendChild(el("span", "chip-label", f.label));
      if (i < 9) b.appendChild(el("span", "chip-key", String(i + 1)));
      b.addEventListener("click", () => toggle(key));
      chips.appendChild(b);
    });
    modeBtn.textContent = MODE_LABELS[resolveMode(mode)];
    modeBtn.title = "Cycle: by column → by line → by section";
    whoBtn.hidden = !canAttribute;
    whoBtn.textContent = who ? "singers ✓" : "singers";
    whoBtn.classList.toggle("on", who);
    whoBtn.title = "Show who sings each line in its own column";
  }

  // Only a collaboration can have anything to attribute, and only if the
  // original actually carries "name：" labels.
  whoBtn.addEventListener("click", () => {
    who = !who;
    S.replaceSong(song.id, selected, mode, who);
    drawChips();
    draw();
  });

  modeBtn.addEventListener("click", () => {
    const order = Object.keys(MODE_LABELS);
    mode = order[(order.indexOf(resolveMode(mode)) + 1) % order.length];
    S.replaceSong(song.id, selected, mode, who);
    drawChips();
    draw();
  });

  let canAttribute = false;

  function toggle(key) {
    // Keep chip order stable regardless of click order.
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    selected = song.files.map(keyOf).filter((k) => next.has(k));
    S.remember(song.id, selected);
    S.replaceSong(song.id, selected, mode, who);
    drawChips();
    draw();
  }

  async function loadFile(f) {
    const url = `../lyrics/${song.id}/${f.file}`;
    if (!lyricCache.has(url)) {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`${f.file}: ${res.status}`);
      lyricCache.set(url, parseSections(await res.text()));
    }
    return lyricCache.get(url);
  }

  const lyrics = document.getElementById("lyrics");
  async function draw() {
    const chosen = song.files.filter((f) => selected.includes(keyOf(f)));
    try {
      let views = await Promise.all(chosen.map(async (f) => ({ ...f, sections: await loadFile(f) })));
      let speakers = null;
      const original = views.find((v) => v.kind === "original");
      if (original) {
        const found = extractSpeakers(original);
        // "X" is the collaboration separator — the artists trade lines within
        // one recording. "/" means separate recordings and "·" a fixed credit
        // list, and neither has anything to attribute line by line.
        canAttribute = Boolean(found) && song.artist_separator === "X";
        if (who && canAttribute) {
          speakers = found;
          // labels move to the column, so take them off the lyric line
          views = views.map((v) => (v === original ? stripSpeakers(v) : v));
        }
      } else {
        canAttribute = false;
      }
      drawChips();
      renderLyrics(lyrics, views, mode, speakers);
    } catch (err) {
      lyrics.textContent = "";
      lyrics.appendChild(el("div", "fatal", `Could not load a lyric file — ${err.message}`));
    }
  }

  S.replaceSong(song.id, selected, mode, who);
  drawChips();
  await draw();
}

function songKeys(e) {
  if (!songCtx || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches("input, textarea")) return;
  if (e.key === "Escape") { S.goLibrary("", []); return; }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && songCtx.song.files[n - 1]) {
    e.preventDefault();
    songCtx.toggle(songCtx.song.files[n - 1].file.replace(/\.txt$/, ""));
  }
}
