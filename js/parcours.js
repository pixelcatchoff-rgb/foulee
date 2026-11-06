// Écran Parcours : boucles autour de la position, à la distance de la séance.
import { store, findSession } from './store.js';
import { createMap, meMarker, haversine } from './map.js';
import { sessionDistance, suggestLoops, toGPX } from './routes.js';
import { esc } from './util.js';

const COLORS = ['var(--quality)', 'var(--long)', 'var(--test)'];
const km = (m) => (m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let st = null; // { sessionId, target, start, loops, selected, map, L, lines, busy }

export function viewParcours(sessionId) {
  const s = sessionId ? findSession(sessionId) : null;
  const planned = s ? sessionDistance(s, store.plan) : null;
  const saved = store.tools.routeTarget;
  const target = planned || saved || 5000;
  st = { sessionId: s?.id || null, target, start: null, loops: [], selected: 0, lines: [], busy: false };
  return `
    <div data-parcours>
      <a class="back" href="${s ? `#/seance/${s.id}` : '#/'}" data-back>${s ? 'Séance' : 'Accueil'}</a>
      <h1 class="page-title">Parcours</h1>
      <p class="lede">${s ? `${esc(s.title)} : environ ${km(planned)} km en tout, échauffement compris.` : 'Des boucles qui partent du point choisi et y reviennent : ta position, ou n’importe où sur la carte.'}</p>
      <div class="field">
        <span>Longueur de la boucle</span>
        <div class="stepper">
          <button type="button" class="btn" data-target-step="-500" aria-label="500 m de moins">−</button>
          <output data-target>${km(target)} km</output>
          <button type="button" class="btn" data-target-step="500" aria-label="500 m de plus">+</button>
        </div>
      </div>
      <div class="route-wrap">
        <div class="route-map" data-route-map></div>
        <button type="button" class="route-here" data-route-here hidden>Chercher une boucle ici</button>
        <button type="button" class="route-me" data-route-me hidden aria-label="Revenir à ma position">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        </button>
      </div>
      <p class="hint route-tip">Touche la carte pour choisir un autre départ, ou déplace-la puis « Chercher une boucle ici ».</p>
      <p class="route-status" data-route-status aria-live="polite">Localisation en cours…</p>
      <ul class="route-list" data-route-list></ul>
      <div class="form-actions" data-route-actions hidden>
        <button class="btn btn-primary" data-route-run>Courir ce parcours</button>
        <button class="btn" data-route-gpx>Télécharger le GPX</button>
        <button class="btn btn-ghost" data-route-more>Autres boucles</button>
      </div>
      <p class="hint">Itinéraires piétons calculés avec les données OpenStreetMap. Vérifie sur place que les chemins sont praticables.</p>
    </div>`;
}

export async function mountParcours(root) {
  const q = (s) => root.querySelector(s);
  const status = q('[data-route-status]');
  try {
    const { L, map } = await createMap(q('[data-route-map]'));
    st.L = L; st.map = map;
    // Carte déplacée à la main : on propose de chercher dans la zone affichée
    map.on('moveend', () => {
      if (!st || st.auto) { if (st) st.auto = false; return; }
      const c = map.getCenter();
      const far = !st.start || haversine([c.lat, c.lng], st.start) > 300;
      q('[data-route-here]').hidden = !far;
    });
    // Toucher la carte : ce point devient le départ
    map.on('click', (e) => setStart(root, [e.latlng.lat, e.latlng.lng], { recenter: false }));
  } catch (e) {
    q('[data-route-map]').innerHTML = `<p class="live-nomap">${esc(e.message)}</p>`;
  }
  if (!('geolocation' in navigator)) { status.textContent = 'Position indisponible : touche la carte pour choisir un départ.'; return; }
  locate(root);
}

function locate(root) {
  const status = root.querySelector('[data-route-status]');
  status.textContent = 'Localisation en cours…';
  navigator.geolocation.getCurrentPosition((pos) => {
    if (!st) return;
    st.here = [pos.coords.latitude, pos.coords.longitude];
    if (st.map) {
      st.me ||= meMarker(st.L, st.map);
      st.me.setLatLng(st.here);
    }
    setStart(root, st.here, { recenter: true });
  }, (err) => {
    status.textContent = err.code === 1
      ? 'Localisation refusée : touche la carte pour choisir un départ, ou autorise-la dans Réglages, Confidentialité, Service de localisation.'
      : 'Position introuvable : touche la carte pour choisir un départ.';
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
}

// Nouveau point de départ : marqueur, recentrage éventuel, nouvelle recherche
function setStart(root, point, { recenter }) {
  if (!st) return;
  st.start = point;
  if (st.map) {
    if (!st.startMarker) {
      st.startMarker = st.L.marker(point, {
        title: 'Départ',
        icon: st.L.divIcon({ className: 'start-pin', html: '<span>Départ</span>', iconSize: null }),
        interactive: false,
      }).addTo(st.map);
    } else st.startMarker.setLatLng(point);
    if (recenter) { quiet(); st.map.setView(point, 15); }
  }
  root.querySelector('[data-route-here]').hidden = true;
  root.querySelector('[data-route-me]').hidden = !st.here || haversine(point, st.here) < 50;
  search(root, undefined, true);
}

export function unmountParcours() {
  st?.map?.remove();
  st = null;
}

async function search(root, seed, restart = false) {
  if (!st?.start) return;
  if (st.busy && !restart) return;
  st.busy = true;
  st.generation = (st.generation || 0) + 1;
  const gen = st.generation;
  const q = (s) => root.querySelector(s);
  const status = q('[data-route-status]');
  const list = q('[data-route-list]');
  st.loops = [];
  st.lines.forEach((l) => l.remove());
  st.lines = [];
  list.innerHTML = '';
  q('[data-route-actions]').hidden = true;
  status.textContent = `Recherche de boucles de ${km(st.target)} km…`;
  const mine = st;
  const current = () => st === mine && st.generation === gen;
  try {
    await suggestLoops(st.start, st.target, (loop, n) => {
      if (!current()) return;
      st.loops.push(loop);
      if (st.map) st.lines.push(st.L.polyline(loop.coords, { color: cssColor(n - 1), weight: 5, opacity: 0.5, interactive: false }).addTo(st.map));
      status.textContent = n < 3 ? `Boucle ${n} trouvée, recherche des suivantes…` : '';
      paintList(root);
      if (n === 1) select(root, 0);
    }, seed, current);
    if (current()) status.textContent = st.loops.length < 3 ? 'Pas d’autre boucle trouvée par ici.' : '';
  } catch (e) {
    if (current()) status.textContent = e.message;
  } finally {
    if (current()) st.busy = false;
  }
}

// Déplacement de la carte fait par l'appli : il ne doit pas proposer « Chercher ici »
function quiet() {
  st.auto = true;
  clearTimeout(st.autoTimer);
  st.autoTimer = setTimeout(() => { if (st) st.auto = false; }, 800);
}

function cssColor(i) {
  const name = COLORS[i % COLORS.length].match(/--[\w-]+/)[0];
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function paintList(root) {
  root.querySelector('[data-route-list]').innerHTML = st.loops.map((l, i) => `
    <li>
      <button class="route-card${i === st.selected ? ' is-on' : ''}" data-route-pick="${i}" style="--c:${cssColor(i)}">
        <span class="rc-name">Boucle vers ${l.direction}</span>
        <span class="rc-dist">${km(l.distance)} km</span>
      </button>
    </li>`).join('');
}

function select(root, i) {
  st.selected = i;
  st.lines.forEach((l, k) => {
    l.setStyle({ opacity: k === i ? 1 : 0.35, weight: k === i ? 6 : 4 });
    if (k === i) l.bringToFront();
  });
  if (st.map && st.lines[i]) { quiet(); st.map.fitBounds(st.lines[i].getBounds(), { padding: [24, 24] }); }
  root.querySelector('[data-route-actions]').hidden = false;
  paintList(root);
}

export function handleParcoursClick(ev, root) {
  if (!st || !root) return false;
  const t = ev.target.closest('[data-target-step],[data-route-pick],[data-route-run],[data-route-gpx],[data-route-more],[data-route-here],[data-route-me]');
  if (!t) return false;
  if ('routeHere' in t.dataset) {
    const c = st.map.getCenter();
    setStart(root, [c.lat, c.lng], { recenter: false });
  } else if ('routeMe' in t.dataset) {
    if (st.here) setStart(root, st.here, { recenter: true }); else locate(root);
  } else if (t.dataset.targetStep) {
    st.target = Math.max(1000, Math.min(30000, st.target + Number(t.dataset.targetStep)));
    store.saveTools({ routeTarget: st.target });
    root.querySelector('[data-target]').textContent = `${km(st.target)} km`;
    clearTimeout(st.debounce);
    st.debounce = setTimeout(() => search(root, undefined, true), 700);
  } else if (t.dataset.routePick) {
    select(root, Number(t.dataset.routePick));
  } else if ('routeMore' in t.dataset) {
    search(root, Math.random() * 120, true);
  } else if ('routeGpx' in t.dataset) {
    const l = st.loops[st.selected];
    const blob = new Blob([toGPX(l.coords, `Foulée – boucle ${km(l.distance)} km`)], { type: 'application/gpx+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `foulee-boucle-${km(l.distance).replace(',', '-')}km.gpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else if ('routeRun' in t.dataset) {
    const l = st.loops[st.selected];
    try {
      localStorage.setItem('foulee.nextRoute', JSON.stringify({ coords: l.coords, distance: Math.round(l.distance), direction: l.direction }));
    } catch { /* pas de stockage : on court sans tracé */ }
    location.hash = st.sessionId ? `#/courir/${st.sessionId}` : '#/courir';
  }
  return true;
}
