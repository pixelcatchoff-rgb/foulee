// Foulée 3.1 : calendrier, partage en image, défis entre amis, météo, chaussures,
// journal des douleurs, zones cardiaques, sauvegarde, premiers pas, vue du mois, anneau de la semaine.
import { store, allSessions, allRuns, findSession } from './store.js';
import { describe, totalTime } from './steps.js';
import { sessionStats } from './ui.js';
import {
  addDays, clock, dateLong, dateShort, dayMonth, daysBetween, esc, parseISO, toISO,
} from './util.js';

const APP_URL = 'https://pixelcatchoff-rgb.github.io/foulee/';
const plain = (s) => String(s ?? '').replace(/<[^>]+>/g, '');
const km1 = (m) => (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/* =========================================================
   Rappels : fichier calendrier (.ics) avec alerte la veille
   ========================================================= */

function stepsText(items, indent = '') {
  return items.map((it) => {
    if (it.kind === 'repeat') return `${indent}${it.times} × :\n${stepsText(it.items, `${indent}  `)}`;
    return `${indent}${plain(it.name)} : ${plain(it.amount)}${it.pace ? ` · ${plain(it.pace)}` : ''}${it.label ? ` · ${plain(it.label)}` : ''}`;
  }).join('\n');
}

const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lignes de 75 octets maximum (norme iCalendar) : on coupe à 60 caractères pour rester sûr avec les accents.
function fold(line) {
  if (line.length <= 60) return line;
  const out = [];
  for (let i = 0; i < line.length; i += 60) out.push((i ? ' ' : '') + line.slice(i, i + 60));
  return out.join('\r\n');
}

export function icsFor(sessions, plan = store.plan) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Foulee//Programme//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Foulée'];
  for (const s of sessions) {
    const min = Math.round(totalTime(s.steps) / 60);
    const desc = `${min} min. ${s.note ? `${plain(s.note)}\n` : ''}\n${stepsText(describe(s.steps))}\n\nDans Foulée : ${APP_URL}#/seance/${s.id}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}-${plan.start}@foulee`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(s.date, 1).replace(/-/g, '')}`,
      `SUMMARY:${icsEsc(`Course · ${s.title}`)}`,
      `DESCRIPTION:${icsEsc(desc)}`,
      `URL:${APP_URL}#/seance/${s.id}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(`Demain : ${s.title}`)}`, 'TRIGGER:-PT6H', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

// Sur ordinateur et Android : téléchargement du fichier.
// Sur iPhone, l'appli installée ne sait pas ouvrir un fichier créé sur place (page blanche) :
// on propose deux chemins, ouvrir directement dans Calendrier, ou enregistrer le fichier puis l'ouvrir.
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function openCalendar(text, name, count = 1) {
  const file = new File([text], name, { type: 'text/calendar' });
  if (!isIOS()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return;
  }
  document.querySelector('.sheet-wrap')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
      <h2 id="sheet-t" class="section-title">Ajouter au calendrier</h2>
      <p>${count > 1 ? `${count} séances` : '1 séance'}, avec une alerte la veille à 18 h.</p>
      <button class="btn btn-primary btn-big" data-sheet="save">Envoyer le fichier par Mail</button>
      <ol class="sheet-steps">
        <li>Choisis Mail et envoie-le à ta propre adresse.</li>
        <li>Ouvre ce mail dans l’app Mail de l’iPhone.</li>
        <li>Touche la pièce jointe « ${name} », puis « Tout ajouter ».</li>
      </ol>
      <button class="btn btn-big" data-sheet="open">Essayer d’ouvrir directement</button>
      <button class="btn btn-ghost" data-sheet="close">Fermer</button>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-sheet]');
    if (!b && ev.target !== wrap) return;
    const act = b?.dataset.sheet || 'close';
    if (act === 'open') {
      location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(text)}`;
    } else if (act === 'save') {
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); } catch { /* annulé */ }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
      }
    } else wrap.remove();
  });
}

export function calendarAll(t) {
  const list = allSessions().filter((s) => s.date >= t && !store.entry(s.id)?.done);
  if (!list.length) return 0;
  openCalendar(icsFor(list), 'foulee-seances.ics', list.length);
  return list.length;
}

export function calendarOne(id) {
  const s = findSession(id);
  if (s) openCalendar(icsFor([s]), `foulee-${s.id}.ics`);
}

/* =========================================================
   Partage d'une séance en image
   ========================================================= */

const TYPE_COLOR = { facile: '#3EE6A8', longue: '#5AA9FF', qualite: '#FFC83D', test: '#FF3D5A', objectif: '#FF3D5A' };

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function drawCard({ kicker, title, stats, footer, accent, progress }) {
  try {
    await Promise.all([
      document.fonts.load('800 80px "JetBrains Mono"'),
      document.fonts.load('800 40px Unbounded'),
      document.fonts.load('600 30px Archivo'),
    ]);
  } catch { /* polices système */ }
  const W = 1080;
  // Hauteur selon le contenu : titre (1 à 3 lignes), barre de progression éventuelle, chiffres
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = '800 76px "JetBrains Mono", monospace';
  const lines = wrap(meas, title.toUpperCase(), W - 128 - 112).slice(0, 3);
  const titleEnd = 220 + 200 + (lines.length - 1) * 88;
  const progY = progress ? titleEnd + 90 : null;
  const sy = (progress ? progY + 130 : titleEnd + 110);
  const ch = sy + 190 - 220;
  const H = Math.max(1080, 220 + ch + 250);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // Fond nuit et motif hexagonal
  const bg = g.createRadialGradient(W / 2, -200, 50, W / 2, -200, 1300);
  bg.addColorStop(0, '#1B2E52'); bg.addColorStop(1, '#0A1120');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 2;
  for (let y = -40; y < H + 80; y += 96) {
    for (let x = -28; x < W + 56; x += 56) {
      g.beginPath();
      g.moveTo(x + 28, y); g.lineTo(x + 56, y + 16); g.lineTo(x + 56, y + 48); g.lineTo(x + 28, y + 64); g.lineTo(x, y + 48); g.lineTo(x, y + 16); g.closePath();
      g.stroke();
    }
  }
  // Marque
  g.fillStyle = '#FF3D5A';
  g.beginPath(); g.moveTo(80, 128); g.lineTo(97, 88); g.lineTo(107, 88); g.lineTo(90, 128); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(104, 128); g.lineTo(121, 88); g.lineTo(131, 88); g.lineTo(114, 128); g.closePath(); g.fill();
  g.fillStyle = '#EEF2F8';
  g.font = '800 44px Unbounded, Archivo, sans-serif';
  g.fillText('FOULÉE', 148, 126);
  // Carte
  const x0 = 64, y0 = 220, cw = W - 128;
  g.fillStyle = 'rgba(18,29,49,0.92)';
  g.strokeStyle = accent; g.lineWidth = 4;
  g.beginPath(); g.roundRect(x0, y0, cw, ch, 40); g.fill(); g.stroke();
  g.fillStyle = accent;
  g.font = '700 34px "JetBrains Mono", monospace';
  g.fillText(kicker.toUpperCase(), x0 + 56, y0 + 96);
  g.fillStyle = '#EEF2F8';
  g.font = '800 76px "JetBrains Mono", monospace';
  lines.forEach((l, i) => g.fillText(l, x0 + 56, y0 + 200 + i * 88));
  // Progression du programme
  if (progress) {
    const bw = cw - 112;
    g.fillStyle = '#8D9BB1'; g.font = '600 30px Archivo, sans-serif';
    g.fillText(progress.label, x0 + 56, progY);
    g.fillStyle = '#22314A';
    g.beginPath(); g.roundRect(x0 + 56, progY + 24, bw, 18, 9); g.fill();
    g.fillStyle = accent;
    g.beginPath(); g.roundRect(x0 + 56, progY + 24, Math.max(18, bw * progress.ratio), 18, 9); g.fill();
  }
  // Chiffres
  g.strokeStyle = '#22314A'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0 + 56, sy - 40); g.lineTo(x0 + cw - 56, sy - 40); g.stroke();
  const colW = (cw - 112) / stats.length;
  stats.forEach(([k, v], i) => {
    const sx = x0 + 56 + i * colW;
    if (i) { g.beginPath(); g.moveTo(sx - 20, sy); g.lineTo(sx - 20, sy + 150); g.stroke(); }
    g.fillStyle = '#8D9BB1'; g.font = '600 30px Archivo, sans-serif';
    g.fillText(k, sx, sy + 40);
    g.fillStyle = '#EEF2F8'; g.font = '800 60px "JetBrains Mono", monospace';
    let size = 60;
    while (g.measureText(v).width > colW - 30 && size > 30) { size -= 4; g.font = `800 ${size}px "JetBrains Mono", monospace`; }
    g.fillText(v, sx, sy + 120);
  });
  // Pied
  const fy = y0 + ch + 100;
  g.fillStyle = '#8D9BB1'; g.font = '600 32px Archivo, sans-serif';
  wrap(g, footer, W - 160).slice(0, 2).forEach((l, i) => g.fillText(l, 80, fy + i * 44));
  g.fillStyle = '#5A6A84'; g.font = '600 26px Archivo, sans-serif';
  g.fillText('pixelcatchoff-rgb.github.io/foulee', 80, H - 60);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

async function shareBlob(blob, name, text) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'partagé'; } catch (e) { if (e.name === 'AbortError') return 'annulé'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'téléchargé';
}

export async function shareSession(id) {
  const s = findSession(id);
  if (!s) return null;
  const e = store.entry(id) || {};
  const st = sessionStats(s);
  const kmTxt = (x) => `${Number(x).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`;
  const stats = e.duration || e.distance
    ? [['Durée', e.duration ? clock(e.duration) : '–'], ['Distance', e.distance ? kmTxt(e.distance) : '–'], ['Allure', e.duration && e.distance ? `${clock(e.duration / e.distance)}/km` : '–']]
    : [['Durée', st.dur.toLowerCase()], ['Distance', st.dist.toLowerCase()], ['Allure', st.pace]];
  if (e.time3k) stats[0] = ['Chrono', clock(e.time3k)];
  const all = allSessions();
  const doneN = all.filter((x) => store.entry(x.id)?.done).length;
  const blob = await drawCard({
    kicker: `${e.done ? 'Séance faite' : 'Au programme'} · ${dateShort(e.date || s.date)}`,
    title: s.title,
    stats,
    footer: `Objectif : ${store.plan.goal.label}.${e.rpe ? ` Ressenti ${e.rpe}/10.` : ''}`,
    accent: TYPE_COLOR[s.type] || '#3EE6A8',
    progress: { ratio: doneN / all.length, label: `Programme : ${doneN} séance${doneN > 1 ? 's' : ''} faite${doneN > 1 ? 's' : ''} sur ${all.length}, semaine ${s.week}/${store.plan.weeks.length}` },
  });
  return shareBlob(blob, `foulee-${s.id}.png`, `${s.title} avec Foulée`);
}

export async function shareActivity(id) {
  const a = store.activities.find((x) => x.id === id);
  if (!a) return null;
  const pace = (a.moving || a.elapsed) / (a.distance / 1000);
  const blob = await drawCard({
    kicker: `Sortie · ${dateShort(a.date)}`,
    title: a.name || 'Sortie',
    stats: [['Distance', `${km1(a.distance)} km`], ['Temps', clock(a.moving || a.elapsed)], ['Allure', `${clock(pace)}/km`]],
    footer: a.hrAvg ? `Fréquence cardiaque moyenne ${Math.round(a.hrAvg)}.` : 'Enregistrée avec Foulée.',
    accent: '#5AA9FF',
  });
  return shareBlob(blob, 'foulee-sortie.png', 'Ma sortie avec Foulée');
}

/* =========================================================
   Défis entre amis : un code à partager, sans compte ni serveur
   ========================================================= */

const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

function deviceId() {
  let id = store.tools.deviceId;
  if (!id) { id = Math.random().toString(36).slice(2, 10); store.saveTools({ deviceId: id }); }
  return id;
}

// Les sorties récupérées par la connexion Strava ne sont pas partagées : Strava l'interdit.
export function myMonth(t) {
  const month = t.slice(0, 7);
  const runs = allRuns().filter((r) => r.source !== 'api' && r.date.startsWith(month) && r.date <= t);
  const km = runs.reduce((s, r) => s + r.distance, 0) / 1000;
  const longest = runs.reduce((m, r) => Math.max(m, r.distance), 0) / 1000;
  const sessions = allSessions().filter((s) => s.date.startsWith(month) && s.date <= t);
  const done = sessions.filter((s) => store.entry(s.id)?.done).length;
  return {
    v: 1, id: deviceId(), n: store.tools.name || 'Moi', m: month,
    km: Math.round(km * 10) / 10, r: runs.length, l: Math.round(longest * 10) / 10,
    s: done, p: sessions.length, u: Date.now(),
  };
}

export function challengeLink(t) {
  return `${APP_URL}#/defi/${b64e(myMonth(t))}`;
}

export function importChallenge(code) {
  let c;
  try { c = b64d(code); } catch { return { ok: false, message: 'Ce lien de défi est abîmé.' }; }
  if (!c || c.v !== 1 || !c.id || typeof c.km !== 'number') return { ok: false, message: 'Ce lien de défi n’est pas reconnu.' };
  if (c.id === store.tools.deviceId) return { ok: true, message: 'C’est ton propre lien de défi.' };
  const friends = { ...(store.tools.friends || {}) };
  const prev = friends[c.id];
  if (prev && prev.u > c.u) return { ok: true, message: `Tu as déjà un résultat plus récent de ${c.n}.` };
  friends[c.id] = { n: String(c.n).slice(0, 24), m: c.m, km: c.km, r: c.r, l: c.l, s: c.s, p: c.p, u: c.u };
  store.saveTools({ friends });
  return { ok: true, message: `${c.n} ajouté à tes défis` };
}

export function removeFriend(id) {
  const friends = { ...(store.tools.friends || {}) };
  delete friends[id];
  store.saveTools({ friends });
}

export async function shareChallenge(t) {
  const url = challengeLink(t);
  const me = myMonth(t);
  const text = `${me.n} : ${me.km.toLocaleString('fr-FR')} km ce mois-ci sur Foulée. Ouvre le lien pour m’ajouter à tes défis, puis envoie-moi le tien.`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Défi Foulée', text, url }); return 'partagé'; } catch (e) { if (e.name === 'AbortError') return 'annulé'; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); return 'copié'; } catch { return url; }
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const monthName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export function viewDefis(t) {
  const me = myMonth(t);
  const friends = Object.entries(store.tools.friends || {});
  const rows = [{ id: 'me', ...me, me: true }, ...friends.map(([id, f]) => ({ id, ...f }))];
  const now = rows.filter((r) => r.m === me.m).sort((a, b) => b.km - a.km);
  const old = rows.filter((r) => r.m !== me.m);
  const max = Math.max(...now.map((r) => r.km), 1);
  const ago = (u) => {
    const d = Math.floor((Date.now() - u) / 86400000);
    return d <= 0 ? 'aujourd’hui' : d === 1 ? 'hier' : `il y a ${d} jours`;
  };
  return `
    <a class="back" href="#/course" data-back>Courir</a>
    <h1 class="page-title">Défis</h1>
    <p class="lede">Le classement des kilomètres de ${monthName(me.m)} entre amis. Envoie ton lien, et demande le leur : chacun reste maître de ses données, sans compte.</p>
    <label class="field"><span>Ton prénom dans les défis</span><input data-defi-name maxlength="24" autocomplete="given-name" value="${esc(store.tools.name || '')}" placeholder="Prénom"></label>
    <ol class="board">
      ${now.map((r, i) => `
        <li class="board-row${r.me ? ' is-me' : ''}">
          <span class="board-rank">${i + 1}</span>
          <span class="board-name">${esc(r.me ? `${r.n} (toi)` : r.n)}</span>
          <span class="board-km">${r.km.toLocaleString('fr-FR')} km</span>
          <span class="board-bar"><span style="width:${Math.round((r.km / max) * 100)}%"></span></span>
          <span class="board-sub">${r.r} sortie${r.r > 1 ? 's' : ''}${r.p ? ` · ${r.s}/${r.p} séances` : ''}${r.l ? ` · plus longue ${r.l.toLocaleString('fr-FR')} km` : ''}${r.me ? '' : ` · mis à jour ${ago(r.u)}`}</span>
          ${r.me ? '' : `<button class="board-del" data-defi-remove="${esc(r.id)}" aria-label="Retirer ${esc(r.n)}">×</button>`}
        </li>`).join('')}
    </ol>
    ${now.length < 2 ? `
      <div class="empty">
        <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 50h24M32 50V38M22 14h20v10a10 10 0 0 1-20 0zM22 18h-8a6 6 0 0 0 8 8M42 18h8a6 6 0 0 1-8 8"/></svg>
        <p>Personne encore. Partage ton lien : quand un ami l’ouvre, tu apparais chez lui. Quand il t’envoie le sien, il apparaît ici.</p>
      </div>` : ''}
    <div class="form-actions"><button class="btn btn-primary" data-defi-share>Partager mon lien de défi</button></div>
    <p class="hint">Les chiffres d’un ami se mettent à jour quand il te renvoie son lien. Les sorties récupérées par la connexion Strava ne sont pas partagées (règle de Strava) : seules comptent tes sorties Foulée, ton archive importée et tes comptes rendus.</p>
    ${old.length ? `
      <h2 class="section-title">Mois précédents</h2>
      <ul class="board board-old">${old.map((r) => `<li class="board-row"><span class="board-name">${esc(r.n)}</span><span class="board-km">${r.km.toLocaleString('fr-FR')} km</span><span class="board-sub">${monthName(r.m)}</span><button class="board-del" data-defi-remove="${esc(r.id)}" aria-label="Retirer ${esc(r.n)}">×</button></li>`).join('')}</ul>` : ''}`;
}

/* =========================================================
   Météo de la séance (Open-Meteo, gratuit, sans clé)
   ========================================================= */

const HOUR = { matin: 8, midi: 12, soir: 18, variable: 18 };
let wxMem = null;
let wxLoading = null;

function wxCode(c) {
  if (c === 0) return 'ciel clair';
  if (c <= 3) return 'nuageux';
  if (c === 45 || c === 48) return 'brouillard';
  if (c >= 51 && c <= 57) return 'bruine';
  if (c >= 61 && c <= 67) return 'pluie';
  if (c >= 71 && c <= 77) return 'neige';
  if (c >= 80 && c <= 82) return 'averses';
  if (c >= 95) return 'orage';
  return '';
}

export function weatherReady() { return !!store.tools.place; }

export function loadWeather(force = false) {
  const p = store.tools.place;
  if (!p) return Promise.resolve(null);
  const cached = wxMem || store.tools.wx;
  if (!force && cached && cached.lat === p.lat && cached.lon === p.lon && Date.now() - cached.at < 3600000) {
    wxMem = cached;
    return Promise.resolve(cached);
  }
  if (wxLoading) return wxLoading;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code&timezone=auto&forecast_days=7`;
  wxLoading = fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`météo ${r.status}`))))
    .then((d) => {
      const h = d.hourly;
      wxMem = { at: Date.now(), lat: p.lat, lon: p.lon, time: h.time, t: h.temperature_2m, f: h.apparent_temperature, r: h.precipitation_probability, w: h.wind_speed_10m, c: h.weather_code };
      store.saveTools({ wx: wxMem });
      return wxMem;
    })
    .catch(() => null)
    .finally(() => { wxLoading = null; });
  return wxLoading;
}

export function enableWeather() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve({ ok: false, message: 'Position indisponible sur cet appareil.' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Arrondi à 1 km environ : la météo n'a pas besoin de plus
        store.saveTools({ place: { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 } });
        loadWeather(true).then((w) => resolve({ ok: !!w, message: w ? 'Météo activée' : 'Météo indisponible pour le moment' }));
      },
      () => resolve({ ok: false, message: 'Autorise la position pour afficher la météo.' }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 },
    );
  });
}

export function weatherAt(date) {
  const w = wxMem || store.tools.wx;
  if (!w) return null;
  const hour = HOUR[store.tools.moment] ?? 18;
  const key = `${date}T${String(hour).padStart(2, '0')}:00`;
  const i = w.time.indexOf(key);
  if (i < 0) return null;
  return { hour, temp: w.t[i], feels: w.f[i], rain: w.r[i], wind: w.w[i], code: w.c[i] };
}

export function weatherAdvice(x) {
  const out = [];
  let heat = false;
  if (x.feels >= 24) { heat = true; out.push('Chaleur : ralentis de 10 à 20 s/km ou cours tôt, bois avant de partir, et juge l’effort plutôt que l’allure.'); } else if (x.feels >= 18) out.push('Temps doux : bois un peu plus que d’habitude.');
  if (x.feels <= 2) out.push('Froid : échauffe-toi à l’intérieur, couvre tête et mains, et laisse l’allure venir après 10 minutes.');
  if (x.wind >= 30) out.push('Vent fort : pars face au vent pour rentrer dos au vent, et cours à l’effort.');
  if (x.rain >= 60) out.push('Pluie probable : anti-frottement aux pieds, vêtement léger, et des chaussettes sèches pour après.');
  return { heat, text: out };
}

export function weatherBlock(s, t) {
  if (!s || store.entry(s.id)?.done) return '';
  if (!weatherReady()) {
    return `<button class="wx wx-off" data-wx-enable><span class="wx-ico">${SUN}</span><span><b>Météo de ta séance</b><small>Prévision à l’heure où tu cours, avec les conseils qui vont avec.</small></span></button>`;
  }
  if (daysBetween(t, s.date) > 6) return '';
  const x = weatherAt(s.date);
  if (!x) return wxMem || store.tools.wx ? '' : '<p class="wx wx-wait" data-wx-pending>Météo en cours de chargement…</p>';
  const adv = weatherAdvice(x);
  const label = wxCode(x.code);
  return `
    <section class="wx${adv.heat ? ' is-hot' : ''}">
      <span class="wx-ico">${x.rain >= 50 ? RAIN : SUN}</span>
      <div>
        <p class="wx-line"><b>${Math.round(x.temp)}°</b> ressenti ${Math.round(x.feels)}° · vent ${Math.round(x.wind)} km/h · pluie ${x.rain ?? 0} %</p>
        <p class="wx-sub">Vers ${x.hour} h${label ? `, ${label}` : ''}. ${adv.text.length ? esc(adv.text[0]) : 'Conditions idéales pour courir.'}</p>
        ${adv.text.slice(1).map((l) => `<p class="wx-sub">${esc(l)}</p>`).join('')}
        ${adv.heat && s.type !== 'test' && s.type !== 'objectif' ? `<button class="btn btn-small" data-wx-adapt="${s.id}">Adapter la séance à la chaleur</button>` : ''}
      </div>
    </section>`;
}

const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const RAIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 15z"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/></svg>';

/* =========================================================
   Chaussures : kilométrage et alerte d'usure
   ========================================================= */

export function shoes() { return store.tools.shoes || []; }

// Une sortie compte pour la paire en service à sa date (la plus récente si plusieurs).
function shoeOf(date, list) {
  return list
    .filter((x) => x.since <= date && (!x.until || x.until >= date))
    .sort((a, b) => (a.since < b.since ? 1 : -1))[0] || null;
}

export function shoeKm(runs = allRuns()) {
  const list = shoes();
  const km = Object.fromEntries(list.map((x) => [x.id, x.base || 0]));
  for (const r of runs) {
    const sh = shoeOf(r.date, list);
    if (sh) km[sh.id] += r.distance / 1000;
  }
  return km;
}

export function addShoe({ name, since, base }) {
  const list = shoes().slice();
  list.push({ id: Math.random().toString(36).slice(2, 9), name: name || 'Mes chaussures', since, until: null, base: base || 0 });
  store.saveTools({ shoes: list });
}

export function shoeAction(id, act, t) {
  let list = shoes().slice();
  if (act === 'retire') list = list.map((x) => (x.id === id ? { ...x, until: addDays(t, -1) < x.since ? x.since : addDays(t, -1) } : x));
  else if (act === 'revive') list = list.map((x) => (x.id === id ? { ...x, until: null } : x));
  else if (act === 'delete') list = list.filter((x) => x.id !== id);
  store.saveTools({ shoes: list });
}

export function shoesBlock(t) {
  const list = shoes();
  const km = shoeKm();
  const card = (x) => {
    const k = km[x.id] || 0;
    const pct = Math.min(100, (k / 800) * 100);
    const state = x.until ? 'Retirée' : k >= 800 ? 'À changer' : k >= 600 ? 'À surveiller' : 'En forme';
    const cls = x.until ? 'is-off' : k >= 800 ? 'is-bad' : k >= 600 ? 'is-warn' : 'is-ok';
    return `
      <li class="shoe ${cls}">
        <span class="shoe-name">${esc(x.name)}</span>
        <span class="shoe-km">${Math.round(k)} km</span>
        <span class="shoe-bar" aria-hidden="true"><span style="width:${pct}%"></span><i style="left:75%"></i></span>
        <span class="shoe-sub">${state} · depuis le ${dayMonth(x.since)}${x.until ? ` jusqu’au ${dayMonth(x.until)}` : ''}</span>
        <span class="shoe-acts">
          ${x.until ? `<button class="linkish" data-shoe-act="revive" data-shoe="${x.id}">Remettre en service</button>` : `<button class="linkish" data-shoe-act="retire" data-shoe="${x.id}">Retirer</button>`}
          <button class="linkish" data-shoe-act="delete" data-shoe="${x.id}">Supprimer</button>
        </span>
      </li>`;
  };
  return `
    <section class="analyse-block" data-shoes>
      <h2 class="section-title">Chaussures</h2>
      ${list.length ? `<ul class="shoes">${list.slice().sort((a, b) => (!!a.until - !!b.until) || (a.since < b.since ? 1 : -1)).map(card).join('')}</ul>
        <p class="hint">Une paire amortit bien jusqu’à 600 à 800 km environ. Au-delà, change-la, surtout si des douleurs apparaissent.</p>` : '<p class="hint">Ajoute ta paire : chaque sortie y est comptée, et Foulée te prévient vers 600 km.</p>'}
      <details class="shoe-add"${list.length ? '' : ' open'}>
        <summary>Ajouter une paire</summary>
        <form data-shoe-form>
          <label class="field"><span>Nom</span><input name="name" maxlength="40" placeholder="Ex. Pegasus bleues" autocomplete="off"></label>
          <div class="field-row">
            <label class="field"><span>En service depuis</span><input type="date" name="since" value="${t}" max="${t}"></label>
            <label class="field"><span>Km déjà faits</span><span class="unit-input"><input name="base" inputmode="numeric" autocomplete="off" placeholder="0"><em>km</em></span></label>
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Ajouter</button></div>
        </form>
      </details>
    </section>`;
}

export function shoeNotice() {
  const km = shoeKm();
  const worn = shoes().find((x) => !x.until && (km[x.id] || 0) >= 700);
  return worn ? `<a class="notice" href="#/analyse">Tes chaussures « ${esc(worn.name)} » ont ${Math.round(km[worn.id])} km : pense à les changer bientôt.</a>` : '';
}

/* =========================================================
   Journal des douleurs
   ========================================================= */

export const PAIN_ZONES = [['genou', 'Genou'], ['tibia', 'Tibia'], ['mollet', 'Mollet, tendon d’Achille'], ['pied', 'Pied, cheville'], ['hanche', 'Hanche, fessier'], ['dos', 'Dos'], ['autre', 'Autre']];
export const PAIN_LEVEL = [[1, 'Gêne légère'], [2, 'Change ma foulée'], [3, 'Forte, j’ai dû arrêter']];
const zoneName = (z) => PAIN_ZONES.find(([k]) => k === z)?.[1] || z;

export function painFields(e) {
  const p = e.pain || {};
  return `
    <fieldset class="pain">
      <legend>Une douleur pendant ou après ?</legend>
      <div class="chips">
        <label class="chip-radio"><input type="radio" name="pain_zone" value="" ${!p.zone ? 'checked' : ''}><span>Aucune</span></label>
        ${PAIN_ZONES.map(([k, l]) => `<label class="chip-radio"><input type="radio" name="pain_zone" value="${k}" ${p.zone === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <div class="chips pain-level">
        ${PAIN_LEVEL.map(([v, l]) => `<label class="chip-radio"><input type="radio" name="pain_level" value="${v}" ${p.level === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
    </fieldset>`;
}

export function readPain(fd) {
  const zone = fd.get('pain_zone');
  if (!zone) return null;
  return { zone, level: Number(fd.get('pain_level')) || 1 };
}

function painEntries() {
  return allSessions()
    .map((s) => ({ s, e: store.entry(s.id) }))
    .filter(({ e }) => e?.pain?.zone)
    .map(({ s, e }) => ({ date: e.date || s.date, title: s.title, id: s.id, ...e.pain }));
}

export function painNotice(t) {
  const recent = painEntries().filter((p) => p.date <= t && daysBetween(p.date, t) <= 21);
  if (!recent.length) return '';
  const byZone = {};
  recent.forEach((p) => { (byZone[p.zone] ||= []).push(p); });
  const [zone, list] = Object.entries(byZone).sort((a, b) => b[1].length - a[1].length)[0];
  const strong = list.some((p) => p.level >= 2);
  if (list.length < 2 && !strong) return '';
  const msg = list.length >= 2
    ? `${zoneName(zone)} : douleur notée ${list.length} fois en 3 semaines. Elle revient : allège les prochaines séances (bouton « J’ai mal » de la séance) et consulte si elle dure plus d’une semaine.`
    : `${zoneName(zone)} : douleur qui change ta foulée. Passe la prochaine séance en footing très facile ou en repos, et consulte si elle ne passe pas.`;
  return `<a class="notice notice-pain" href="#/conseil/blessures">${esc(msg)}</a>`;
}

export function painBlock() {
  const list = painEntries().slice(-8).reverse();
  if (!list.length) return '';
  return `
    <section class="analyse-block">
      <h2 class="section-title">Journal des douleurs</h2>
      <ul class="runs">${list.map((p) => `<li><a href="#/seance/${p.id}"><span class="run-date">${dateShort(p.date)}</span><span class="run-name">${esc(zoneName(p.zone))} · ${esc(PAIN_LEVEL.find(([v]) => v === p.level)?.[1] || '')}</span><span class="run-figs">${esc(p.title)}</span></a></li>`).join('')}</ul>
      <p class="hint">Une douleur qui revient au même endroit, ou qui change ta foulée, est le premier signe d’une blessure : allège avant qu’elle ne t’arrête.</p>
    </section>`;
}

/* =========================================================
   Zones cardiaques
   ========================================================= */

export function fcMax() {
  if (store.tools.fcMax) return { v: store.tools.fcMax, src: 'saisie' };
  const seen = store.activities.map((a) => a.hrMax || 0).filter((v) => v >= 150 && v <= 220);
  if (seen.length) return { v: Math.max(...seen), src: 'mesurée' };
  return null;
}

export function hrZones(max) {
  return [
    ['Facile', 'Footings, sortie longue', 0.6, 0.79],
    ['Seuil', 'Tempo, seuil', 0.8, 0.88],
    ['Intervalles', 'Fractionné, tests', 0.89, 1],
  ].map(([name, use, a, b]) => ({ name, use, lo: Math.round(max * a), hi: Math.round(max * b) }));
}

export function easyHrCap() {
  const m = fcMax();
  return m ? Math.round(m.v * 0.79) : null;
}

export function hrBlock(runs) {
  const m = fcMax();
  const withHr = runs.filter((r) => r.hrAvg).slice(-20);
  if (!m && !withHr.length) return '';
  const Z = m ? hrZones(m.v) : null;
  let dist = '';
  if (Z && withHr.length >= 3) {
    const easyN = withHr.filter((r) => r.hrAvg <= Z[0].hi).length;
    const pct = Math.round((easyN / withHr.length) * 100);
    dist = `<p class="hr-mix"><b>${pct} %</b> de tes ${withHr.length} dernières sorties en zone facile (fréquence moyenne). ${pct >= 70 ? 'Bon dosage.' : 'Trop peu : ralentis tes footings, ce sont eux qui construisent l’endurance.'}</p>`;
  }
  return `
    <section class="analyse-block" data-hr>
      <h2 class="section-title">Zones cardiaques</h2>
      <label class="field"><span>Fréquence cardiaque maximale</span>
        <span class="unit-input"><input data-hr-max inputmode="numeric" maxlength="3" autocomplete="off" value="${store.tools.fcMax || ''}" placeholder="${m ? m.v : 'ex. 185'}"><em>bpm</em></span>
      </label>
      ${m ? `<p class="hint">${m.src === 'mesurée' ? `${m.v} bpm, la plus haute valeur vue dans tes sorties. Saisis ta vraie FC max si tu la connais (mesurée lors d’un test à fond).` : 'Valeur saisie.'}</p>` : '<p class="hint">Indique ta FC max (mesurée à fond, en fin de test) pour calculer tes zones.</p>'}
      ${Z ? `<table class="table zones-table"><tbody>${Z.map((z) => `<tr><th scope="row">${z.name}<small>${z.use}</small></th><td>${z.lo}–${z.hi} bpm</td></tr>`).join('')}</tbody></table>` : ''}
      ${dist}
      <p class="hint">Repères en pourcentage de la FC max. La fréquence met 2 à 3 minutes à monter : sur les fractions courtes, fie-toi plutôt à l’allure.</p>
    </section>`;
}

/* =========================================================
   Sauvegarde
   ========================================================= */

export async function shareBackup(json, name) {
  store.saveTools({ lastBackup: Date.now() });
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Sauvegarde Foulée' }); return 'partagé'; } catch (e) { if (e.name === 'AbortError') return 'annulé'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'téléchargé';
}

export function backupNotice() {
  if (!store.plan) return '';
  const logged = Object.keys(store.log).length;
  if (logged < 3) return '';
  const last = store.tools.lastBackup || 0;
  const days = Math.floor((Date.now() - last) / 86400000);
  if (last && days < 14) return '';
  return `
    <div class="notice notice-backup">
      <span>${last ? `Dernière sauvegarde il y a ${days} jours.` : 'Tu n’as encore jamais sauvegardé ton suivi.'} Garde une copie dans Fichiers ou iCloud Drive : si le téléphone est perdu, tout se restaure.</span>
      <button class="btn btn-small" data-backup-share>Sauvegarder maintenant</button>
    </div>`;
}

/* =========================================================
   Premiers pas
   ========================================================= */

export function firstSteps() {
  if (!store.plan || store.tools.onboarded) return '';
  return `
    <section class="first">
      <header><h2 class="section-title">Premiers pas</h2><button class="first-close" data-onboard-done aria-label="Masquer les premiers pas">×</button></header>
      <ol>
        <li><button class="linkish" data-ics-all>Ajoute tes séances au calendrier</button><small>Une alerte la veille de chaque séance.</small></li>
        <li><a href="#/parcours">Trouve une boucle autour de chez toi</a><small>À la bonne distance, sans aller-retour.</small></li>
        <li><a href="#/conseils">Règle ton profil</a><small>Poids et alimentation, pour des conseils en portions.</small></li>
        <li><a href="#/defis">Défie tes amis</a><small>Le classement des kilomètres du mois.</small></li>
      </ol>
    </section>`;
}

/* =========================================================
   Anneau de la semaine
   ========================================================= */

export function weekRing(ctx) {
  if (!ctx.started || ctx.finished) return '';
  const sess = ctx.sessions.filter((s) => s.week === ctx.weekNow);
  if (!sess.length) return '';
  const done = sess.filter(ctx.done).length;
  const r = 17, c = 2 * Math.PI * r;
  const f = done / sess.length;
  return `
    <a class="ring" href="#/programme" aria-label="Cette semaine : ${done} séance${done > 1 ? 's' : ''} sur ${sess.length}">
      <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" class="ring-bg"/><circle cx="22" cy="22" r="${r}" class="ring-fg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 22 22)"/></svg>
      <b>${done}/${sess.length}</b>
    </a>`;
}

/* =========================================================
   La semaine en un coup d'œil (Aujourd'hui)
   ========================================================= */

const DAY1 = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function weekDays(ctx) {
  if (ctx.finished) return '';
  const w = Math.max(1, Math.min(ctx.plan.weeks.length, ctx.weekNow || 1));
  const from = addDays(ctx.plan.start, (w - 1) * 7);
  const cells = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(from, i);
    const s = ctx.sessions.find((x) => x.date === d);
    const done = s && ctx.done(s);
    const late = s && !done && d < ctx.t;
    const inner = `<small>${DAY1[parseISO(d).getDay()]}</small><b>${parseISO(d).getDate()}</b><span class="wd-dot${s ? ` t-${s.type}` : ''}${done ? ' is-done' : ''}${late ? ' is-late' : ''}">${done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>' : ''}</span>`;
    const cls = `wd${d === ctx.t ? ' is-today' : ''}${s ? ' has-s' : ''}`;
    cells.push(s
      ? `<a class="${cls}" href="#/seance/${s.id}" aria-label="${esc(`${dateLong(d)} : ${s.title}${done ? ', faite' : ''}`)}">${inner}</a>`
      : `<span class="${cls}" aria-label="${esc(`${dateLong(d)} : repos`)}">${inner}</span>`);
  }
  return `<nav class="wdays" aria-label="Ta semaine">${cells.join('')}</nav>`;
}

/* =========================================================
   Vue du mois
   ========================================================= */

const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function monthView(ctx, month) {
  const first = parseISO(`${month}-01`);
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(`${month}-01`, -lead);
  const byDate = {};
  ctx.sessions.forEach((s) => { (byDate[s.date] ||= []).push(s); });
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = addDays(start, i);
    if (i >= 35 && !d.startsWith(month)) break;
    const list = byDate[d] || [];
    const inMonth = d.startsWith(month);
    const s = list[0];
    const done = s && ctx.done(s);
    const late = s && !done && d < ctx.t;
    const inner = `<span class="cal-n">${parseISO(d).getDate()}</span>${s ? `<span class="cal-dot t-${s.type}${done ? ' is-done' : ''}${late ? ' is-late' : ''}"></span>` : ''}`;
    cells.push(s
      ? `<a class="cal-day${inMonth ? '' : ' is-out'}${d === ctx.t ? ' is-today' : ''}" href="#/seance/${s.id}" aria-label="${esc(`${dateLong(d)} : ${s.title}${done ? ', faite' : ''}`)}">${inner}</a>`
      : `<span class="cal-day${inMonth ? '' : ' is-out'}${d === ctx.t ? ' is-today' : ''}">${inner}</span>`);
  }
  const monthSess = ctx.sessions.filter((s) => s.date.startsWith(month));
  const doneN = monthSess.filter(ctx.done).length;
  const prev = toISO(new Date(first.getFullYear(), first.getMonth() - 1, 1)).slice(0, 7);
  const next = toISO(new Date(first.getFullYear(), first.getMonth() + 1, 1)).slice(0, 7);
  return `
    <section class="cal">
      <header class="cal-head">
        <button class="cal-nav" data-cal="${prev}" aria-label="Mois précédent">‹</button>
        <h2>${monthName(month)}</h2>
        <button class="cal-nav" data-cal="${next}" aria-label="Mois suivant">›</button>
      </header>
      <div class="cal-grid">${WD.map((w) => `<span class="cal-wd">${w}</span>`).join('')}${cells.join('')}</div>
      <p class="cal-sum">${monthSess.length ? `${doneN} séance${doneN > 1 ? 's' : ''} faite${doneN > 1 ? 's' : ''} sur ${monthSess.length} ce mois-ci.` : 'Pas de séance ce mois-ci.'}</p>
      <p class="legend"><span class="lg-c t-facile"></span>footing <span class="lg-c t-longue"></span>longue <span class="lg-c t-qualite"></span>qualité <span class="lg-c t-test"></span>test</p>
    </section>`;
}

export { km1 };
