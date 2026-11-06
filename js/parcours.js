// Écran Parcours : boucles autour de la position, à la distance de la séance.
import { store, findSession } from './store.js';
import { createMap, meMarker } from './map.js';
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
      <p class="lede">${s ? `${esc(s.title)} : environ ${km(planned)} km en tout, échauffement compris.` : 'Des boucles qui partent de là où tu es et y reviennent.'}</p>
      <div class="field">
        <span>Longueur de la boucle</span>
        <div class="stepper">
          <button type="button" class="btn" data-target-step="-500" aria-label="500 m de moins">−</button>
          <output data-target>${km(target)} km</output>
          <button type="button" class="btn" data-target-step="500" aria-label="500 m de plus">+</button>
        </div>
      </div>
      <div class="route-map" data-route-map></div>
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
  } catch (e) {
    q('[data-route-map]').innerHTML = `<p class="live-nomap">${esc(e.message)}</p>`;
  }
  if (!('geolocation' in navigator)) { status.textContent = 'Ce téléphone ne donne pas sa position.'; return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    if (!st) return;
    st.start = [pos.coords.latitude, pos.coords.longitude];
    if (st.map) {
      st.map.setView(st.start, 15);
      const me = meMarker(st.L, st.map);
      me.setLatLng(st.start);
    }
    search(root);
  }, (err) => {
    status.textContent = err.code === 1
      ? 'Localisation refusée : autorise-la dans Réglages, Confidentialité, Service de localisation, Safari.'
      : 'Position introuvable. Réessaie à découvert.';
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
}

export function unmountParcours() {
  st?.map?.remove();
  st = null;
}

async function search(root, seed) {
  if (!st?.start || st.busy) return;
  const q = (s) => root.querySelector(s);
  const status = q('[data-route-status]');
  const list = q('[data-route-list]');
  st.busy = true;
  st.loops = [];
  st.lines.forEach((l) => l.remove());
  st.lines = [];
  list.innerHTML = '';
  q('[data-route-actions]').hidden = true;
  status.textContent = `Recherche de boucles de ${km(st.target)} km…`;
  const mine = st;
  try {
    await suggestLoops(st.start, st.target, (loop, n) => {
      if (st !== mine) return;
      st.loops.push(loop);
      if (st.map) st.lines.push(st.L.polyline(loop.coords, { color: cssColor(n - 1), weight: 5, opacity: 0.5 }).addTo(st.map));
      status.textContent = n < 3 ? `Boucle ${n} trouvée, recherche des suivantes…` : '';
      paintList(root);
      if (n === 1) select(root, 0);
    }, seed);
    if (st === mine) status.textContent = st.loops.length < 3 ? 'Pas d’autre boucle trouvée par ici.' : '';
  } catch (e) {
    if (st === mine) status.textContent = e.message;
  } finally {
    if (st === mine) st.busy = false;
  }
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
  if (st.map && st.lines[i]) st.map.fitBounds(st.lines[i].getBounds(), { padding: [24, 24] });
  root.querySelector('[data-route-actions]').hidden = false;
  paintList(root);
}

export function handleParcoursClick(ev, root) {
  if (!st || !root) return false;
  const t = ev.target.closest('[data-target-step],[data-route-pick],[data-route-run],[data-route-gpx],[data-route-more]');
  if (!t) return false;
  if (t.dataset.targetStep) {
    st.target = Math.max(1000, Math.min(30000, st.target + Number(t.dataset.targetStep)));
    store.saveTools({ routeTarget: st.target });
    root.querySelector('[data-target]').textContent = `${km(st.target)} km`;
    clearTimeout(st.debounce);
    st.debounce = setTimeout(() => search(root), 700);
  } else if (t.dataset.routePick) {
    select(root, Number(t.dataset.routePick));
  } else if ('routeMore' in t.dataset) {
    search(root, Math.random() * 120);
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
