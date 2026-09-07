// Mirror of tools/lyriclib.py::parse_sections. Keep the two in step.
const SECTION_LABEL = /^\[([^\]]+)\]$/;
const TIMESTAMP = /^\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*/;
const EMPTY_SLOT = "~";

/** Lyric text -> [{label, lines}]. A null line is a deliberate empty slot ('~'). */
export function parseSections(text) {
  const sections = [];
  let cur = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = raw.trim();
    if (line === "") {
      if (cur) { sections.push(cur); cur = null; }
      continue;
    }
    if (!cur) cur = { label: null, lines: [] };
    const m = SECTION_LABEL.exec(line);
    if (m && cur.lines.length === 0 && !TIMESTAMP.test(line)) {
      cur.label = m[1];
      continue;
    }
    line = line.replace(TIMESTAMP, ""); // reserved for karaoke sync; ignored in v1
    cur.lines.push(line === EMPTY_SLOT ? null : line);
  }
  if (cur) sections.push(cur);
  return sections;
}
