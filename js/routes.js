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

// Une boucle : le départ est sur un cercle dont le centre est placé dans la direction `bearing`.
// On ajuste le rayon jusqu'à approcher la distance voulue.
async function buildLoop(start, target, bearing) {
  let radius = target / (2 * Math.PI * 1.25);
  let best = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const center = destination(start, bearing, radius);
    const pts = [start];
    for (let k = 1; k <= 5; k += 1) pts.push(destination(center, bearing + 180 + k * 60, radius));
    pts.push(start);
    const r = await fetchRoute(pts);
    if (!best || Math.abs(r.distance - target) < Math.abs(best.distance - target)) best = r;
    if (Math.abs(r.distance - target) / target < 0.06) break;
    radius *= Math.min(1.8, Math.max(0.5, target / r.distance));
  }
  return { ...best, bearing, direction: directionName(bearing) };
}

// Trois boucles dans trois directions différentes. `onLoop` reçoit chaque boucle dès qu'elle est prête.
export async function suggestLoops(start, target, onLoop, seed = Math.random() * 120) {
  const out = [];
  let lastError = null;
  for (const b of [0, 120, 240].map((x) => x + seed)) {
    try {
      const loop = await buildLoop(start, target, b);
      out.push(loop);
      onLoop?.(loop, out.length);
    } catch (e) {
      lastError = e;
      if (e.message.startsWith('Trop de demandes')) break;
    }
  }
  if (!out.length) throw lastError || new Error('Aucune boucle trouvée autour de toi.');
  return out;
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
