// Model + selection -> DOM. Both modes read the same parsed model; only the loop differs.

// One Han character is exactly one syllable, which is what makes per-character
// alignment with a romanization possible at all. The second range covers the
// CJK extension planes — 𪜶 and friends live there, and without it a line
// containing one would never align.
const HAN = /[㐀-䶿一-鿿豈-﫿]|[\u{20000}-\u{3134F}]/u;

// A leading "name：" on a line marks who sings it. Kept deliberately tight —
// a short prefix before a full-width colon — so it cannot swallow a lyric that
// merely contains a colon.
const SPEAKER = /^([^：:\s]{1,8})：\s*/;

/** Pull speaker labels out of a view. Returns null if it carries none.
 *  A line with no label continues the previous singer, and `show` is true only
 *  where the singer changes, so the column reads like a script rather than
 *  repeating a name down every row. */
export function extractSpeakers(view) {
  let found = false, current = null, previous = null;
  const labels = [], show = [];
  for (const sec of view.sections) {
    const secLabels = [], secShow = [];
    sec.lines.forEach((line, j) => {
      const m = line == null ? null : SPEAKER.exec(line);
      if (m) { found = true; current = m[1]; }
      secLabels.push(current);
      // Always name the singer at the top of a stanza, even when it carried
      // over — otherwise a stanza can open with a blank attribution.
      secShow.push(j === 0 || current !== previous);
      previous = current;
    });
    labels.push(secLabels);
    show.push(secShow);
  }
  // The script drives line-height, so the column must share the base's to
  // sit on the same line rather than riding above it.
  return found ? { labels, show, script: view.script, lang: view.render_lang } : null;
}

/** Per-line language labels from a 1-based section -> language map. A song
 *  that switches language mid-text has one file, so the column has to come
 *  from metadata rather than from anything marked up in the text. */
export function sectionLanguages(view, mapping, fallback, infoOf) {
  if (!mapping) return null;
  const labels = [], show = [], meta = [];
  let previous = null;
  view.sections.forEach((sec, i) => {
    // A section is either one language, or a line-number -> language map for
    // a stanza that switches partway through.
    const entry = mapping[String(i + 1)];
    const perLine = entry && typeof entry === "object";
    const secLabels = [], secShow = [], secMeta = [];
    sec.lines.forEach((_, j) => {
      const info = infoOf(
        (perLine ? entry[String(j + 1)] : entry) || fallback);
      secLabels.push(info.label);
      secMeta.push(info);
      secShow.push(j === 0 || info.label !== previous);
      previous = info.label;
    });
    labels.push(secLabels); show.push(secShow); meta.push(secMeta);
  });
  return { labels, show, meta, script: view.script, lang: view.render_lang };
}

/** Script and language for section i. A file named for one language may hold
 *  sections in another, and those must not be drawn with the file's font. */
export function scriptOf(view, i, j) {
  const m = view.sectionMeta && view.sectionMeta[i] && view.sectionMeta[i][j];
  return m ? { script: m.script, lang: m.render_lang }
           : { script: view.script, lang: view.render_lang };
}

/** The label now lives in its own column, so take it off the lyric line. */
export function stripSpeakers(view) {
  return {
    ...view,
    sections: view.sections.map((sec) => ({
      ...sec,
      lines: sec.lines.map((l) => (l == null ? l : l.replace(SPEAKER, ""))),
    })),
  };
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function lineNode(view, text, i, j) {
  const p = el("p", "ln");
  const { script, lang } = scriptOf(view, i, j);
  p.dataset.kind = view.kind;
  p.dataset.script = script;
  p.lang = lang;
  if (text == null) {
    p.classList.add("slot");        // deliberate empty slot ('~')
    p.textContent = " ";
  } else {
    p.textContent = text;
  }
  return p;
}

/** An original plus its own romanization becomes one ruby unit. */
function toUnits(views) {
  const used = new Set();
  const units = [];
  for (const v of views) {
    if (used.has(v)) continue;
    if (!v.variant) {
      // A bilingual file is named for one language but holds sections in
      // another, so its romanization will not share the file's language code.
      const covers = (code) => code === v.lang ||
        Boolean(v.sectionMeta && v.sectionMeta.some((sec) => sec.some((m) => m.code === code)));
      const r = views.find((o) => o !== v && !used.has(o) && covers(o.lang) &&
        (o.kind === "romanization" || o.kind === "phonetic"));
      if (r) { used.add(v); used.add(r); units.push({ base: v, ruby: r }); continue; }
    }
    used.add(v);
    units.push({ view: v });
  }
  return units;
}

/** Split a Han line into render units. A unit with `column: true` gets one
 *  reading; anything else is passed through as plain text.
 *
 *  Hokkien writes some characters that Unicode only encodes outside the common
 *  planes — and that no installed font draws — as their two components in
 *  parentheses, e.g. (亻因) for the single syllable "in". So a parenthesised
 *  pair of Han characters may be one column, not two. */
function charUnits(base, collapsePairs) {
  const chars = [...base];
  const units = [];
  for (let i = 0; i < chars.length; i++) {
    if (collapsePairs && chars[i] === "(" && chars[i + 3] === ")" &&
        HAN.test(chars[i + 1] || "") && HAN.test(chars[i + 2] || "")) {
      units.push({ text: chars.slice(i, i + 4).join(""), column: true });
      i += 3;
      continue;
    }
    units.push({ text: chars[i], column: HAN.test(chars[i]) });
  }
  return units;
}

/** Returns null when this line cannot be aligned, so the caller can fall back.
 *  Han and Japanese align one column per character; every other script aligns
 *  one column per whitespace-separated word. */
function rubyNode(unit, i, j) {
  const base = unit.base.sections[i].lines[j];
  const read = unit.ruby.sections[i].lines[j];
  if (base == null || read == null) return null;

  const { script, lang } = scriptOf(unit.base, i, j);
  const charwise = script === "han" || script === "japanese";
  // Character alignment needs one reading per character, but romanizations
  // group syllables into words — Tâi-lô's tshù-lāi is two characters. So split
  // the reading on hyphens and punctuation too, not just spaces. The base line
  // keeps its own punctuation; only the reading is tokenized this way.
  const readings = (charwise ? read.split(/[\s\-–—,.:;!?()]+/) : read.split(/\s+/))
    .filter(Boolean);

  let units;
  if (charwise) {
    // Straight one-character-per-reading first; only if that does not add up
    // do we try collapsing parenthesised pairs. Either way the counts must
    // match exactly, so this can never silently mis-align a line.
    units = charUnits(base, false);
    if (units.filter((u) => u.column).length !== readings.length) {
      units = charUnits(base, true);
    }
  } else {
    units = base.split(/\s+/).filter(Boolean).map((t) => ({ text: t, column: true }));
  }
  if (units.filter((u) => u.column).length !== readings.length) return null;

  const p = el("p", "ln ruby-line");
  p.dataset.kind = unit.base.kind;
  p.dataset.script = script;
  p.dataset.align = charwise ? "char" : "word";
  p.lang = lang;
  let k = 0;
  for (const u of units) {
    if (!u.column) {
      p.appendChild(document.createTextNode(u.text));   // spaces, punctuation
      continue;
    }
    // <ruby>/<rt> keeps the markup meaningful, but the base sits in its own
    // <span> so CSS can stack and left-align the two independently —
    // ruby-align has poor browser support.
    const ruby = document.createElement("ruby");
    ruby.appendChild(el("span", "rb", u.text));
    const rt = document.createElement("rt");
    rt.textContent = readings[k++];
    ruby.appendChild(rt);
    p.appendChild(ruby);
  }
  return p;
}

/** How many lines a unit holds in section i. The attribution unit carries no
 *  view of its own, so it reports the shape it was built from. */
const unitLines = (unit, i) =>
  unit.attr ? unit.attr.labels[i].length
                : (unit.view || unit.base).sections[i].lines.length;

/** The first real lyric unit — never the attribution column. */
const lyricRef = (units) => units.find((u) => !u.attr);

function appendUnitLine(parent, unit, i, j) {
  if (unit.attr) {
    const p = el("p", "ln speaker");
    const m = unit.attr.meta && unit.attr.meta[i] && unit.attr.meta[i][j];
    p.dataset.script = m ? m.script : unit.attr.script;
    p.lang = m ? m.render_lang : unit.attr.lang;
    p.textContent = unit.attr.show[i][j] ? (unit.attr.labels[i][j] || "") : "";
    parent.appendChild(p);
    return;
  }
  if (unit.view) {
    parent.appendChild(lineNode(unit.view, unit.view.sections[i].lines[j], i, j));
    return;
  }
  const aligned = rubyNode(unit, i, j);
  if (aligned) { parent.appendChild(aligned); return; }
  parent.appendChild(lineNode(unit.base, unit.base.sections[i].lines[j], i, j));
  // A '~' reading means this line has no romanization at all — in a partly
  // romanised song most lines do not. Stacking a blank under each would pad
  // the whole song out.
  if (unit.ruby.sections[i].lines[j] != null) {
    parent.appendChild(lineNode(unit.ruby, unit.ruby.sections[i].lines[j], i, j));
  }
}

/** Consecutive lines of section i sharing every attribution value. With both
 *  a singer and a language column, a run ends when either changes. */
function attributionRuns(attrs, i, lineCount) {
  const runs = [];
  for (let j = 0; j < lineCount; j++) {
    const key = attrs.map((a) => a.labels[i][j] || "").join("\u0000");
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.end = j + 1;
    else runs.push({ key, label: attrs.map((a) => a.labels[i][j]).filter(Boolean).join(" · "),
                     start: j, end: j + 1 });
  }
  return runs;
}

/** Whole section in A, then whole section in B. With attribution on, the
 *  section is first cut into runs by singer and each run named — a column of
 *  names beside a block says nothing about which line belongs to whom. */
function renderBySection(root, units, sectionCount) {
  const attrs = units.filter((u) => u.attr).map((u) => u.attr);
  const lyric = units.filter((u) => !u.attr);
  const attribution = attrs.length > 0;
  for (let i = 0; i < sectionCount; i++) {
    const sec = el("section", "sec");
    const n = unitLines(lyricRef(units), i);
    const runs = attribution
      ? attributionRuns(attrs, i, n)
      : [{ label: null, start: 0, end: n }];
    for (const run of runs) {
      const wrap = attribution ? el("div", "run") : sec;
      if (attribution) {
        // Same element treatment as the attribution column, so a name reads
        // the same whichever mode it is shown in.
        const who = el("div", "ln speaker run-who", run.label || "");
        // Only the language attribution carries per-line meta; a singer column
        // has one script for the whole song. Fall back to it, as the column
        // renderer does, or the name loses its face entirely.
        const m = attrs[0].meta && attrs[0].meta[i] && attrs[0].meta[i][run.start];
        who.dataset.script = m ? m.script : attrs[0].script;
        who.lang = m ? m.render_lang : attrs[0].lang;
        wrap.appendChild(who);
      }
      lyric.forEach((unit, ui) => {
        const block = el("div", "block");
        block.dataset.kind = (unit.view || unit.base).kind;
        if (ui > 0) block.classList.add("sep");
        for (let j = run.start; j < run.end; j++) appendUnitLine(block, unit, i, j);
        wrap.appendChild(block);
      });
      if (attribution) sec.appendChild(wrap);
    }
    root.appendChild(sec);
  }
}

/** 3+ selected: every version of line 1 stacked, gap, line 2. */
function renderByLine(root, units, sectionCount) {
  for (let i = 0; i < sectionCount; i++) {
    const sec = el("section", "sec");
    const n = unitLines(lyricRef(units), i);
    for (let j = 0; j < n; j++) {
      const group = el("div", "group");
      for (const unit of units) appendUnitLine(group, unit, i, j);
      sec.appendChild(group);
    }
    root.appendChild(sec);
  }
}

/** Stanzas stay whole and the versions sit side by side, one column each.
 *  Cells are placed row by row into one grid rather than stacked per column,
 *  so line j of every version shares a grid row and stays level even when the
 *  versions wrap to different heights. */
function renderByColumns(root, units, sectionCount) {
  for (let i = 0; i < sectionCount; i++) {
    const sec = el("section", "sec");
    const grid = el("div", "cols");
    const attrCols = units.filter((u) => u.attr).length;
    grid.style.setProperty("--cols", String(units.length - attrCols));
    if (attrCols) {
      grid.style.setProperty("--who-n", String(attrCols));
      grid.dataset.who = "";
    }
    const n = unitLines(lyricRef(units), i);
    for (let j = 0; j < n; j++) {
      for (const unit of units) {
        const cell = el("div", "cell");
        if (!unit.attr) cell.dataset.kind = (unit.view || unit.base).kind;
        appendUnitLine(cell, unit, i, j);
        grid.appendChild(cell);
      }
    }
    sec.appendChild(grid);
    root.appendChild(sec);
  }
}

// "beside" is the default; the other two are explicit opt-ins. The names say what
// the reader sees rather than how it is laid out, and "beside"/"stacked" name the
// axis that separates them - both show a whole stanza per version, one across and
// one down.
const MODES = { beside: renderByColumns, interleaved: renderByLine, stacked: renderBySection };
export const DEFAULT_MODE = "beside";

// What those keys used to be. A ?mode= link written before the rename still lands
// where it meant to, which costs one lookup and saves every shared URL.
const LEGACY_MODES = { columns: "beside", line: "interleaved", section: "stacked" };

export function resolveMode(mode) {
  if (mode in MODES) return mode;
  return LEGACY_MODES[mode] || DEFAULT_MODE;
}

export function renderLyrics(root, views, mode, attributions = []) {
  root.textContent = "";
  if (!views.length) {
    root.appendChild(el("p", "empty-note", "No versions selected — pick one above."));
    return;
  }
  const units = toUnits(views);
  for (const attr of [...attributions].reverse()) units.unshift({ attr });
  const sectionCount = views[0].sections.length;
  const resolved = resolveMode(mode);
  root.dataset.mode = resolved;
  root.dataset.versions = units.filter((u) => !u.attr).length;  // ruby pair counts as one
  MODES[resolved](root, units, sectionCount);

  // Each stanza is its own grid, so a max-content attribution track sizes to
  // that stanza's widest name — a two-character singer pushes only its own
  // stanza's lyrics right. Measure the widest across the whole song and pin
  // every track to it so the lyric columns line up down the page.
  if (attributions.length && resolved === "beside") {
    let widest = 0;
    for (const grid of root.querySelectorAll(".cols[data-who]")) {
      widest = Math.max(widest, grid.children[0].getBoundingClientRect().width);
    }
    root.style.setProperty("--who-w", `${Math.ceil(widest)}px`);
  } else {
    root.style.removeProperty("--who-w");
  }
}
