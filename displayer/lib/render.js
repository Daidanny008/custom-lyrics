// Model + selection -> DOM. Both modes read the same parsed model; only the loop differs.

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
    p.textContent = " ";
  } else {
    p.textContent = text;
  }
  return p;
}

// Section labels stay in the files (they anchor the alignment contract and the
// validator's error messages) but are not rendered — the gap between sections
// is the only separator on screen.
function sectionShell() {
  return el("section", "sec");
}

/** 1-2 selected: whole section in A, then whole section in B. */
function renderBySection(root, views) {
  const count = views[0].sections.length;
  for (let i = 0; i < count; i++) {
    const sec = sectionShell();
    views.forEach((view, vi) => {
      const block = el("div", "block");
      block.dataset.kind = view.kind;
      if (vi > 0) block.classList.add("sep");
      for (const line of view.sections[i].lines) block.appendChild(lineNode(view, line));
      sec.appendChild(block);
    });
    root.appendChild(sec);
  }
}

/** 3+ selected: every version of line 1 stacked, gap, line 2. */
function renderByLine(root, views) {
  const count = views[0].sections.length;
  for (let i = 0; i < count; i++) {
    const sec = sectionShell();
    const nLines = views[0].sections[i].lines.length;
    for (let j = 0; j < nLines; j++) {
      const group = el("div", "group");
      for (const view of views) group.appendChild(lineNode(view, view.sections[i].lines[j]));
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
  const resolved = resolveMode(mode);
  root.dataset.mode = resolved;
  (resolved === "section" ? renderBySection : renderByLine)(root, views);
}
