// Sorties hors programme : saisie à la main, place dans le programme et prise en compte par le coach.
import { store, allSessions } from './store.js';
import { totalTime } from './steps.js';
import { addDays, clock, dateShort, daysBetween, esc } from './util.js';

const HARD = new Set(['qualite', 'test', 'objectif']);

// Numéro de semaine du programme pour une date (null hors programme)
export function weekOf(date) {
  const plan = store.plan;
  if (!plan || date < plan.start) return null;
  const n = Math.floor(daysBetween(plan.start, date) / 7) + 1;
  return n <= plan.weeks.length ? n : null;
}

// Séances que la sortie peut remplacer : celles de sa semaine pas encore faites, ou déjà rattachées à elle.
export function placementOptions(date, activityId = null) {
  const n = weekOf(date);
  if (!n) return [];
  return allSessions().filter((s) => {
    if (s.week !== n) return false;
    const e = store.entry(s.id);
    return !e?.done || (activityId && e.activityId === activityId);
  });
}

export function linkedSession(activityId) {
  return allSessions().find((s) => store.entry(s.id)?.activityId === activityId) || null;
}

export function placementField(date, activityId = null) {
  const opts = placementOptions(date, activityId);
  const current = activityId ? linkedSession(activityId)?.id || '' : '';
  const radio = (v, label, sub) => `
    <label class="place-opt"><input type="radio" name="place" value="${v}" ${current === v ? 'checked' : ''}>
      <span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
  return `
    <fieldset class="place" data-place>
      <legend>Dans mon programme</legend>
      ${radio('', 'En plus du programme', 'Les séances prévues restent à faire. La sortie compte dans ta charge de la semaine.')}
      ${opts.map((s) => radio(s.id, `À la place de : ${esc(s.title)}`, `${dateShort(s.date)} · la séance sera cochée`)).join('')}
      ${store.plan && !opts.length && weekOf(date) ? '<p class="hint">Toutes les séances de cette semaine sont déjà faites.</p>' : ''}
    </fieldset>`;
}

/* ---------- Charge de la semaine ---------- */

// Sorties en plus du programme pendant une semaine du programme
export function weekExtras(n) {
  const plan = store.plan;
  if (!plan) return [];
  const from = addDays(plan.start, (n - 1) * 7);
  const to = addDays(from, 6);
  const all = store.activities;
  const byId = Object.fromEntries(all.map((a) => [a.id, a]));
  const twinned = new Set(all.filter((a) => a.twin && byId[a.twin]).map((a) => a.twin));
  // Une même sortie arrivée deux fois n'est comptée qu'une fois (on garde la copie Strava)
  const dup = (a) => (a.twin && byId[a.twin] ? byId[a.twin].source !== 'gps' : a.source === 'gps' && twinned.has(a.id));
  return all.filter((a) => a.extra && a.date >= from && a.date <= to && !dup(a));
}

export function extrasList(n) {
  const list = weekExtras(n);
  if (!list.length) return '';
  return `
    <ul class="extras">
      ${list.map((a) => `<li><a href="#/sortie/${encodeURIComponent(a.id)}">
        <span class="extra-tag">En plus</span>
        <span class="extra-name">${esc(a.name)} · ${dateShort(a.date)}</span>
        <span class="extra-figs">${(a.distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km · ${clock(a.moving || a.elapsed)}</span>
      </a></li>`).join('')}
    </ul>`;
}

// Minutes courues dans la semaine : séances faites + sorties en plus
export function weekMinutes(n) {
  const sess = allSessions().filter((s) => s.week === n);
  const done = sess.reduce((t, s) => t + (store.entry(s.id)?.done ? (store.entry(s.id).duration || totalTime(s.steps)) : 0), 0);
  const extra = weekExtras(n).reduce((t, a) => t + (a.moving || a.elapsed || 0), 0);
  return { done: done / 60, extra: extra / 60 };
}

/* ---------- Conseil du coach après une sortie en plus ---------- */

export function extraNotice(ctx) {
  if (ctx.empty || !ctx.started || ctx.finished) return '';
  const recent = weekExtras(ctx.weekNow).concat(ctx.weekNow > 1 ? weekExtras(ctx.weekNow - 1) : [])
    .filter((a) => a.date <= ctx.t && daysBetween(a.date, ctx.t) <= 1)
    .sort((a, b) => (a.start < b.start ? 1 : -1));
  const last = recent[0];
  const next = ctx.next;
  const tips = [];
  if (last && next) {
    const gap = daysBetween(last.date, next.date);
    const when = last.date === ctx.t ? 'aujourd’hui' : 'hier';
    if (HARD.has(next.type) && gap <= 1 && next.type !== 'objectif') {
      tips.push(next.type === 'test'
        ? `Tu as couru en plus ${when}, et ton test (${esc(next.title)}) tombe${gap === 0 ? ' le même jour' : ' dès le lendemain'}. Un test se court reposé : décale-le d’un ou deux jours dans la semaine, sinon ton chrono sera faussé.`
        : `Tu as couru en plus ${when}, et ta prochaine séance (${esc(next.title)}) est dure${gap === 0 ? ' le même jour' : ' dès le lendemain'}. Décale-la d’un jour si ta semaine le permet, ou choisis « Je suis fatigué » pour l’alléger.`);
    } else if (next.type === 'longue' && gap <= 1) {
      tips.push(`Tu as couru en plus ${when} : pars très doucement sur ta sortie longue, et raccourcis-la si les jambes sont lourdes.`);
    } else if (last.rpe >= 7) {
      tips.push(`Ta sortie en plus d’${when} était soutenue (${last.rpe}/10). Ta prochaine séance se court sans forcer.`);
    }
  }
  const w = ctx.plan.weeks.find((x) => x.n === ctx.weekNow);
  const { done, extra } = weekMinutes(ctx.weekNow);
  if (w?.minutes && extra && done + extra > w.minutes * 1.2) {
    tips.push(`Cette semaine : ${Math.round(done + extra)} min courues pour ${w.minutes} prévues. C’est bien d’avoir envie, mais garde les footings vraiment faciles : la progression vient de la récupération.`);
  }
  if (!tips.length) return '';
  return `
    <section class="coach coach-extra">
      <p class="coach-kicker">Coach</p>
      <h2 class="coach-title">Sortie en plus prise en compte</h2>
      ${tips.map((t) => `<p class="coach-text">${t}</p>`).join('')}
      ${next && HARD.has(next.type) && next.type !== 'objectif' ? `<a class="btn btn-small" href="#/seance/${next.id}">Voir la séance</a>` : ''}
    </section>`;
}
