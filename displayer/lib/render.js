// Model + selection -> DOM. Both modes read the same parsed model; only the loop differs.

// One Han character is exactly one syllable, which is what makes per-character
// alignment with a romanization possible at all.
const HAN = /[㐀-䶿一-鿿豈-﫿]/;

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

/** A Han-script original plus its own romanization becomes one ruby unit. */
function toUnits(views) {
  const used = new Set();
  const units = [];
  for (const v of views) {
    if (used.has(v)) continue;
    if (!v.variant && (v.script === "han" || v.script === "japanese")) {
      const r = views.find((o) => o !== v && !used.has(o) && o.lang === v.lang &&
        (o.kind === "romanization" || o.kind === "phonetic"));
      if (r) { used.add(v); used.add(r); units.push({ base: v, ruby: r }); continue; }
    }
    used.add(v);
    units.push({ view: v });
  }
  return units;
}

/** Returns null when this line cannot be aligned, so the caller can fall back. */
function rubyNode(unit, i, j) {
  const base = unit.base.sections[i].lines[j];
  const read = unit.ruby.sections[i].lines[j];
  if (base == null || read == null) return null;
  const syllables = read.split(/\s+/).filter(Boolean);
  const chars = [...base];
  if (chars.filter((c) => HAN.test(c)).length !== syllables.length) return null;

  const p = el("p", "ln ruby-line");
  p.dataset.kind = unit.base.kind;
  p.dataset.script = unit.base.script;
  p.lang = unit.base.render_lang;
  let k = 0;
  for (const ch of chars) {
    if (HAN.test(ch)) {
      const ruby = document.createElement("ruby");
      ruby.appendChild(document.createTextNode(ch));
      const rt = document.createElement("rt");
      rt.textContent = syllables[k++];
      ruby.appendChild(rt);
      p.appendChild(ruby);
    } else {
      p.appendChild(document.createTextNode(ch));   // spaces, punctuation
    }
  }
  return p;
}

function appendUnitLine(parent, unit, i, j) {
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

/** 1-2 selected: whole section in A, then whole section in B. */
function renderBySection(root, units, sectionCount) {
  for (let i = 0; i < sectionCount; i++) {
    const sec = el("section", "sec");
    units.forEach((unit, ui) => {
      const block = el("div", "block");
      block.dataset.kind = (unit.view || unit.base).kind;
      if (ui > 0) block.classList.add("sep");
      const n = (unit.view || unit.base).sections[i].lines.length;
      for (let j = 0; j < n; j++) appendUnitLine(block, unit, i, j);
      sec.appendChild(block);
    });
    root.appendChild(sec);
  }
}

/** 3+ selected: every version of line 1 stacked, gap, line 2. */
function renderByLine(root, units, sectionCount) {
  for (let i = 0; i < sectionCount; i++) {
    const sec = el("section", "sec");
    const n = (units[0].view || units[0].base).sections[i].lines.length;
    for (let j = 0; j < n; j++) {
      const group = el("div", "group");
      for (const unit of units) appendUnitLine(group, unit, i, j);
      sec.appendChild(group);
    }
    root.appendChild(sec);
  }
}

// Line mode at any count; "section" is an explicit opt-in.
export function resolveMode(mode) {
  return mode === "section" ? "section" : "line";
}

export function renderLyrics(root, views, mode) {
  root.textContent = "";
  if (!views.length) {
    root.appendChild(el("p", "empty-note", "No versions selected — pick one above."));
    return;
  }
  const units = toUnits(views);
  const sectionCount = views[0].sections.length;
  const resolved = resolveMode(mode);
  root.dataset.mode = resolved;
  root.dataset.versions = units.length;   // a ruby pair counts as one
  (resolved === "section" ? renderBySection : renderByLine)(root, units, sectionCount);
}
