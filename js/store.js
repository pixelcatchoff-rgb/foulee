// Données stockées sur le téléphone (localStorage). Rien ne part sur un serveur.
import { buildDefaultPlan } from './plan-data.js';
import { addDays } from './util.js';

const KEY = 'foulee.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.plan && data.log) return data;
    }
  } catch { /* stockage indisponible : on repart d'un état neuf */ }
  return { version: 1, plan: buildDefaultPlan(), log: {} };
}

let state = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* mode privé */ }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get plan() { return state.plan; },
  get log() { return state.log; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  entry(id) { return state.log[id] || null; },

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

  exportJSON() {
    return JSON.stringify({ app: 'foulee', exported: new Date().toISOString(), ...state }, null, 2);
  },

  importJSON(text) {
    const data = JSON.parse(text);
    if (data.app !== 'foulee' || !data.plan || !data.log) throw new Error('Ce fichier n’est pas une sauvegarde Foulée.');
    state = { version: 1, plan: data.plan, log: data.log };
    persist();
  },

  reset() { state = { version: 1, plan: buildDefaultPlan(), log: {} }; persist(); },
};

// Toutes les séances du plan, avec leur date réelle, dans l'ordre.
export function allSessions(plan = state.plan) {
  const out = [];
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
