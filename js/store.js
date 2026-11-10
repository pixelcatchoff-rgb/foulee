// Données stockées sur le téléphone (localStorage). Rien ne part sur un serveur,
// sauf les échanges avec Strava quand tu connectes ton compte.
import { addDays, parseISO, toISO } from './util.js';

const KEY = 'foulee.v1';
const listeners = new Set();
const API_CACHE_DAYS = 7; // règle de l'API Strava : données récupérées gardées 7 jours maximum

const fresh = () => ({ version: 2, plan: null, log: {}, activities: {}, history: [], tools: {}, strava: null });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.log) return { ...fresh(), ...data, version: 2 };
    }
  } catch { /* stockage indisponible : on repart d'un état neuf */ }
  return fresh();
}

let state = load();

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* mode privé */ }
}
function persist() {
  write();
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get plan() { return state.plan; },
  get hasPlan() { return !!state.plan; },
  get log() { return state.log; },
  get history() { return state.history; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  entry(id) { return state.log[id] || null; },

  // Valeurs des calculateurs : enregistrées sans redessiner l'écran.
  get tools() { return state.tools || {}; },
  saveTools(patch) { state.tools = { ...(state.tools || {}), ...patch }; write(); },

  save(id, data) {
    state.log[id] = { ...(state.log[id] || {}), ...data, done: true, updated: Date.now() };
    persist();
  },

  toggle(id) {
    if (state.log[id]?.done) delete state.log[id];
    else state.log[id] = { done: true, updated: Date.now() };
    persist();
  },

  clear(id) { delete state.log[id]; persist(); },

  /* ---------- Sorties (archive Strava, API, saisies) ---------- */

  get activities() {
    purgeApiCache();
    return Object.values(state.activities).sort((a, b) => (a.start < b.start ? -1 : 1));
  },

  // Ajoute des sorties ; renvoie { added, linked }.
  addActivities(list, { link = true } = {}) {
    let added = 0;
    for (const a of list) {
      const prev = state.activities[a.id];
      if (!prev) added += 1;
      // Une sortie déjà importée depuis l'archive reste à toi : elle n'est pas remplacée par la copie de l'API.
      if (prev?.source === 'archive' && a.source === 'api') continue;
      let next = { ...(prev || {}), ...a };
      if (!prev) next = absorbTwin(next);
      state.activities[a.id] = next;
    }
    const linked = link ? linkActivities() : 0;
    persist();
    return { added, linked };
  },

  // Sortie saisie à la main (montre, tapis, sortie sans téléphone…)
  addManualRun(run) {
    const id = `manual-${Date.now()}`;
    state.activities[id] = { ...run, id, source: 'manual', created: Date.now() };
    persist();
    return id;
  },

  // Place d'une sortie dans le programme : rattachée à une séance (sessionId), ou en plus du programme (null).
  setPlacement(activityId, sessionId) {
    const a = state.activities[activityId];
    if (!a) return;
    for (const [sid, e] of Object.entries(state.log)) {
      if (e.activityId !== activityId || sid === sessionId) continue;
      // La séance redevient à faire, sauf si tu y avais noté quelque chose toi-même
      if (e.time3k || e.rpe || e.note || e.pain) delete e.activityId;
      else delete state.log[sid];
    }
    a.extra = !sessionId;
    delete a.twin;
    if (sessionId) {
      const prev = state.log[sessionId] || {};
      state.log[sessionId] = {
        ...prev,
        done: true,
        activityId,
        date: a.date,
        duration: a.moving || a.elapsed,
        distance: Math.round(a.distance / 10) / 100,
        hrAvg: a.hrAvg || prev.hrAvg || null,
        hrMax: a.hrMax || prev.hrMax || null,
        rpe: prev.rpe || a.rpe || null,
        updated: Date.now(),
      };
    }
    persist();
  },

  updateActivity(id, patch) {
    if (!state.activities[id]) return;
    state.activities[id] = { ...state.activities[id], ...patch };
    persist();
  },

  deleteActivity(id) {
    delete state.activities[id];
    for (const e of Object.values(state.log)) if (e.activityId === id) delete e.activityId;
    persist();
  },

  clearActivities() {
    state.activities = {};
    for (const e of Object.values(state.log)) delete e.activityId;
    persist();
  },

  /* ---------- Plans ---------- */

  // Nouveau plan : l'ancien et son suivi sont archivés, les sorties sont gardées.
  replacePlan(plan) {
    if (state.plan) {
      state.history.push({ plan: state.plan, log: state.log, archived: new Date().toISOString() });
    }
    state.plan = plan;
    state.log = {};
    linkActivities();
    persist();
  },

  // Modifie le programme en place (ex. nouvelles allures après un test)
  adjustPlan(fn) {
    if (!state.plan) return null;
    const r = fn(state.plan);
    persist();
    return r;
  },

  // Revient au dernier programme archivé ; le programme actuel est archivé à sa place.
  restorePrevious() {
    const prev = state.history.pop();
    if (!prev) return false;
    if (state.plan) state.history.push({ plan: state.plan, log: state.log, archived: new Date().toISOString() });
    state.plan = prev.plan;
    state.log = prev.log;
    persist();
    return true;
  },

  /* ---------- Strava ---------- */

  get strava() { return state.strava; },
  setStrava(data) { state.strava = data ? { ...(state.strava || {}), ...data } : null; persist(); },
  setStravaQuiet(data) { state.strava = { ...(state.strava || {}), ...data }; write(); },

  /* ---------- Sauvegarde ---------- */

  exportJSON() {
    const { strava, ...rest } = state; // les jetons Strava ne quittent pas le téléphone
    const activities = Object.fromEntries(Object.entries(rest.activities).filter(([, a]) => a.source !== 'api'));
    return JSON.stringify({ app: 'foulee', exported: new Date().toISOString(), ...rest, activities }, null, 2);
  },

  // Deux sortes de fichiers : un programme seul (il remplace le programme actuel, qui est archivé)
  // ou une sauvegarde complète (elle remplace toutes les données).
  importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Ce fichier n’est pas un fichier Foulée.'); }
    if (data?.app !== 'foulee') throw new Error('Ce fichier n’est pas un fichier Foulée.');
    if (data.kind === 'programme') {
      if (!data.plan?.weeks?.length) throw new Error('Ce programme est vide.');
      this.replacePlan(data.plan);
      // Un fichier programme peut aussi apporter des sorties (archive Strava)
      if (Array.isArray(data.activities) && data.activities.length) this.addActivities(data.activities);
      // Un fichier programme peut aussi apporter le profil (poids, alimentation, moment de course)
      if (data.profile && typeof data.profile === 'object') {
        const { weight, diet, moment } = data.profile;
        this.saveTools({ ...(weight ? { weight } : {}), ...(diet ? { diet } : {}), ...(moment ? { moment } : {}) });
      }
      return 'programme';
    }
    if (!data.log) throw new Error('Cette sauvegarde est incomplète.');
    state = { ...fresh(), ...data, strava: state.strava, version: 2 };
    delete state.app; delete state.exported; delete state.kind;
    persist();
    return 'sauvegarde';
  },

  // Le programme seul, pour le garder ou le donner à quelqu'un.
  exportPlanJSON() {
    return JSON.stringify({ app: 'foulee', kind: 'programme', version: 2, exported: new Date().toISOString(), plan: state.plan }, null, 2);
  },

  reset() { state = { ...fresh(), strava: state.strava }; persist(); },
};

// Même sortie arrivée deux fois (saisie à la main puis Strava, ou Foulée puis Strava) :
// même jour, distance proche, et départ proche quand les deux heures sont connues.
function isTwin(a, b) {
  if (a.id === b.id || a.date !== b.date || !a.distance || !b.distance) return false;
  if (Math.abs(a.distance - b.distance) > 0.2 * Math.max(a.distance, b.distance)) return false;
  if (a.source === 'manual' || b.source === 'manual') return true;
  return Math.abs(new Date(a.start) - new Date(b.start)) < 30 * 60000;
}

// Une nouvelle sortie qui double une sortie connue en reprend la place dans le programme.
// Une saisie à la main est remplacée par la copie plus précise (Strava, Foulée).
function absorbTwin(a) {
  if (a.source === 'manual') return a;
  const twin = Object.values(state.activities).find((b) => isTwin(a, b));
  if (!twin) return a;
  if (twin.source === 'manual') {
    delete state.activities[twin.id];
    for (const e of Object.values(state.log)) if (e.activityId === twin.id) e.activityId = a.id;
    return { ...a, extra: !!twin.extra, rpe: twin.rpe || a.rpe, note: twin.note || a.note, hrAvg: a.hrAvg || twin.hrAvg, hrMax: a.hrMax || twin.hrMax };
  }
  return { ...a, extra: !!twin.extra, twin: twin.id };
}

function purgeApiCache() {
  const limit = Date.now() - API_CACHE_DAYS * 86400000;
  for (const [id, a] of Object.entries(state.activities)) {
    if (a.source === 'api' && (a.fetched || 0) < limit) delete state.activities[id];
  }
}

// Rattache les sorties aux séances non remplies de la même semaine du plan, dans l'ordre.
// Les jours du programme sont indicatifs : une séance décalée dans la semaine est retrouvée.
function linkActivities() {
  const plan = state.plan;
  if (!plan) return 0;
  const used = new Set(Object.values(state.log).map((e) => e.activityId).filter(Boolean));
  const runs = Object.values(state.activities)
    .filter((a) => !used.has(a.id) && !a.extra && !a.twin)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  let linked = 0;
  for (const w of plan.weeks) {
    const from = addDays(plan.start, (w.n - 1) * 7);
    const to = addDays(from, 6);
    const weekRuns = runs.filter((a) => a.date >= from && a.date <= to && !used.has(a.id));
    const open = w.sessions
      .map((s) => ({ s, date: addDays(plan.start, (w.n - 1) * 7 + s.day) }))
      .filter(({ s }) => !state.log[s.id]?.activityId && !(state.log[s.id]?.done && state.log[s.id]?.duration));
    for (const { s } of open) {
      const a = weekRuns.shift();
      if (!a) break;
      used.add(a.id);
      const prev = state.log[s.id] || {};
      state.log[s.id] = {
        ...prev,
        done: true,
        activityId: a.id,
        date: prev.date || a.date,
        duration: prev.duration || a.moving || a.elapsed,
        distance: prev.distance || Math.round(a.distance / 10) / 100,
        hrAvg: a.hrAvg || prev.hrAvg || null,
        hrMax: a.hrMax || prev.hrMax || null,
        updated: Date.now(),
      };
      linked += 1;
    }
  }
  return linked;
}

// Toutes les séances du plan, avec leur date réelle, dans l'ordre.
export function allSessions(plan = state.plan) {
  const out = [];
  if (!plan) return out;
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      out.push({ ...s, week: w.n, light: w.light, date: addDays(plan.start, (w.n - 1) * 7 + s.day) });
    }
  }
  return out;
}

export function findSession(id) {
  return allSessions().find((s) => s.id === id) || null;
}

export function phaseOf(plan, weekN) {
  return plan.phases.find((p) => weekN >= p.from && weekN <= p.to);
}

// Toutes les sorties connues : Strava (archive ou API) + séances saisies à la main.
export function allRuns() {
  let runs = store.activities.map((a) => ({ ...a }));
  // Une sortie enregistrée avec Foulée et aussi avec la montre (Strava) n'est comptée qu'une fois
  const others = runs.filter((r) => r.source !== 'gps' && r.source !== 'manual');
  runs = runs.filter((r) => r.source !== 'gps' || !others.some((o) => Math.abs(new Date(o.start) - new Date(r.start)) < 15 * 60000));
  // Doublons repérés à l'import : on garde la copie Strava plutôt que celle du GPS du téléphone
  const byId = Object.fromEntries(runs.map((r) => [r.id, r]));
  const twinned = new Set(runs.filter((r) => r.twin && byId[r.twin]).map((r) => r.twin));
  runs = runs.filter((r) => (r.twin && byId[r.twin] ? byId[r.twin].source === 'gps' : !(twinned.has(r.id) && r.source === 'gps')));
  // Une séance rattachée à une sortie (même écartée comme doublon) n'est pas comptée une seconde fois
  const linked = new Set(Object.keys(state.activities));
  for (const s of allSessions()) {
    const e = state.log[s.id];
    if (!e?.done || e.activityId && linked.has(e.activityId)) continue;
    if (!e.duration || !e.distance) continue;
    runs.push({
      id: `log-${s.id}`, source: 'log', name: s.title, date: e.date || s.date, start: `${e.date || s.date}T12:00:00`,
      distance: e.distance * 1000, moving: e.duration, elapsed: e.duration, hrAvg: e.hrAvg || null, hrMax: e.hrMax || null,
    });
  }
  return runs.sort((a, b) => (a.start < b.start ? -1 : 1));
}

export { parseISO, toISO };
