// Hash routing + per-song persistence.
//   #/                                     library
//   #/song/<id>?v=ru,ru.translit&mode=columns  song

const LS_PREFIX = "custom-lyrics:sel:";
const LS_THEME = "custom-lyrics:theme";
const LS_SCALE = "custom-lyrics:scale";

export function readRoute() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, queryString] = hash.split("?");
  const query = new URLSearchParams(queryString || "");
  const m = /^\/song\/(.+)$/.exec(path);
  if (m) {
    return {
      view: "song",
      id: decodeURIComponent(m[1]),
      selected: query.get("v") ? query.get("v").split(",").filter(Boolean) : null,
      mode: query.get("mode") || "line",
    };
  }
  return { view: "library", q: query.get("q") || "", tags: query.get("tags") ? query.get("tags").split(",") : [] };
}

export function goSong(id, selected, mode) {
  const q = new URLSearchParams();
  if (selected && selected.length) q.set("v", selected.join(","));
  if (mode && mode !== "line") q.set("mode", mode);
  const qs = q.toString();
  location.hash = `#/song/${encodeURIComponent(id)}${qs ? "?" + qs : ""}`;
}

/** Replace the hash without pushing a history entry - for chip toggles. */
export function replaceSong(id, selected, mode) {
  const q = new URLSearchParams();
  if (selected && selected.length) q.set("v", selected.join(","));
  if (mode && mode !== "line") q.set("mode", mode);
  const qs = q.toString();
  history.replaceState(null, "", `#/song/${encodeURIComponent(id)}${qs ? "?" + qs : ""}`);
}

export function goLibrary(q, tags) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (tags && tags.length) p.set("tags", tags.join(","));
  const qs = p.toString();
  location.hash = `#/${qs ? "?" + qs : ""}`;
}

export const remember = (id, sel) => localStorage.setItem(LS_PREFIX + id, sel.join(","));
export const recall = (id) => {
  const v = localStorage.getItem(LS_PREFIX + id);
  return v ? v.split(",").filter(Boolean) : null;
};

export function initChrome() {
  const theme = localStorage.getItem(LS_THEME) || "dark";
  document.documentElement.dataset.theme = theme;
  const scale = localStorage.getItem(LS_SCALE) || "1";
  document.documentElement.style.setProperty("--scale", scale);
}
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(LS_THEME, next);
}
export function bumpScale(delta) {
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
  const next = Math.min(1.6, Math.max(0.8, +(cur + delta).toFixed(2)));
  document.documentElement.style.setProperty("--scale", String(next));
  localStorage.setItem(LS_SCALE, String(next));
}
