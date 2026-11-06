// Parcours en boucle autour de la position, à la distance de la séance.
// Itinéraires piétons : serveur OSRM de la communauté OpenStreetMap (FOSSGIS), 1 requête par seconde maximum.
import { STRAVA } from './config.js';
import { haversine } from './map.js';

const OSRM = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
const GAP = 1100; // ms entre deux requêtes
let lastCall = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Distance d'une séance ---------- */

const mid = (p) => (p ? (p[0] + p[1]) / 2 : null);

// Distance prévue d'une séance : distances des étapes + durées converties avec l'allure prévue.
export function sessionDistance(session, plan) {
  const easy = mid(plan?.easyPace) || 525;
  let total = 0;
  const walk = (steps) => {
    for (const st of steps) {
      if (st.k === 'repeat') { for (let i = 0; i < st.times; i += 1) walk(st.steps); continue; }
      if (st.dist) total += st.dist;
      else if (st.dur) {
        const pace = st.k === 'recovery' ? easy * 1.1 : mid(st.pace) || easy;
        total += (st.dur / pace) * 1000;
      }
    }
  };
  walk(session.steps || []);
  return Math.round(total / 100) * 100;
}

/* ---------- Géométrie ---------- */

// Point situé à `dist` mètres de `p` dans la direction `bearing` (degrés)
function destination(p, bearing, dist) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const toDeg = (x) => (x * 180) / Math.PI;
  const [lat1, lon1] = [toRad(p[0]), toRad(p[1])];
  const b = toRad(bearing);
  const d = dist / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lat2), ((toDeg(lon2) + 540) % 360) - 180];
}

const DIRS = ['le nord', 'le nord-est', 'l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest'];
export const directionName = (bearing) => DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

/* ---------- Requêtes ---------- */

async function fetchRoute(points) {
  const path = points.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
  const query = 'overview=full&geometries=geojson&steps=false';
  const delay = lastCall + GAP - Date.now();
  if (delay > 0) await wait(delay);
  lastCall = Date.now();
  let res;
  try {
    res = await fetch(`${OSRM}${path}?${query}`);
  } catch (e) {
    // Accès direct bloqué : on passe par le relais Cloudflare s'il est installé
    if (!STRAVA.relay) throw new Error('Le service d’itinéraires ne répond pas. Vérifie ta connexion.');
    res = await fetch(`${STRAVA.relay.replace(/\/$/, '')}/route?points=${encodeURIComponent(path)}`);
  }
  if (!res.ok) throw new Error(res.status === 429 ? 'Trop de demandes : réessaie dans une minute.' : 'Le service d’itinéraires ne répond pas.');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Aucun chemin trouvé ici.');
  const r = data.routes[0];
  return { distance: r.distance, coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]) };
}

/* ---------- Boucles propres : pas d'aller-retour, pas de passage en double ---------- */

// Distance rapide (approximation plane, précise à quelques mètres sur ces échelles)
const M_PER_DEG = 111320;
function near(a, b, m) {
  const dy = (a[0] - b[0]) * M_PER_DEG;
  const dx = (a[1] - b[1]) * M_PER_DEG * Math.cos((a[0] * Math.PI) / 180);
  return dx * dx + dy * dy < m * m;
}

// Un point tous les `step` mètres le long du tracé
function resample(coords, step = 8) {
  const out = [coords[0]];
  let carry = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1], b = coords[i];
    const seg = haversine(a, b);
    let pos = step - carry;
    while (pos < seg) {
      const f = pos / seg;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      pos += step;
    }
    carry = seg - (pos - step);
  }
  const last = coords[coords.length - 1];
  if (haversine(out[out.length - 1], last) > 1) out.push(last);
  return out;
}

function cumulative(c) {
  const cum = [0];
  for (let i = 1; i < c.length; i += 1) cum.push(cum[i - 1] + haversine(c[i - 1], c[i]));
  return cum;
}

// Retire les allers-retours : quand le tracé revient au même endroit après un détour
// (impasse, petit crochet), le détour est coupé.
export function removeSpurs(coords) {
  let c = resample(coords);
  for (let pass = 0; pass < 30; pass += 1) {
    const cum = cumulative(c);
    const total = cum[cum.length - 1];
    let cut = null;
    for (let i = 0; i < c.length && !cut; i += 1) {
      for (let j = c.length - 1; j > i + 3; j -= 1) {
        const len = cum[j] - cum[i];
        if (len > total * 0.4 || len < 30) continue;
        if (near(c[i], c[j], 12)) { cut = [i, j]; break; }
      }
    }
    if (!cut) break;
    c = c.slice(0, cut[0] + 1).concat(c.slice(cut[1] + 1));
  }
  return c;
}

// Part du parcours où l'on repasse à moins de 15 m d'un autre moment de la course.
// Les 150 premiers et derniers mètres sont tolérés (départ dans une impasse).
export function overlapRatio(c) {
  const cum = cumulative(c);
  const total = cum[cum.length - 1];
  let count = 0, over = 0;
  for (let i = 0; i < c.length; i += 2) {
    if (cum[i] < 150 || total - cum[i] < 150) continue;
    count += 1;
    for (let j = 0; j < c.length; j += 1) {
      if (Math.abs(cum[j] - cum[i]) > 60 && near(c[i], c[j], 15)) { over += 1; break; }
    }
  }
  return count ? over / count : 0;
}

const lengthOf = (c) => cumulative(c).at(-1);

// Une boucle : le départ est sur un cercle dont le centre est placé dans la direction `bearing`.
// On nettoie le tracé, puis on ajuste le rayon jusqu'à approcher la distance voulue.
// `learn` garde d'une boucle à l'autre le rapport entre le cercle et le tracé réel.
async function buildLoop(start, target, bearing, learn) {
  let radius = target / (2 * Math.PI * learn.ratio);
  let best = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const center = destination(start, bearing, radius);
    const pts = [start];
    for (let k = 1; k <= 5; k += 1) pts.push(destination(center, bearing + 180 + k * 60, radius));
    pts.push(start);
    const raw = await fetchRoute(pts);
    const coords = removeSpurs(raw.coords);
    const distance = lengthOf(coords);
    learn.ratio = Math.min(3, Math.max(0.8, distance / (2 * Math.PI * radius)));
    const r = { coords, distance, overlap: overlapRatio(coords) };
    if (!best || Math.abs(r.distance - target) < Math.abs(best.distance - target)) best = r;
    if (Math.abs(r.distance - target) / target < 0.06) break;
    radius *= Math.min(1.8, Math.max(0.5, target / Math.max(r.distance, 1)));
  }
  return { ...best, bearing, direction: directionName(bearing) };
}

const GOOD_OVERLAP = 0.06;
const GOOD_ERROR = 0.12;
const isGood = (l, target) => l.overlap <= GOOD_OVERLAP && Math.abs(l.distance - target) / target <= GOOD_ERROR;

// Jusqu'à 6 directions essayées ; seules les boucles propres sont proposées (3 au plus).
// `onLoop` reçoit chaque boucle retenue dès qu'elle est prête.
export async function suggestLoops(start, target, onLoop, seed = Math.random() * 60, stillWanted = () => true) {
  const good = [];
  const others = [];
  const learn = { ratio: 1.25 };
  let lastError = null;
  for (const b of [0, 120, 240, 60, 180, 300].map((x) => x + seed)) {
    if (!stillWanted()) return good;
    if (good.length >= 3) break;
    try {
      const loop = await buildLoop(start, target, b, learn);
      // Deux boucles presque identiques ne comptent qu'une fois
      const twin = good.some((g) => overlapBetween(g.coords, loop.coords) > 0.6);
      if (isGood(loop, target) && !twin) {
        good.push(loop);
        onLoop?.(loop, good.length);
      } else if (!twin) others.push(loop);
    } catch (e) {
      lastError = e;
      if (e.message.startsWith('Trop de demandes')) break;
    }
  }
  // Rien de propre ici (peu de chemins) : on montre les moins mauvaises, signalées
  if (!good.length && others.length) {
    others.sort((a, b) => (a.overlap - b.overlap) || (Math.abs(a.distance - target) - Math.abs(b.distance - target)));
    others.slice(0, 2).forEach((l, i) => { l.repeats = true; good.push(l); onLoop?.(l, i + 1); });
  }
  if (!good.length) throw lastError || new Error('Aucune boucle trouvée autour de toi.');
  return good;
}

// Part du tracé `b` qui suit le tracé `a`
function overlapBetween(a, b) {
  let over = 0, count = 0;
  for (let i = 0; i < b.length; i += 4) {
    count += 1;
    for (let j = 0; j < a.length; j += 2) if (near(b[i], a[j], 20)) { over += 1; break; }
  }
  return count ? over / count : 0;
}

/* ---------- Pendant la course : écart au parcours ---------- */

// Distance (m) entre un point et le parcours (approximation par les sommets, densifiés)
export function distanceToRoute(p, coords) {
  let best = Infinity;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1], b = coords[i];
    const seg = haversine(a, b);
    const n = Math.max(1, Math.ceil(seg / 10));
    for (let k = 0; k <= n; k += 1) {
      const q = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      const d = haversine(p, q);
      if (d < best) best = d;
    }
  }
  return best;
}

/* ---------- Export GPX ---------- */

export function toGPX(coords, name) {
  const pts = coords.map(([lat, lon]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Foulée" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${name.replace(/[<&>]/g, '')}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}
