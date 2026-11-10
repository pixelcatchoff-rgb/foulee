// Course en direct : suivi GPS, allures, annonces vocales et guidage de la séance.
import { store, findSession } from './store.js';
import { createMap, trackLayer, meMarker, haversine } from './map.js';
import { distanceToRoute } from './routes.js';
import { placementField } from './extra.js';
import { clock, distance, duration, esc, paceRange, toISO, dateLong } from './util.js';
import { hrFields, hrCard } from './cardio.js';
import { linkedSession } from './extra.js';

const LIVE_KEY = 'foulee.live';
const MAX_ACC = 50;      // précision GPS acceptée en temps normal (m)
const MAX_ACC_LOW = 100; // acceptée aussi après 20 s sans meilleur point (ville, arbres)
const APPROX = 500;      // au-delà : « Position exacte » est sans doute désactivée
const LOST_AFTER = 30000; // sans point valable depuis 30 s : signal perdu
const MAX_SPEED = 8;     // au-delà : saut GPS ignoré (m/s, soit 2:05/km)
const MIN_STEP = 3;      // mouvement minimal pour compter de la distance (m)

/* ---------- Horloge (remplaçable pour les tests) ---------- */
let offset = 0;
const now = () => Date.now() + offset;

/* ---------- État de la course ---------- */
let run = restore();
let watchId = null;
let wake = null;
let ticker = null;
let ui = null;          // éléments de l'écran affiché (null si l'écran n'est pas visible)
let lastFix = null;     // dernière position reçue, même imprécise

function blank(sessionId = null) {
  return {
    status: 'ready', sessionId, startedAt: null, points: [], dist: 0,
    movingMs: 0, resumedAt: null, splits: [], voice: true,
    step: 0, stepStartMs: 0, stepStartDist: 0, guideDone: false,
    lastAlert: 0, offSince: null, route: null, offRouteSince: null, lastRouteAlert: 0,
    lastGoodAt: null, lostMs: 0, hiddenAt: null, lostSaid: false,
  };
}

function restore() {
  try {
    const r = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
    if (r && (r.status === 'running' || r.status === 'paused' || r.status === 'done')) {
      if (r.status === 'running') { r.status = 'paused'; r.resumedAt = null; }
      return r;
    }
  } catch { /* rien à reprendre */ }
  return null;
}

let saveTimer = 0;
function persist(force = false) {
  if (!run) return;
  if (!force && now() - saveTimer < 5000) return;
  saveTimer = now();
  try { localStorage.setItem(LIVE_KEY, JSON.stringify(run)); } catch { /* plein */ }
}

const movingMs = () => run.movingMs + (run.status === 'running' && run.resumedAt ? now() - run.resumedAt : 0);

/* ---------- Guidage de la séance ---------- */

function flatten(steps) {
  const out = [];
  for (const st of steps || []) {
    if (st.k === 'repeat') {
      for (let i = 1; i <= st.times; i += 1) {
        st.steps.forEach((inner) => out.push({ ...inner, rep: i, of: st.times }));
      }
    } else out.push(st);
  }
  return out;
}

const NAMES = { warmup: 'Échauffement', cooldown: 'Retour au calme', run: 'Course', work: 'Effort', recovery: 'Récup' };

function stepName(st) {
  return `${NAMES[st.k]}${st.rep ? ` ${st.rep} sur ${st.of}` : ''}`;
}

function guide() {
  const s = run?.sessionId ? findSession(run.sessionId) : null;
  return s ? flatten(s.steps) : [];
}

function currentStep() {
  const g = guide();
  return run.guideDone ? null : g[run.step] || null;
}

function stepProgress(st) {
  const t = (movingMs() - run.stepStartMs) / 1000;
  const d = run.dist - run.stepStartDist;
  if (st.dur) return { done: t >= st.dur, left: Math.max(0, st.dur - t), unit: 'time' };
  if (st.dist) return { done: d >= st.dist, left: Math.max(0, st.dist - d), unit: 'dist' };
  return { done: false, left: 0, unit: 'none' };
}

function announceStep(st) {
  if (!st) return;
  const what = st.dist ? spokenDist(st.dist) : spokenDur(st.dur);
  const pace = st.pace && st.k !== 'recovery' && st.k !== 'warmup' && st.k !== 'cooldown' ? `, allure ${spokenPace(st.pace[0])}` : '';
  say(`${stepName(st)}, ${what}${pace}.`);
}

function advanceGuide() {
  const g = guide();
  if (!g.length || run.guideDone) return;
  let st = g[run.step];
  while (st && stepProgress(st).done) {
    run.step += 1;
    run.stepStartAt = now();
    run.offSince = null;
    run.stepStartMs = movingMs();
    run.stepStartDist = run.dist;
    st = g[run.step];
    if (st) announceStep(st);
    else {
      run.guideDone = true;
      say('Séance terminée. Tu peux arrêter, ou continuer à ton rythme.');
    }
  }
}

/* ---------- Allures ---------- */

// Allure sur les 30 dernières secondes (sans remonter avant `since`, le début de l'étape en cours)
function currentPace(since = 0) {
  const pts = run.points;
  if (pts.length < 2) return null;
  const tEnd = pts[pts.length - 1][2];
  let d = 0, i = pts.length - 1;
  while (i > 0 && tEnd - pts[i - 1][2] <= 30000 && pts[i - 1][2] >= since) {
    d += haversine(pts[i - 1], pts[i]);
    i -= 1;
  }
  const dt = (tEnd - pts[i][2]) / 1000;
  if (d < 25 || dt < 8) return null;
  return dt / (d / 1000);
}

function checkPace() {
  const st = currentStep();
  const p = currentPace(run.stepStartAt || 0);
  if (!st || !st.pace || !p || st.k === 'recovery' || st.k === 'warmup' || st.k === 'cooldown') { run.offSince = null; return 'none'; }
  const [lo, hi] = st.pace[0] === st.pace[1] ? [st.pace[0] - 10, st.pace[0] + 10] : [st.pace[0] - 5, st.pace[1] + 5];
  let state = p < lo ? 'fast' : p > hi ? 'slow' : 'ok';
  if (st.k === 'run' && state === 'slow') state = 'ok'; // footing : seul le « trop vite » compte
  if (state === 'ok') { run.offSince = null; return state; }
  run.offSince ||= now();
  if (now() - run.offSince > 20000 && now() - run.lastAlert > 45000) {
    run.lastAlert = now();
    say(state === 'fast' ? `Ralentis. Tu es à ${spokenPace(p)}.` : `Accélère. Tu es à ${spokenPace(p)}.`);
  }
  return state;
}

/* ---------- Voix ---------- */

function say(text) {
  if (!run?.voice || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  const fr = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('fr'));
  if (fr) u.voice = fr;
  speechSynthesis.speak(u);
}
const spokenPace = (sec) => { sec = Math.round(sec); return `${Math.floor(sec / 60)} minutes ${sec % 60 ? sec % 60 : ''}`.trim(); };
const spokenDur = (sec) => (sec < 60 ? `${sec} secondes` : `${Math.floor(sec / 60)} minute${sec >= 120 ? 's' : ''}${sec % 60 ? ` ${sec % 60}` : ''}`);
const spokenDist = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('fr-FR')} kilomètre${m >= 2000 ? 's' : ''}` : `${m} mètres`);
function spokenTime(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h ? `${h} heure ` : ''}${m} minute${m > 1 ? 's' : ''}${s ? ` ${s}` : ''}`;
}

/* ---------- GPS ---------- */

function onPosition(pos) {
  const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
  const t = pos.timestamp || now();
  lastFix = [lat, lon, t, acc];
  if (run && run.status === 'running') {
    // Précision exigée : 50 m, ou 100 m si rien de mieux depuis 20 s
    const since = now() - (run.lastGoodAt || run.resumedAt || now());
    const limit = since > 20000 ? MAX_ACC_LOW : MAX_ACC;
    if (acc <= limit) {
      run.lastGoodAt = now();
      if (run.lostSaid) { run.lostSaid = false; say('Signal GPS retrouvé.'); }
      addPoint(lat, lon, t);
      checkRoute(lat, lon);
    }
  }
  paint();
}

function addPoint(lat, lon, t) {
  const pts = run.points;
  const last = pts[pts.length - 1];
  if (last) {
    const d = haversine(last, [lat, lon]);
    const dt = Math.max(0.5, (t - last[2]) / 1000);
    if (d / dt > MAX_SPEED) return;
    if (d < MIN_STEP) return;
    run.dist += d;
  }
  pts.push([Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, t]);
  // Temps au kilomètre
  while (run.dist >= (run.splits.length + 1) * 1000) {
    const total = movingMs() / 1000;
    const prev = run.splits.reduce((s, x) => s + x, 0);
    run.splits.push(total - prev);
    const k = run.splits.length;
    say(`Kilomètre ${k}, en ${spokenTime(total - prev)}. Allure moyenne ${spokenPace(total / (run.dist / 1000))}.`);
  }
  advanceGuide();
  persist();
}

function startGps() {
  if (watchId !== null || !('geolocation' in navigator)) return;
  watchId = navigator.geolocation.watchPosition(onPosition, (err) => {
    lastFix = null;
    if (ui) ui.gps.textContent = err.code === 1 ? 'Localisation refusée : autorise-la dans Réglages, Safari, Position.' : 'GPS indisponible pour le moment.';
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}

function stopGps() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch { /* refusé : l'écran peut s'éteindre */ }
}
// Écran verrouillé ou appli quittée : le téléphone coupe le GPS des applis web.
// On note la durée de la coupure ; au retour, la distance reprend en ligne droite depuis le dernier point.
document.addEventListener('visibilitychange', () => {
  if (run?.status !== 'running') return;
  if (document.visibilityState === 'hidden') { run.hiddenAt = now(); persist(true); return; }
  if (run.hiddenAt) {
    const gap = now() - run.hiddenAt;
    if (gap > 15000) run.lostMs = (run.lostMs || 0) + gap;
    run.hiddenAt = null;
  }
  keepAwake();
  stopGps(); startGps(); // relance le suivi, parfois figé au retour
  paint();
});

/* ---------- Commandes ---------- */

export function start() {
  if (!run) run = blank();
  run.status = 'running';
  run.startedAt = now();
  run.resumedAt = now();
  run.lastGoodAt = lastFix && lastFix[3] <= MAX_ACC ? now() : null;
  run.stepStartMs = 0;
  run.stepStartDist = 0;
  if (lastFix && lastFix[3] <= MAX_ACC) run.points.push([lastFix[0], lastFix[1], now()]);
  say(' '); // iOS : la voix doit être activée par un geste
  const st = currentStep();
  if (st) announceStep(st); else say('C’est parti.');
  keepAwake();
  tick();
  persist(true);
  paint();
}

export function pause() {
  run.movingMs = movingMs();
  run.resumedAt = null;
  run.status = 'paused';
  say('Pause.');
  persist(true);
  paint();
}

export function resume() {
  run.status = 'running';
  run.resumedAt = now();
  run.lastGoodAt = now();
  say('Reprise.');
  keepAwake();
  tick();
  persist(true);
  paint();
}

export function finish() {
  if (run.status === 'running') { run.movingMs = movingMs(); run.resumedAt = null; }
  run.status = 'done';
  run.endedAt = now();
  clearInterval(ticker); ticker = null;
  wake?.release?.();
  say(`Course terminée. ${spokenDist(Math.round(run.dist))} en ${spokenTime(run.movingMs / 1000)}.`);
  persist(true);
  paint();
}

export function discard() {
  try { localStorage.removeItem(LIVE_KEY); } catch { /* rien */ }
  run = null;
  stopGps();
  clearInterval(ticker); ticker = null;
}

// Enregistre la sortie dans le suivi ; renvoie l'identifiant de la sortie.
// `fixedKm` / `fixedSec` : distance et durée corrigées à la main (GPS trompé, chrono oublié).
// `place` : séance remplacée (id), null = en plus du programme, undefined = rattachement automatique.
export function saveRun(fixedKm = null, place = undefined, fixedSec = null, hr = {}) {
  const start = new Date(run.startedAt);
  const id = `gps-${run.startedAt}`;
  const elapsed = Math.round(((run.endedAt || now()) - run.startedAt) / 1000);
  const s = run.sessionId ? findSession(run.sessionId) : null;
  // Tracé allégé : un point tous les 5 m environ
  const track = [];
  let acc = 0;
  run.points.forEach((p, i) => {
    if (i) acc += haversine(run.points[i - 1], p);
    if (!i || acc >= 5 || i === run.points.length - 1) { track.push([p[0], p[1]]); acc = 0; }
  });
  const activity = {
    id, source: 'gps', name: s ? s.title : 'Sortie libre',
    start: start.toISOString(), date: toISO(start),
    distance: Math.round(run.dist), moving: Math.round(run.movingMs / 1000), elapsed,
    splits: run.splits.map((x) => Math.round(x)), track,
  };
  if (fixedKm && Math.abs(fixedKm * 1000 - run.dist) > 20) {
    activity.distance = Math.round(fixedKm * 1000);
    activity.fixed = true;
    activity.splits = [];
  }
  if (fixedSec && Math.abs(fixedSec - activity.moving) >= 5) {
    activity.moving = Math.round(fixedSec);
    activity.elapsed = Math.max(activity.moving, elapsed);
    activity.fixed = true;
    activity.splits = [];
  }
  if (hr?.hrAvg) activity.hrAvg = hr.hrAvg;
  if (hr?.hrMax) activity.hrMax = hr.hrMax;
  store.addActivities([activity], { link: !s && place === undefined });
  if (!s && place !== undefined) store.setPlacement(id, place);
  if (s) {
    store.save(s.id, {
      date: activity.date, duration: activity.moving,
      distance: Math.round(activity.distance / 10) / 100, activityId: id,
      ...(hr?.hrAvg ? { hrAvg: hr.hrAvg } : {}), ...(hr?.hrMax ? { hrMax: hr.hrMax } : {}),
    });
  }
  discard();
  return id;
}

export const liveRun = () => run;
export function prepare(sessionId) {
  if (run && run.status !== 'ready') return run; // une course est déjà en cours
  const keepRoute = run?.route && run.sessionId === (sessionId || null) ? run.route : null;
  run = blank(sessionId || null);
  run.route = keepRoute;
  try {
    const next = JSON.parse(localStorage.getItem('foulee.nextRoute') || 'null');
    if (next?.coords?.length) run.route = next;
    localStorage.removeItem('foulee.nextRoute');
  } catch { /* pas de parcours choisi */ }
  return run;
}

// Écart au parcours choisi : alerte vocale si on s'en éloigne plus de 20 s
function checkRoute(lat, lon) {
  if (!run.route) return;
  const d = distanceToRoute([lat, lon], run.route.coords);
  if (d < 50) { run.offRouteSince = null; return; }
  run.offRouteSince ||= now();
  if (now() - run.offRouteSince > 20000 && now() - run.lastRouteAlert > 60000) {
    run.lastRouteAlert = now();
    say('Tu t’éloignes du parcours.');
  }
}

function tick() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (run?.status !== 'running') return;
    advanceGuide();
    paint();
    persist();
  }, 1000);
}

/* ---------- Écran ---------- */

export function viewLive(sessionId) {
  const r = prepare(sessionId);
  const s = r.sessionId ? findSession(r.sessionId) : null;
  return `
    <div class="live" data-live>
      <div class="live-map" data-live-map></div>
      <div class="live-body">
        <p class="live-title">${s ? esc(s.title) : 'Sortie libre'}${r.route ? ` · boucle de ${(r.route.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : ''}</p>
        ${r.status === 'ready' && !r.route ? `<a class="live-route-link" href="#/parcours${r.sessionId ? `/${r.sessionId}` : ''}">Choisir un parcours autour de moi</a>` : ''}
        <p class="live-gps" data-gps>Recherche du GPS…</p>
        <div class="live-time" data-time>0:00</div>
        <dl class="live-stats">
          <div><dt>Distance</dt><dd data-dist>0,00<small> km</small></dd></div>
          <div><dt>Allure</dt><dd data-pace>–</dd></div>
          <div><dt>Moyenne</dt><dd data-avg>–</dd></div>
        </dl>
        <div class="live-step" data-step hidden></div>
        <div class="live-controls" data-controls></div>
        <label class="live-voice"><input type="checkbox" data-voice ${r.voice ? 'checked' : ''}> Annonces vocales</label>
        <ol class="live-splits" data-splits></ol>
        <div class="live-help" data-gps-help hidden>
          <p><b>La distance ne compte pas ?</b></p>
          <ol>
            <li>Sur iPhone : Réglages, Confidentialité et sécurité, Service de localisation, Sites web Safari : choisis « Lorsque l’app est active » et active « Position exacte ».</li>
            <li>Sur Android : Paramètres, Localisation : active la localisation et la « précision de la localisation Google ».</li>
            <li>Garde Foulée ouverte à l’écran pendant la course : si le téléphone se verrouille, le GPS s’arrête.</li>
          </ol>
        </div>
        <p class="hint">Garde l’écran allumé et Foulée ouverte : le suivi s’arrête si tu verrouilles le téléphone. Avec une montre, mieux vaut enregistrer sur la montre.</p>
      </div>
    </div>`;
}

export async function mountLive(root) {
  const q = (s) => root.querySelector(s);
  ui = {
    root, gps: q('[data-gps]'), time: q('[data-time]'), dist: q('[data-dist]'), pace: q('[data-pace]'),
    avg: q('[data-avg]'), step: q('[data-step]'), controls: q('[data-controls]'), splits: q('[data-splits]'),
    map: null, line: null, me: null, L: null, follow: true, help: q('[data-gps-help]'),
  };
  startGps();
  if (run?.status === 'running') { keepAwake(); tick(); }
  paint();
  try {
    const { L, map } = await createMap(q('[data-live-map]'));
    if (!ui || ui.root !== root) return;
    ui.L = L; ui.map = map;
    if (run.route) {
      const planned = L.polyline(run.route.coords, { color: getComputedStyle(document.documentElement).getPropertyValue('--long').trim(), weight: 5, opacity: 0.6, dashArray: '8 8' }).addTo(map);
      if (!run.points.length && !lastFix) map.fitBounds(planned.getBounds(), { padding: [20, 20] });
    }
    ui.line = trackLayer(L, map, run.points.map((p) => [p[0], p[1]]));
    ui.me = meMarker(L, map);
    map.on('dragstart', () => { ui.follow = false; });
    paint();
  } catch (e) {
    q('[data-live-map]').innerHTML = `<p class="live-nomap">${esc(e.message)}</p>`;
  }
}

export function unmountLive() {
  document.body.classList.remove('run-on');
  if (ui?.map) ui.map.remove();
  ui = null;
  if (!run || run.status === 'ready' || run.status === 'done') stopGps();
}

function paint() {
  if (!ui || !run) return;
  // Pendant la course, la barre d'onglets disparaît : plus de place, pas de touche accidentelle
  document.body.classList.toggle('run-on', run.status === 'running');
  const sec = movingMs() / 1000;
  const p = currentPace();
  ui.time.textContent = clock(sec);
  ui.dist.innerHTML = `${(run.dist / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small> km</small>`;
  ui.pace.innerHTML = p && run.status === 'running' ? `${clock(p)}<small>/km</small>` : '–';
  ui.avg.innerHTML = run.dist > 50 ? `${clock(sec / (run.dist / 1000))}<small>/km</small>` : '–';

  const lostFor = run.status === 'running' ? now() - (run.lastGoodAt || run.resumedAt || now()) : 0;
  if (run.status === 'running' && lostFor > LOST_AFTER) {
    ui.gps.textContent = lastFix && lastFix[3] > APPROX
      ? 'Position approximative : la distance ne compte pas. Active « Position exacte » (voir plus bas).'
      : `Pas de signal GPS depuis ${Math.round(lostFor / 1000)} s : la distance ne compte pas. Garde Foulée ouverte et l’écran allumé.`;
    ui.gps.className = 'live-gps is-bad';
    if (!run.lostSaid && now() - lostFor > 0) { run.lostSaid = true; say('Signal GPS perdu. Garde l’écran allumé.'); }
  } else if (lastFix) {
    const acc = Math.round(lastFix[3]);
    const good = lastFix[3] <= MAX_ACC;
    ui.gps.textContent = lastFix[3] > APPROX
      ? `Position approximative (${acc} m) : active « Position exacte », sinon la distance ne comptera pas.`
      : good ? `GPS prêt · précision ${acc} m` : `GPS imprécis (${acc} m) : patiente quelques secondes à découvert`;
    ui.gps.className = `live-gps${good ? ' is-ok' : lastFix[3] > APPROX ? ' is-bad' : ''}`;
  }
  if (ui.help) ui.help.hidden = !(lastFix && lastFix[3] > APPROX) && !(run.status === 'running' && lostFor > LOST_AFTER);

  // Étape guidée
  const st = run.status !== 'ready' ? currentStep() : guide()[0];
  if (st) {
    const prog = run.status !== 'ready' ? stepProgress(st) : { left: st.dur || st.dist, unit: st.dur ? 'time' : 'dist' };
    const next = guide()[run.step + 1];
    const state = run.status === 'running' ? checkPace() : 'none';
    ui.step.hidden = false;
    ui.step.className = `live-step is-${st.k} pace-${state}`;
    ui.step.innerHTML = `
      <span class="ls-name">${stepName(st)}</span>
      <span class="ls-left">${prog.unit === 'time' ? clock(prog.left) : distance(Math.round(prog.left))}<small> restant${prog.unit === 'dist' ? 's' : ''}</small></span>
      <span class="ls-target">${st.pace && st.k !== 'recovery' ? `Cible ${paceRange(st.pace)}` : st.label || 'À ton rythme'}${state === 'fast' ? ' · trop rapide' : state === 'slow' ? ' · trop lent' : ''}</span>
      ${next ? `<span class="ls-next">Ensuite : ${stepName(next)}, ${next.dist ? distance(next.dist) : duration(next.dur)}</span>` : ''}`;
  } else if (run.guideDone) {
    ui.step.hidden = false;
    ui.step.className = 'live-step is-done';
    ui.step.innerHTML = '<span class="ls-name">Séance terminée</span><span class="ls-target">Tu peux arrêter, ou continuer à ton rythme.</span>';
  } else ui.step.hidden = true;

  // Boutons
  const btns = {
    ready: '<button class="btn btn-primary btn-big" data-live-act="start">Démarrer</button>',
    running: '<button class="btn btn-big" data-live-act="pause">Pause</button><button class="btn btn-ghost btn-big" data-live-act="finish">Terminer</button>',
    paused: '<button class="btn btn-primary btn-big" data-live-act="resume">Reprendre</button><button class="btn btn-ghost btn-big" data-live-act="finish">Terminer</button>',
    done: `${doneNote()}
      ${run.sessionId ? '' : `<div data-live-place>${placementField(toISO(new Date(run.startedAt)))}</div>`}
      <div class="live-fix">
        <div class="field"><span>Durée</span>${durFields('live', Math.round(run.movingMs / 1000))}</div>
        <label class="field"><span>Distance</span><span class="unit-input"><input data-live-dist inputmode="decimal" autocomplete="off" value="${(run.dist / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}"><em>km</em></span></label>
        ${hrFields(null, null)}
      </div>
      <button class="btn btn-primary btn-big" data-live-act="save">Enregistrer la sortie</button><button class="btn btn-ghost btn-big" data-live-act="discard">Supprimer</button>`,
  }[run.status];
  if (ui.controls.dataset.state !== run.status) {
    ui.controls.innerHTML = btns;
    ui.controls.dataset.state = run.status;
  }

  ui.splits.innerHTML = run.splits.map((s, i) => `<li><span>Km ${i + 1}</span><span>${clock(s)}</span></li>`).join('');

  // Carte
  if (ui.map) {
    const pos = lastFix ? [lastFix[0], lastFix[1]] : run.points.length ? run.points.at(-1) : null;
    ui.line.setLatLngs(run.points.map((pt) => [pt[0], pt[1]]));
    if (pos) {
      ui.me.setLatLng([pos[0], pos[1]]);
      if (ui.follow) ui.map.setView([pos[0], pos[1]], Math.max(ui.map.getZoom(), 16), { animate: false });
    }
  }
}

// Après la course : on prévient si le GPS a manqué une partie du parcours
function doneNote() {
  const min = Math.round((run.lostMs || 0) / 60000);
  const sec = run.movingMs / 1000;
  const pace = run.dist > 50 ? sec / (run.dist / 1000) : null;
  const odd = run.dist < 200 && sec > 300;
  if (odd) return '<p class="live-warn">Le GPS n’a presque rien enregistré. Si tu connais la distance (montre, appli d’un ami, parcours connu), corrige-la ci-dessous.</p>';
  if (min >= 1) return `<p class="live-warn">Le suivi a été coupé environ ${min} min (écran verrouillé ou appli quittée) : la distance est sans doute trop courte. Corrige-la si tu la connais.</p>`;
  if (pace && pace > 900) return '<p class="live-warn">Allure moyenne très lente : le GPS a peut-être manqué une partie du parcours. Corrige la distance si besoin.</p>';
  return '<p class="hint">Corrige la distance si elle te paraît fausse.</p>';
}

export function setVoice(on) {
  if (!run) return;
  run.voice = on;
  if (on) say('Annonces activées.');
  persist(true);
}

/* ---------- Résumé d'une sortie ---------- */

export function viewActivity(id) {
  const a = store.activities.find((x) => x.id === id);
  if (!a) return '<p class="lede">Cette sortie n’existe plus. <a href="#/analyse">Retour à l’analyse</a></p>';
  const pace = (a.moving || a.elapsed) / (a.distance / 1000);
  return `
    <a class="back" href="#/analyse" data-back>Analyse</a>
    <header class="session-head t-long">
      <p class="hero-when">${dateLong(a.date)}</p>
      <h1 class="hero-title">${esc(a.name)}</h1>
      <p class="hero-meta">${{ gps: 'Enregistrée avec Foulée', archive: 'Archive Strava', api: 'Strava', manual: 'Saisie à la main' }[a.source] || ''}${a.extra ? ' · en plus du programme' : ''}</p>
    </header>
    ${a.track?.length > 1 ? '<div class="activity-map" data-activity-map></div>' : ''}
    <dl class="stats">
      <div><dt>Distance</dt><dd>${(a.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}<small> km</small></dd></div>
      <div><dt>Temps</dt><dd>${clock(a.moving || a.elapsed)}</dd></div>
      <div><dt>Allure</dt><dd>${clock(pace)}<small>/km</small></dd></div>
    </dl>
    ${a.source === 'gps' || a.source === 'manual' ? `
      <details class="howto edit-run"${a.fixed ? '' : ''}>
        <summary>Modifier la sortie : durée, distance, cardio</summary>
        <form data-fix-dist="${esc(a.id)}">
          <div class="field"><span>Durée</span>${durFields('fix', a.moving || a.elapsed)}</div>
          <label class="field"><span>Distance</span><span class="unit-input"><input name="km" inputmode="decimal" autocomplete="off" value="${(a.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}"><em>km</em></span></label>
          ${hrFields(a.hrAvg, a.hrMax)}
          <p class="hint">L’allure est recalculée. Si tu changes la durée ou la distance, les temps au kilomètre sont retirés.</p>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Enregistrer</button></div>
        </form>
      </details>` : ''}
    ${a.rpe || a.note ? `<p class="note">${a.rpe ? `Ressenti ${a.rpe}/10. ` : ''}${esc(a.note || '')}</p>` : ''}
    ${store.plan ? `<form class="placement" data-placement="${esc(a.id)}">${placementField(a.date, a.id)}</form>` : ''}
    ${hrCard({ hrAvg: a.hrAvg, hrMax: a.hrMax, type: linkedSession(a.id)?.type || null })}
    ${a.splits?.length ? `
      <h2 class="section-title">Temps au kilomètre</h2>
      <ol class="split-list">${a.splits.map((s, i) => `<li><span>Km ${i + 1}</span><span>${clock(s)}</span></li>`).join('')}</ol>` : ''}
    <div class="form-actions" style="margin-top:24px"><button class="btn" data-share-activity="${esc(a.id)}">Partager en image</button><button class="btn btn-ghost" data-delete-activity="${esc(a.id)}">Supprimer cette sortie</button></div>`;
}

// Saisie d'une durée en heures, minutes, secondes (le clavier numérique de l'iPhone n'a pas de « : »)
function durFields(prefix, sec = 0) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const cell = (n, v, unit, max) => `<span class="unit-input"><input name="${prefix}_${n}" data-dur="${prefix}_${n}" inputmode="numeric" pattern="[0-9]*" maxlength="${max}" autocomplete="off" aria-label="Durée, ${unit}" value="${v}"><em>${unit}</em></span>`;
  return `<div class="time-pair has-hours">${cell('h', h || '', 'h', 2)}${cell('m', sec ? m : '', 'min', 2)}${cell('s', sec ? String(s).padStart(2, '0') : '', 's', 2)}</div>`;
}

export function readDur(root, prefix) {
  const g = (n) => parseInt(root.querySelector(`[data-dur="${prefix}_${n}"]`)?.value, 10) || 0;
  const t = g('h') * 3600 + Math.min(59, g('m')) * 60 + Math.min(59, g('s'));
  return t || null;
}

export async function mountActivity(root, id) {
  const el = root.querySelector('[data-activity-map]');
  const a = store.activities.find((x) => x.id === id);
  if (!el || !a) return;
  try {
    const { L, map } = await createMap(el, { interactive: true });
    const line = trackLayer(L, map, a.track);
    L.circleMarker(a.track[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#2F6B5A', fillOpacity: 1 }).addTo(map);
    L.circleMarker(a.track.at(-1), { radius: 6, color: '#fff', weight: 2, fillColor: '#C2412D', fillOpacity: 1 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [20, 20] });
  } catch (e) {
    el.innerHTML = `<p class="live-nomap">${esc(e.message)}</p>`;
  }
}

// Pour les tests : injecte une position et avance l'horloge
window.fouleeLive = {
  feed(lat, lon, acc = 5) { onPosition({ coords: { latitude: lat, longitude: lon, accuracy: acc }, timestamp: now() }); },
  advance(sec) { offset += sec * 1000; },
  get run() { return run; },
};
