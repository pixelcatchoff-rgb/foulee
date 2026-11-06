// Dates, formats et petits outils partagés.

export const DAY_MS = 86400000;

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / DAY_MS);
}

const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const dateLong = (iso) => cap(fmtLong.format(parseISO(iso)));
export const dateShort = (iso) => cap(fmtShort.format(parseISO(iso)).replace(/\./g, ''));
export const dayMonth = (iso) => fmtDayMonth.format(parseISO(iso));

// 340 -> "5:40"
export function clock(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Durée lisible : 900 -> "15 min", 20 -> "20 s", 90 -> "1 min 30"
export function duration(sec) {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${String(s).padStart(2, '0')}` : `${m} min`;
}

export function distance(m) {
  return m >= 1000 ? `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : `${m} m`;
}

export function paceRange(p) {
  if (!p) return '';
  return p[0] === p[1] ? `${clock(p[0])}/km` : `${clock(p[0])}–${clock(p[1])}/km`;
}

// "3:24", "1:02:10" ou "45" (minutes) -> secondes
export function parseClock(str) {
  if (!str) return null;
  const parts = String(str).trim().replace(',', '.').split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "15 au 21 novembre" ou "29 novembre au 5 décembre"
export function rangeLabel(fromIso, toIso) {
  const a = parseISO(fromIso), b = parseISO(toIso);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} au ${dayMonth(toIso)}`;
  return `${dayMonth(fromIso)} au ${dayMonth(toIso)}`;
}
