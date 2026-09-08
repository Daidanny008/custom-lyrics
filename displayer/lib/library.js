// Search and facet filtering over the prebuilt index.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function filterSongs(songs, query, tags, langs) {
  const q = query.trim().toLowerCase();
  return songs.filter((s) => {
    if (q && !s.search.includes(q)) return false;
    if (tags.length && !tags.every((t) => s.tags.includes(t))) return false;
    // Original language only — a song merely translated into Russian is not a
    // Russian song.
    if (langs.length && !langs.every((l) => s.original_languages.includes(l))) return false;
    return true;
  });
}

export function artistLine(song) {
  return (song.artist || [])
    .map((a) => (a.romanized && a.romanized !== a.name ? `${a.name} (${a.romanized})` : a.name))
    .join(" · ");
}

/** Artist if known, else the album or show it came from, else nothing. */
export function bylineFor(song) {
  return artistLine(song) || song.album || "";
}

export function songRow(song, index, onOpen) {
  const row = el("button", "song-row");
  row.type = "button";
  const main = el("div", "song-main");
  main.appendChild(el("div", "song-title", song.display_title));
  main.appendChild(el("div", "song-artist", bylineFor(song)));
  row.appendChild(main);

  const meta = el("div", "song-meta");
  const badges = el("div", "badges");
  for (const lang of song.languages) {
    const b = el("span", "badge", (index.languages[lang] || {}).endonym || lang);
    if (song.original_languages.includes(lang)) b.classList.add("is-original");
    badges.appendChild(b);
  }
  meta.appendChild(badges);
  if (song.tags.length) {
    // Text-only with a # so tags never read as language badges.
    const tags = el("div", "row-tags");
    for (const t of song.tags) tags.appendChild(el("span", "tag-badge", `#${t}`));
    meta.appendChild(tags);
  }
  row.appendChild(meta);

  row.addEventListener("click", () => onOpen(song.id));
  return row;
}

/** Only offer facet values that actually occur in the collection. */
export function presentFacets(songs, index) {
  const tagCounts = new Map();
  const langCounts = new Map();
  for (const s of songs) {
    for (const t of s.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    for (const l of s.original_languages) langCounts.set(l, (langCounts.get(l) || 0) + 1);
  }
  const tags = index.tags.filter((t) => tagCounts.has(t)).map((t) => [t, tagCounts.get(t)]);
  const languages = [...langCounts.entries()].sort((a, b) => b[1] - a[1]);
  return { tags, languages };
}
