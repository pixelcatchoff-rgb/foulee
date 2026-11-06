// Connexion Strava : autorisation, jetons, synchronisation des sorties via le relais.
import { STRAVA } from './config.js';
import { store } from './store.js';
import { addDays } from './util.js';

const SYNC_EVERY = 60 * 60 * 1000; // synchro automatique au plus une fois par heure

export const stravaConfigured = () => !!(STRAVA.clientId && STRAVA.relay);
export const stravaConnected = () => !!store.strava?.refresh;

function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

export function connectStrava() {
  const p = new URLSearchParams({
    client_id: STRAVA.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: 'foulee',
  });
  location.href = `https://www.strava.com/oauth/authorize?${p}`;
}

async function relay(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${STRAVA.relay.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Strava a répondu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Retour de Strava après autorisation : ?code=…&state=foulee
export async function handleStravaCallback() {
  const q = new URLSearchParams(location.search);
  if (q.get('state') !== 'foulee') return null;
  const clean = () => history.replaceState(null, '', redirectUri() + (location.hash || '#/analyse'));
  if (q.get('error')) { clean(); return { ok: false, message: 'Connexion Strava annulée.' }; }
  if (!q.get('scope')?.includes('activity:read')) { clean(); return { ok: false, message: 'Autorise l’accès aux activités pour récupérer tes sorties.' }; }
  try {
    const t = await relay('/token', { method: 'POST', body: { code: q.get('code') } });
    store.setStrava({
      access: t.access_token, refresh: t.refresh_token, expires: t.expires_at,
      athlete: t.athlete?.firstname || '', lastSync: 0,
    });
    clean();
    return { ok: true, message: `Strava connecté${t.athlete?.firstname ? ` : ${t.athlete.firstname}` : ''}` };
  } catch (e) {
    clean();
    return { ok: false, message: `Connexion impossible : ${e.message}` };
  }
}

async function token() {
  const s = store.strava;
  if (!s?.refresh) throw new Error('Strava n’est pas connecté.');
  if (s.access && s.expires * 1000 > Date.now() + 60000) return s.access;
  const t = await relay('/refresh', { method: 'POST', body: { refresh_token: s.refresh } });
  store.setStravaQuiet({ access: t.access_token, refresh: t.refresh_token, expires: t.expires_at });
  return t.access_token;
}

const IS_RUN = /run/i;

function mapActivity(a) {
  return {
    id: `strava-${a.id}`,
    source: 'api',
    fetched: Date.now(),
    name: a.name || 'Course à pied',
    start: a.start_date,
    date: (a.start_date_local || a.start_date).slice(0, 10),
    distance: Math.round(a.distance),
    elapsed: a.elapsed_time,
    moving: a.moving_time,
    hrAvg: a.average_heartrate || null,
    hrMax: a.max_heartrate || null,
    elev: a.total_elevation_gain ?? null,
  };
}

// Récupère les sorties depuis la dernière synchro (ou depuis 2 semaines avant le début du plan).
export async function syncStrava({ force = false } = {}) {
  if (!stravaConfigured() || !stravaConnected()) return null;
  const s = store.strava;
  if (!force && s.lastSync && Date.now() - s.lastSync < SYNC_EVERY) return null;
  const access = await token();
  const fromPlan = store.plan ? new Date(`${addDays(store.plan.start, -14)}T00:00:00`).getTime() / 1000 : 0;
  const after = Math.floor(Math.max(fromPlan, (s.lastSync || 0) / 1000 - 3 * 86400, Date.now() / 1000 - 6 * 86400));
  const runs = [];
  for (let page = 1; page <= 5; page += 1) {
    const list = await relay(`/activities?after=${after}&per_page=100&page=${page}`, { token: access });
    runs.push(...list.filter((a) => IS_RUN.test(a.sport_type || a.type || '')).map(mapActivity));
    if (list.length < 100) break;
  }
  store.setStravaQuiet({ lastSync: Date.now() });
  return store.addActivities(runs);
}

export async function disconnectStrava() {
  try {
    const access = await token();
    await relay('/deauthorize', { method: 'POST', body: { access_token: access } });
  } catch { /* on oublie les jetons de toute façon */ }
  store.setStrava(null);
}
