// Éléments d'interface partagés : cartes de séance, estimation du chrono, série, bilan, semaines.
import { weekExtras } from './extra.js';
import { store, allSessions } from './store.js';
import { totalTime } from './steps.js';
import { sessionDistance } from './routes.js';
import { raceTime } from './coach.js';
import { clock, daysBetween, dateShort, esc, addDays, distance as fmtDist } from './util.js';

/* ---------- Icônes hexagonales ---------- */

const GLYPH = {
  facile: '<path d="M8 15c2-1 3-4 5-4s2 2 4 2"/><circle cx="12" cy="8" r="1.6"/>',
  longue: '<path d="M7 17l3-10M17 17l-3-10M12 9v1.5M12 13v1.5"/>',
  qualite: '<path d="M13 6l-4 7h3l-1 5 4-7h-3z"/>',
  test: '<circle cx="12" cy="13" r="4.5"/><path d="M12 13v-2.5M10.5 7h3"/>',
  objectif: '<path d="M9 18V7M9 7h7l-1.5 2.5L16 12H9"/>',
  repos: '<path d="M8 12h8"/>',
};

export function hexIcon(type, extra = '') {
  return `<svg class="hex ${extra}" viewBox="0 0 24 24" aria-hidden="true"><path class="hex-shape" d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><g class="hex-glyph">${GLYPH[type] || GLYPH.facile}</g></svg>`;
}

/* ---------- Chiffres d'une séance ---------- */

function zonesIn(steps, out = new Set()) {
  for (const st of steps) {
    if (st.k === 'repeat') zonesIn(st.steps, out);
    else if (st.k === 'work') out.add(st.z || (st.pace ? 'T' : 'S'));
  }
  return out;
}

export function difficulty(s) {
  if (s.type === 'test' || s.type === 'objectif') return ['Maximal', 'max'];
  const z = zonesIn(s.steps);
  if (z.has('I') || z.has('R')) return ['Très difficile', 'hard2'];
  if (z.has('G') || z.has('T')) return [s.type === 'longue' ? 'Modéré' : 'Difficile', 'hard'];
  if (s.type === 'longue') return ['Facile', 'easy'];
  return [z.size ? 'Facile' : 'Très facile', 'easy0'];
}

function mainPace(steps) {
  let pace = null;
  const walk = (list) => list.forEach((st) => {
    if (st.k === 'repeat') walk(st.steps);
    else if (st.k === 'work' && st.pace && !pace) pace = st.pace;
  });
  walk(steps);
  if (!pace) steps.forEach((st) => { if (st.k === 'run' && st.pace && !pace) pace = st.pace; });
  return pace;
}

export function sessionStats(s, plan = store.plan) {
  const min = Math.round(totalTime(s.steps) / 60);
  const km = sessionDistance(s, plan) / 1000;
  const pace = mainPace(s.steps);
  return {
    dur: min >= 60 ? `${Math.floor(min / 60)}H${String(min % 60).padStart(2, '0')}` : `${min}MIN`,
    dist: km ? `${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}KM` : '–',
    pace: pace ? clock(pace[0]) : '–',
  };
}

export function statsRow(s, done) {
  const st = sessionStats(s);
  const e = done ? store.entry(s.id) : null;
  const km = (x) => `${Number(x).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}KM`;
  const cells = e && (e.duration || e.distance)
    ? [['Durée', e.duration ? clock(e.duration) : '–'], ['Distance', e.distance ? km(e.distance) : '–'], [e.rpe ? `Allure · ${e.rpe}/10` : 'Allure', e.duration && e.distance ? clock(e.duration / e.distance) : '–']]
    : [['Durée', st.dur], ['Distance', st.dist], ['Allure', st.pace]];
  return `<dl class="srow">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

/* ---------- Carte de séance ---------- */

// Dernière séance cochée : sa coche s'anime une fois
let justDone = null;
export function markJustDone(id) { justDone = id; setTimeout(() => { if (justDone === id) justDone = null; }, 1200); }

export function sessionCard(s, ctx, { featured = false } = {}) {
  const e = store.entry(s.id);
  const isDone = !!e?.done;
  const isToday = s.date === ctx.t;
  const tomorrow = s.date === addDays(ctx.t, 1);
  const late = !isDone && s.date < ctx.t;
  const [diff, dcls] = difficulty(s);
  const when = isToday ? 'Aujourd’hui' : tomorrow ? 'Demain' : dateShort(s.date);
  return `
    <li class="scard t-${s.type}${featured ? ' is-featured' : ''}${isDone ? ' is-done' : ''}${late ? ' is-late' : ''}${isDone && justDone === s.id ? ' just-done' : ''}">
      <a class="scard-link" href="#/seance/${s.id}">
        ${hexIcon(s.type)}
        <span class="scard-when${isToday || tomorrow ? ' is-soon' : ''}">${when}${late ? ' · pas cochée' : ''}${s.adapted ? ' · adaptée' : ''}</span>
        <span class="scard-diff d-${dcls}">${diff}</span>
        <span class="scard-title">${esc(s.title)}</span>
        ${statsRow(s, isDone)}
      </a>
      <button class="check" data-toggle="${s.id}" aria-pressed="${isDone}" aria-label="${isDone ? 'Décocher' : 'Cocher'} ${esc(s.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>
      </button>
    </li>`;
}

/* ---------- Estimation du chrono ---------- */

export function estimate(ctx) {
  const plan = ctx.plan;
  const c = plan?.coach;
  const dist = plan?.goal?.distance;
  if (!c || !dist) return null;
  const total = plan.weeks.length;
  const f = Math.max(0, Math.min(1, (daysBetween(plan.start, ctx.t) + 1) / (total * 7)));
  const reg = ctx.dueCount ? ctx.doneCount / ctx.dueCount : 1;
  const tests = ctx.sessions.filter((s) => (s.type === 'test' || s.type === 'objectif') && store.entry(s.id)?.time3k).length;
  // Progrès encore attendu, pondéré par la régularité
  const projected = c.vdot + Math.max(0, c.vdotGoal - c.vdot) * Math.min(1, reg);
  const spread = 0.015 + (1 - f) * 0.03 + (c.estimated && !tests ? 0.02 : 0) + (1 - Math.min(1, reg)) * 0.03;
  const best = raceTime(projected, dist);
  const worst = best * (1 + spread);
  const confidence = Math.round(Math.min(95, 15 + f * 45 * Math.min(1, reg) + tests * 12 + (c.estimated ? 0 : 10)));
  return { best, worst, confidence, dist, goal: plan.goal.time };
}

const fmtRace = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}H${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}` : clock(Math.round(sec / 5) * 5));

export function estimateCard(ctx) {
  const est = estimate(ctx);
  if (!est) return '';
  const km = est.dist >= 42195 ? '42' : est.dist >= 21097 ? '21' : String(Math.round(est.dist / 1000));
  const ok = est.goal ? est.best <= est.goal : null;
  return `
    <a class="est" href="#/programme">
      <span class="est-label">Estimation jour J</span>
      <span class="est-time">${fmtRace(est.best)}–${fmtRace(est.worst)}</span>
      <span class="est-bar"><span style="width:${est.confidence}%"></span></span>
      <span class="est-conf"><b>${est.confidence} %</b> de fiabilité${est.goal ? ` · objectif ${fmtRace(est.goal)} ${ok ? 'en vue' : 'à aller chercher'}` : ''}</span>
      <span class="est-badge">${hexIcon('objectif', 'hex-big')}<b>${km}</b><small>KM</small></span>
    </a>`;
}

/* ---------- Série et bilan ---------- */

export function streak(ctx) {
  const past = ctx.sessions.filter((s) => s.date <= ctx.t);
  let n = 0;
  for (let i = past.length - 1; i >= 0; i -= 1) {
    if (ctx.done(past[i])) n += 1;
    else if (past[i].date === ctx.t) continue; // la séance du jour n'est pas encore « ratée »
    else break;
  }
  return n;
}

export function streakPill(ctx) {
  const n = streak(ctx);
  return `<span class="pill-streak" title="Séances faites d’affilée"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3-1-3 0-6 0-8z"/></svg>${n}</span>`;
}

export function weekReview(ctx) {
  const w = ctx.weekNow - 1;
  if (w < 1 || w > ctx.plan.weeks.length) return '';
  const sess = ctx.sessions.filter((s) => s.week === w);
  const done = sess.filter(ctx.done);
  const extras = weekExtras(w);
  const km = done.reduce((s, x) => s + (store.entry(x.id)?.distance || 0), 0) + extras.reduce((s, a) => s + a.distance / 1000, 0);
  const min = (done.reduce((s, x) => s + (store.entry(x.id)?.duration || 0), 0) + extras.reduce((s, a) => s + (a.moving || a.elapsed || 0), 0)) / 60;
  const all = done.length === sess.length;
  const msg = all ? 'Semaine complète. C’est la régularité qui fait progresser.'
    : done.length ? 'Pas grave : reprends simplement le programme cette semaine, sans rattraper.'
      : 'Semaine blanche : reprends en douceur, sans rattraper les séances manquées.';
  return `
    <section class="review">
      <h2 class="review-title">Bilan semaine ${w}</h2>
      <dl class="srow">
        <div><dt>Séances</dt><dd>${done.length}/${sess.length}${extras.length ? ` +${extras.length}` : ''}</dd></div>
        <div><dt>Distance</dt><dd>${km ? `${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}KM` : '–'}</dd></div>
        <div><dt>Temps</dt><dd>${min ? (min >= 60 ? `${Math.floor(min / 60)}H${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)}MIN`) : '–'}</dd></div>
      </dl>
      <p>${msg}${extras.length ? ` Distance et temps comptent ${extras.length > 1 ? `tes ${extras.length} sorties` : 'ta sortie'} en plus du programme.` : ''}</p>
    </section>`;
}

/* ---------- Bandeau des semaines ---------- */

export function weekStrip(ctx) {
  return `
    <nav class="wstrip" aria-label="Semaines">
      ${ctx.plan.weeks.map((w) => {
        const sess = ctx.sessions.filter((s) => s.week === w.n);
        const r = sess.length ? sess.filter(ctx.done).length / sess.length : 0;
        const peak = Math.max(...ctx.plan.weeks.map((x) => x.minutes || 0));
        return `<a href="#semaine-${w.n}" data-week-jump="${w.n}" class="wchip${w.n === ctx.weekNow ? ' is-now' : ''}${r === 1 ? ' is-full' : ''}">
          <small>SEM</small><b>${w.n}</b><span class="wchip-bar"><span style="width:${Math.round(r * 100)}%"></span></span>${w.minutes && w.minutes === peak ? '<i>pic</i>' : ''}</a>`;
      }).join('')}
    </nav>`;
}

export function weekLabel(w, plan) {
  const peak = Math.max(...plan.weeks.map((x) => x.minutes || 0));
  if (w.sessions.some((s) => s.type === 'objectif')) return 'Semaine de course';
  if (w.sessions.some((s) => s.type === 'test')) return 'Semaine de test';
  if (w.minutes && w.minutes === peak) return 'Semaine pic';
  if (w.light) return 'Semaine allégée';
  return null;
}

/* ---------- Records (Analyse) ---------- */

export function records(runs) {
  if (!runs.length) return '';
  const pace = (r) => (r.moving || r.elapsed) / (r.distance / 1000);
  const longest = runs.reduce((a, b) => (b.distance > a.distance ? b : a));
  const fast = runs.filter((r) => r.distance >= 3000).reduce((a, b) => (!a || pace(b) < pace(a) ? b : a), null);
  const totalKm = runs.reduce((s, r) => s + r.distance, 0) / 1000;
  const tests = allSessions().filter((s) => (s.type === 'test' || s.type === 'objectif') && store.entry(s.id)?.time3k);
  const best = tests.length ? tests.reduce((a, b) => (store.entry(b.id).time3k / (b.testDist || 3000) < store.entry(a.id).time3k / (a.testDist || 3000) ? b : a)) : null;
  const cells = [
    ['Plus longue sortie', `${(longest.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`, dateShort(longest.date)],
    fast ? ['Meilleure allure (3 km et plus)', `${clock(pace(fast))}/km`, dateShort(fast.date)] : null,
    best ? [`Meilleur test ${fmtDist(best.testDist || 3000)}`, clock(store.entry(best.id).time3k), dateShort(best.date)] : null,
    ['Total parcouru', `${Math.round(totalKm)} km`, `${runs.length} sorties`],
  ].filter(Boolean);
  return `
    <section class="analyse-block">
      <h2 class="section-title">Records</h2>
      <ul class="records">${cells.map(([k, v, d]) => `<li>${hexIcon('objectif')}<span class="rec-k">${k}</span><span class="rec-v">${v}</span><span class="rec-d">${d}</span></li>`).join('')}</ul>
    </section>`;
}
