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

function lineNode(view, text) {
  const p = el("p", "ln");
  p.dataset.kind = view.kind;
  p.dataset.script = view.script;
  p.lang = view.render_lang;
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
      const r = views.find((o) => o !== v && !used.has(o) && o.lang === v.lang &&
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

  const script = unit.base.script;
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
  p.lang = unit.base.render_lang;
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
  unit.speakers ? unit.speakers.labels[i].length
                : (unit.view || unit.base).sections[i].lines.length;

/** The first real lyric unit — never the attribution column. */
const lyricRef = (units) => units.find((u) => !u.speakers);

function appendUnitLine(parent, unit, i, j) {
  if (unit.speakers) {
    const p = el("p", "ln speaker");
    p.dataset.script = unit.speakers.script;
    p.lang = unit.speakers.lang;
    p.textContent = unit.speakers.show[i][j] ? (unit.speakers.labels[i][j] || "") : "";
    parent.appendChild(p);
    return;
  }
  if (unit.view) {
    parent.appendChild(lineNode(unit.view, unit.view.sections[i].lines[j]));
    return;
  }
  const aligned = rubyNode(unit, i, j);
  if (aligned) { parent.appendChild(aligned); return; }
  // Counts disagree on this one line — show them stacked rather than mis-aligned.
  parent.appendChild(lineNode(unit.base, unit.base.sections[i].lines[j]));
  parent.appendChild(lineNode(unit.ruby, unit.ruby.sections[i].lines[j]));
}

/** Consecutive lines of section i sung by the same person. */
function speakerRuns(speakers, i) {
  const labels = speakers.labels[i];
  const runs = [];
  labels.forEach((label, j) => {
    const last = runs[runs.length - 1];
    if (last && last.label === label) last.end = j + 1;
    else runs.push({ label, start: j, end: j + 1 });
  });
  return runs;
}

/** Whole section in A, then whole section in B. With attribution on, the
 *  section is first cut into runs by singer and each run named — a column of
 *  names beside a block says nothing about which line belongs to whom. */
function renderBySection(root, units, sectionCount) {
  const attribution = units.find((u) => u.speakers);
  const lyric = units.filter((u) => !u.speakers);
  for (let i = 0; i < sectionCount; i++) {
    const sec = el("section", "sec");
    const runs = attribution
      ? speakerRuns(attribution.speakers, i)
      : [{ label: null, start: 0, end: unitLines(lyricRef(units), i) }];
    for (const run of runs) {
      const wrap = attribution ? el("div", "run") : sec;
      if (attribution) wrap.appendChild(el("div", "run-who", run.label || ""));
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
    const lyricCols = units.filter((u) => !u.speakers).length;
    grid.style.setProperty("--cols", String(lyricCols));
    if (units.some((u) => u.speakers)) grid.dataset.who = "";
    const n = unitLines(lyricRef(units), i);
    for (let j = 0; j < n; j++) {
      for (const unit of units) {
        const cell = el("div", "cell");
        if (!unit.speakers) cell.dataset.kind = (unit.view || unit.base).kind;
        appendUnitLine(cell, unit, i, j);
        grid.appendChild(cell);
      }
    }
    sec.appendChild(grid);
    root.appendChild(sec);
  }
}

// Columns are the default; "line" and "section" are explicit opt-ins.
const MODES = { columns: renderByColumns, line: renderByLine, section: renderBySection };
export const DEFAULT_MODE = "columns";

export function resolveMode(mode) {
  return mode in MODES ? mode : DEFAULT_MODE;
}

export function renderLyrics(root, views, mode, speakers) {
  root.textContent = "";
  if (!views.length) {
    root.appendChild(el("p", "empty-note", "No versions selected — pick one above."));
    return;
  }
  const units = toUnits(views);
  if (speakers) units.unshift({ speakers });
  const sectionCount = views[0].sections.length;
  const resolved = resolveMode(mode);
  root.dataset.mode = resolved;
  root.dataset.versions = units.filter((u) => !u.speakers).length;  // ruby pair counts as one
  MODES[resolved](root, units, sectionCount);
}
