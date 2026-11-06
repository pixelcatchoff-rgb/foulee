// Relais Strava pour Foulée (Cloudflare Worker).
// Il garde la clé secrète Strava à l'abri et transmet les requêtes de l'appli.
// Variables à définir dans Cloudflare : STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET (secret), ALLOWED_ORIGINS.

const STRAVA = 'https://www.strava.com';

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

async function forward(res, cors) {
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors } });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!ok) return json({ error: 'Origine non autorisée' }, 403, cors);

    const url = new URL(req.url);
    try {
      if (url.pathname === '/token' && req.method === 'POST') {
        const { code } = await req.json();
        if (!code) return json({ error: 'Code manquant' }, 400, cors);
        return forward(await fetch(`${STRAVA}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, code, grant_type: 'authorization_code' }),
        }), cors);
      }

      if (url.pathname === '/refresh' && req.method === 'POST') {
        const { refresh_token } = await req.json();
        if (!refresh_token) return json({ error: 'Jeton manquant' }, 400, cors);
        return forward(await fetch(`${STRAVA}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, refresh_token, grant_type: 'refresh_token' }),
        }), cors);
      }

      if (url.pathname === '/activities' && req.method === 'GET') {
        const auth = req.headers.get('Authorization');
        if (!auth) return json({ error: 'Non connecté' }, 401, cors);
        const q = new URLSearchParams();
        for (const k of ['after', 'before', 'page', 'per_page']) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k));
        return forward(await fetch(`${STRAVA}/api/v3/athlete/activities?${q}`, { headers: { Authorization: auth } }), cors);
      }

      // Itinéraires piétons (si le navigateur ne peut pas joindre le serveur directement)
      if (url.pathname === '/route' && req.method === 'GET') {
        const points = url.searchParams.get('points') || '';
        if (!/^[-0-9.,;]+$/.test(points) || points.split(';').length > 12) return json({ error: 'Points invalides' }, 400, cors);
        return forward(await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${points}?overview=full&geometries=geojson&steps=false`, {
          headers: { 'User-Agent': 'Foulee/1.3 (appli de course a pied personnelle)' },
        }), cors);
      }

      if (url.pathname === '/deauthorize' && req.method === 'POST') {
        const { access_token } = await req.json();
        return forward(await fetch(`${STRAVA}/oauth/deauthorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ access_token }),
        }), cors);
      }

      return json({ error: 'Adresse inconnue' }, 404, cors);
    } catch (e) {
      return json({ error: 'Erreur du relais', message: String(e.message || e) }, 500, cors);
    }
  },
};
