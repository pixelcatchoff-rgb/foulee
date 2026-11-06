import { store, allSessions, findSession, phaseOf } from './store.js';
import { describe, watchGuide, totalTime } from './steps.js';
import { viewTools, bindTools } from './tools.js';
import {
  todayISO, daysBetween, dateLong, dateShort, dayMonth, clock, duration, parseClock, esc, addDays, rangeLabel,
} from './util.js';

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');

// Pour tester : ?today=2026-12-10 simule une autre date.
const forcedToday = new URLSearchParams(location.search).get('today');
const today = () => forcedToday || todayISO();

const TYPE = {
  facile: { label: 'Footing', cls: 't-easy' },
  longue: { label: 'Sortie longue', cls: 't-long' },
  qualite: { label: 'Qualité', cls: 't-quality' },
  test: { label: 'Test 3 km', cls: 't-test' },
  objectif: { label: 'Objectif', cls: 't-goal' },
};

/* ---------- Données dérivées ---------- */

function context() {
  const plan = store.plan;
  const sessions = allSessions(plan);
  const t = today();
  const done = (s) => !!store.entry(s.id)?.done;
  const last = sessions[sessions.length - 1];
  const weekNow = Math.floor(daysBetween(plan.start, t) / 7) + 1;
  return {
    plan, sessions, t, done,
    weekNow,
    started: t >= plan.start,
    finished: t > last.date,
    goalDate: last.date,
    todaySession: sessions.find((s) => s.date === t),
    next: sessions.find((s) => s.date >= t && !done(s)),
    missed: sessions.filter((s) => s.date < t && !done(s)),
    doneCount: sessions.filter(done).length,
    dueCount: sessions.filter((s) => s.date <= t).length,
  };
}

/* ---------- Couloir de progression ---------- */

function lane(ctx) {
  const { plan } = ctx;
  const n = plan.weeks.length;
  const W = 340, x0 = 14, x1 = W - 14;
  const xOf = (week) => x0 + ((week - 1) / (n - 1)) * (x1 - x0);
  const totalDays = daysBetween(plan.start, ctx.goalDate);
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(plan.start, ctx.t)));
  const xNow = x0 + (elapsed / totalDays) * (x1 - x0);

  const bars = plan.weeks.map((w) => {
    const sess = ctx.sessions.filter((s) => s.week === w.n);
    const ratio = sess.filter(ctx.done).length / sess.length;
    const x = xOf(w.n);
    const hasTest = sess.some((s) => s.type === 'test');
    const h = 22;
    return `
      <rect x="${x - 4}" y="${8}" width="8" height="${h}" rx="2" class="lane-slot${w.light ? ' is-light' : ''}"/>
      ${ratio > 0 ? `<rect x="${x - 4}" y="${8 + h * (1 - ratio)}" width="8" height="${h * ratio}" rx="2" class="lane-fill"/>` : ''}
      ${hasTest ? `<circle cx="${x}" cy="40" r="3" class="lane-test"/>` : ''}`;
  }).join('');

  return `
  <figure class="lane" aria-label="Progression : ${ctx.doneCount} séances faites sur ${ctx.sessions.length}">
    <svg viewBox="0 0 ${W} 62" role="img">
      <line x1="${x0}" y1="48" x2="${x1}" y2="48" class="lane-line"/>
      <line x1="${x0}" y1="48" x2="${xNow}" y2="48" class="lane-done"/>
      ${bars}
      <path d="M${x1 - 1} 44 v-10 l8 3 -8 3" class="lane-flag"/>
      <circle cx="${xNow}" cy="48" r="5" class="lane-me"/>
    </svg>
    <figcaption>
      <span>${dayMonth(ctx.plan.start)}</span>
      <span>Objectif le ${dayMonth(ctx.goalDate)}</span>
    </figcaption>
  </figure>`;
}

/* ---------- Écran : Aujourd'hui ---------- */

function viewToday() {
  const ctx = context();
  const s = ctx.next;
  const daysLeft = daysBetween(ctx.t, ctx.goalDate);

  let lead;
  if (!ctx.started) {
    lead = `<p class="kicker">Départ ${dateLong(ctx.plan.start).toLowerCase()}</p>`;
  } else if (ctx.finished) {
    lead = `<p class="kicker">Programme terminé</p>`;
  } else {
    lead = `<p class="kicker">Semaine ${ctx.weekNow} sur ${ctx.plan.weeks.length} · phase ${phaseOf(ctx.plan, ctx.weekNow)?.name.toLowerCase() ?? ''}</p>`;
  }

  const hero = s ? `
    <section class="hero ${TYPE[s.type].cls}">
      <p class="hero-when">${s.date === ctx.t ? 'Aujourd’hui' : dateLong(s.date)}</p>
      <h1 class="hero-title">${esc(s.title)}</h1>
      <p class="hero-meta">${TYPE[s.type].label} · environ ${Math.round(totalTime(s.steps) / 60)} min</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/seance/${s.id}">Voir la séance</a>
        <button class="btn" data-quickdone="${s.id}">Marquer comme faite</button>
      </div>
    </section>` : `
    <section class="hero t-goal">
      <h1 class="hero-title">Toutes les séances sont faites</h1>
      <p class="hero-meta">Bravo. Le générateur de plan arrive bientôt pour préparer la suite.</p>
    </section>`;

  const missed = ctx.missed.length ? `
    <a class="notice" href="#/programme">
      ${ctx.missed.length === 1
        ? '1 séance passée n’est pas cochée. Coche-la si tu l’as faite, sinon passe simplement à la suivante.'
        : `${ctx.missed.length} séances passées ne sont pas cochées. Coche-les si tu les as faites, sinon passe simplement à la suivante.`}
    </a>` : '';

  const upcoming = ctx.sessions.filter((x) => x.date >= ctx.t && x !== s).slice(0, 3);

  return `
    ${lead}
    ${hero}
    ${missed}
    ${lane(ctx)}
    <dl class="stats">
      <div><dt>Séances faites</dt><dd>${ctx.doneCount}<small>/${ctx.sessions.length}</small></dd></div>
      <div><dt>Régularité</dt><dd>${ctx.dueCount ? Math.round((ctx.doneCount / ctx.dueCount) * 100) : '–'}<small>${ctx.dueCount ? '%' : ''}</small></dd></div>
      <div><dt>Jours avant l’objectif</dt><dd>${Math.max(0, daysLeft)}</dd></div>
    </dl>
    ${upcoming.length ? `
      <h2 class="section-title">Ensuite</h2>
      <ul class="sessions">${upcoming.map((x) => sessionRow(x, ctx)).join('')}</ul>` : ''}
  `;
}

/* ---------- Écran : Programme ---------- */

function sessionRow(s, ctx) {
  const e = store.entry(s.id);
  const isDone = !!e?.done;
  const isToday = s.date === ctx.t;
  const late = !isDone && s.date < ctx.t;
  const meta = isDone && (e.duration || e.distance)
    ? [e.duration ? clock(e.duration) : null, e.distance ? `${String(e.distance).replace('.', ',')} km` : null, e.rpe ? `ressenti ${e.rpe}/10` : null].filter(Boolean).join(' · ')
    : TYPE[s.type].label;
  return `
    <li class="session ${TYPE[s.type].cls}${isDone ? ' is-done' : ''}${isToday ? ' is-today' : ''}${late ? ' is-late' : ''}">
      <button class="check" data-toggle="${s.id}" aria-pressed="${isDone}" aria-label="${isDone ? 'Décocher' : 'Cocher'} ${esc(s.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>
      </button>
      <a href="#/seance/${s.id}" class="session-link">
        <span class="session-date">${isToday ? 'Aujourd’hui' : dateShort(s.date)}</span>
        <span class="session-title">${esc(s.title)}</span>
        <span class="session-meta">${esc(meta)}</span>
      </a>
    </li>`;
}

function viewPlan() {
  const ctx = context();
  const { plan } = ctx;
  return `
    <h1 class="page-title">Programme</h1>
    <p class="lede">${esc(plan.goal.label)} le ${dayMonth(ctx.goalDate)}, puis ${esc(plan.goal.secondary)}. Trois séances par semaine, un jour de repos entre deux.</p>
    ${plan.phases.map((p) => `
      <section class="phase">
        <header class="phase-head">
          <h2>${esc(p.name)}</h2>
          <p>Semaines ${p.from} à ${p.to}. ${esc(p.aim)}</p>
        </header>
        ${plan.weeks.filter((w) => w.n >= p.from && w.n <= p.to).map((w) => {
          const sess = ctx.sessions.filter((s) => s.week === w.n);
          const doneN = sess.filter(ctx.done).length;
          const isCurrent = w.n === ctx.weekNow;
          const first = sess[0].date;
          return `
          <details class="week${isCurrent ? ' is-current' : ''}" ${isCurrent || (!ctx.started && w.n === 1) ? 'open' : ''} id="semaine-${w.n}">
            <summary>
              <span class="week-n">S${w.n}</span>
              <span class="week-dates">${rangeLabel(first, addDays(ctx.plan.start, (w.n - 1) * 7 + 6))}${w.light ? ' · allégée' : ''}</span>
              <span class="week-count">${doneN}/${sess.length}</span>
            </summary>
            <ul class="sessions">${sess.map((s) => sessionRow(s, ctx)).join('')}</ul>
          </details>`;
        }).join('')}
      </section>`).join('')}
  `;
}

/* ---------- Écran : Séance ---------- */

function stepsHTML(items) {
  return `<ol class="steps">${items.map((it) => {
    if (it.kind === 'repeat') {
      return `<li class="step step-repeat"><span class="step-times">${it.times} ×</span>${stepsHTML(it.items)}</li>`;
    }
    return `
      <li class="step step-${it.kind}">
        <span class="step-name">${it.name}</span>
        <span class="step-amount">${it.amount}${it.split ? ` <em>en ${it.split}</em>` : ''}</span>
        <span class="step-pace">${[it.pace, it.label].filter(Boolean).join(' · ')}</span>
      </li>`;
  }).join('')}</ol>`;
}

// Saisie d'un temps en deux cases (minutes, secondes) : le clavier numérique de l'iPhone n'a pas de « : ».
function timeField(name, label, sec) {
  const m = sec ? Math.floor(sec / 60) : '';
  const s = sec ? String(sec % 60).padStart(2, '0') : '';
  return `
    <div class="field" role="group" aria-label="${label}">
      <span>${label}</span>
      <div class="time-pair">
      <span class="unit-input"><input name="${name}_m" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" aria-label="${label}, minutes" value="${m}"><em>min</em></span>
      <span class="unit-input"><input name="${name}_s" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" aria-label="${label}, secondes" value="${s}"><em>s</em></span>
      </div>
    </div>`;
}

function readTime(fd, name) {
  const m = parseInt(fd.get(`${name}_m`), 10);
  const s = parseInt(fd.get(`${name}_s`), 10);
  if (!Number.isFinite(m) && !Number.isFinite(s)) return null;
  return (Number.isFinite(m) ? m : 0) * 60 + Math.min(59, Number.isFinite(s) ? s : 0);
}

function viewSession(id) {
  const s = findSession(id);
  if (!s) return `<p class="lede">Cette séance n’existe pas. <a href="#/programme">Retour au programme</a></p>`;
  const e = store.entry(id) || {};
  const guide = watchGuide(s);
  const isTest = s.type === 'test' || s.type === 'objectif';
  const rpe = e.rpe || 0;

  return `
    <a class="back" href="#/programme" data-back>Programme</a>
    <header class="session-head ${TYPE[s.type].cls}">
      <p class="hero-when">${dateLong(s.date)} · semaine ${s.week}</p>
      <h1 class="hero-title">${esc(s.title)}</h1>
      <p class="hero-meta">${TYPE[s.type].label} · environ ${Math.round(totalTime(s.steps) / 60)} min${s.repere ? ` · repère ${clock(s.repere)}` : ''}</p>
    </header>

    ${stepsHTML(describe(s.steps))}
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}

    <details class="watch">
      <summary>Programmer sur l’Apple Watch</summary>
      ${guide.simple
        ? `<ul>${guide.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
        : `<ol>${guide.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
           <p class="hint">Depuis iOS 26, dans l’app Forme de l’iPhone. La séance se synchronise ensuite vers Strava si Santé est activé dans Strava.</p>`}
    </details>

    <form class="log" data-log="${s.id}">
      <h2 class="section-title">Mon compte rendu</h2>
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(e.date || s.date)}"></label>
      <div class="field-row">
        ${timeField('duration', 'Durée', e.duration)}
        <label class="field"><span>Distance</span>
          <span class="unit-input"><input name="distance" inputmode="decimal" autocomplete="off" value="${e.distance ? String(e.distance).replace('.', ',') : ''}"><em>km</em></span>
        </label>
      </div>
      ${isTest ? timeField('time3k', 'Temps sur 3 km', e.time3k) : ''}
      <fieldset class="rpe">
        <legend>Ressenti, de 1 (très facile) à 10 (à fond)</legend>
        <div class="rpe-scale">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
            <label><input type="radio" name="rpe" value="${n}" ${rpe === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}
        </div>
      </fieldset>
      <label class="field"><span>Note</span><textarea name="note" rows="2" placeholder="Sensations, météo, douleur…">${esc(e.note || '')}</textarea></label>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${e.done ? 'Mettre à jour' : 'Enregistrer la séance'}</button>
        ${e.done ? `<button class="btn btn-ghost" type="button" data-clear="${s.id}">Décocher</button>` : ''}
      </div>
    </form>
  `;
}

/* ---------- Écran : Tests ---------- */

function viewTests() {
  const ctx = context();
  const tests = ctx.sessions.filter((s) => s.type === 'test' || s.type === 'objectif');
  return `
    <h1 class="page-title">Tests 3 km</h1>
    <p class="lede">Chaque test indique si tu es sur la bonne trajectoire vers ${clock(ctx.plan.goal.time)}. Point de départ : ${esc(ctx.plan.baseline)}</p>
    <ul class="tests">
      ${tests.map((s) => {
        const e = store.entry(s.id);
        const t = e?.time3k;
        const gap = t ? t - s.repere : null;
        return `
        <li class="test ${s.type === 'objectif' ? 'is-goal' : ''}">
          <a href="#/seance/${s.id}">
            <span class="test-name">${s.type === 'objectif' ? 'Objectif' : esc(s.title)}</span>
            <span class="test-date">${dateShort(s.date)}</span>
            <span class="test-target">Repère ${clock(s.repere)}</span>
            <span class="test-result">${t ? clock(t) : '—'}</span>
            <span class="test-gap ${gap === null ? '' : gap <= 0 ? 'is-good' : gap <= 30 ? 'is-close' : 'is-far'}">
              ${gap === null ? 'à venir' : gap <= 0 ? `${clock(-gap)} d’avance` : `${clock(gap)} de retard`}
            </span>
            ${t ? `<span class="test-pace">${clock(t / 3)}/km</span>` : ''}
          </a>
        </li>`;
      }).join('')}
    </ul>
    <p class="hint">Plus de 30 secondes de retard sur un repère : ralentis un peu les allures de la phase suivante plutôt que de forcer.</p>
  `;
}

/* ---------- Écran : Outils ---------- */

// Chrono de référence : dernier test 3 km saisi, sinon le point de départ (≈ 6:20/km).
function referencePerf() {
  const tests = allSessions().filter((s) => (s.type === 'test' || s.type === 'objectif') && store.entry(s.id)?.time3k);
  const last = tests[tests.length - 1];
  if (last) return { dist: 3000, time: store.entry(last.id).time3k, fromLog: true };
  return { dist: 3000, time: 1140, fromLog: false };
}

function viewToolsScreen() {
  return viewTools(store.tools, referencePerf());
}

/* ---------- Écran : Réglages ---------- */

function viewSettings() {
  return `
    <h1 class="page-title">Réglages</h1>
    <section class="panel">
      <h2>Tes données</h2>
      <p>Tout est enregistré sur ce téléphone, sans compte. Fais une sauvegarde de temps en temps, et avant de changer de téléphone.</p>
      <div class="form-actions">
        <button class="btn btn-primary" data-export>Télécharger une sauvegarde</button>
        <label class="btn">Restaurer une sauvegarde<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
    </section>
    <section class="panel">
      <h2>Installer Foulée</h2>
      <p>Sur iPhone : ouvre ce site dans Safari, touche Partager, puis « Sur l’écran d’accueil ». Sur Android : menu de Chrome, puis « Installer l’application ».</p>
    </section>
    <section class="panel">
      <h2>Bientôt</h2>
      <p>Import de l’archive Strava et analyse de tes sorties, générateur de plan et connexion Strava.</p>
    </section>
    <section class="panel panel-danger">
      <h2>Repartir de zéro</h2>
      <p>Efface toutes les séances cochées et recharge le programme de départ.</p>
      <button class="btn btn-ghost" data-reset>Effacer mes données</button>
    </section>
    <p class="hint">Foulée, version 0.2</p>
  `;
}

/* ---------- Routeur ---------- */

const routes = [
  [/^#\/?$/, viewToday, 'today'],
  [/^#\/programme$/, viewPlan, 'plan'],
  [/^#\/seance\/([\w-]+)$/, viewSession, 'plan'],
  [/^#\/tests$/, viewTests, 'tests'],
  [/^#\/outils$/, viewToolsScreen, 'tools'],
  [/^#\/reglages$/, viewSettings, 'settings'],
];

let lastHash = null;
function render() {
  const hash = location.hash || '#/';
  for (const [re, view, tab] of routes) {
    const m = hash.match(re);
    if (m) {
      // Les calculateurs ne se redessinent pas à chaque sauvegarde (on garderait le clavier ouvert).
      if (tab === 'tools' && hash === lastHash && $view.querySelector('[data-tool]')) return;
      $view.innerHTML = view(...m.slice(1));
      if (tab === 'tools') bindTools($view, (patch) => store.saveTools(patch));
      $nav.querySelectorAll('a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === tab));
      if (hash !== lastHash) {
        window.scrollTo(0, 0);
        if (tab === 'plan' && hash === '#/programme') {
          document.querySelector('.week.is-current')?.scrollIntoView({ block: 'start' });
        }
      }
      lastHash = hash;
      return;
    }
  }
  location.hash = '#/';
}

/* ---------- Actions ---------- */

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('is-on'), 2200);
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-toggle],[data-quickdone],[data-clear],[data-export],[data-reset],[data-back]');
  if (!t) return;
  if (t.dataset.toggle) {
    const was = store.entry(t.dataset.toggle)?.done;
    store.toggle(t.dataset.toggle);
    toast(was ? 'Séance décochée' : 'Séance cochée');
  } else if (t.dataset.quickdone) {
    store.save(t.dataset.quickdone, {});
    toast('Séance cochée');
  } else if (t.dataset.clear) {
    store.clear(t.dataset.clear);
    toast('Séance décochée');
  } else if ('export' in t.dataset) {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `foulee-sauvegarde-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else if ('reset' in t.dataset) {
    if (confirm('Effacer toutes tes séances cochées et recharger le programme de départ ?')) {
      store.reset();
      toast('Données effacées');
    }
  } else if ('back' in t.dataset && history.length > 1) {
    ev.preventDefault();
    history.back();
  }
});

document.addEventListener('change', async (ev) => {
  if (!ev.target.matches('[data-import]')) return;
  const file = ev.target.files[0];
  if (!file) return;
  try {
    store.importJSON(await file.text());
    toast('Sauvegarde restaurée');
  } catch (err) {
    toast(err.message || 'Fichier illisible');
  }
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-log]');
  if (!form) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const dist = parseFloat(String(fd.get('distance') || '').replace(',', '.'));
  store.save(form.dataset.log, {
    date: fd.get('date') || null,
    duration: readTime(fd, 'duration'),
    distance: Number.isFinite(dist) ? dist : null,
    time3k: readTime(fd, 'time3k'),
    rpe: fd.get('rpe') ? Number(fd.get('rpe')) : null,
    note: String(fd.get('note') || '').trim(),
  });
  toast('Séance enregistrée');
});

store.subscribe(render);
window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js');
}

// Utilisé par les tests rapides dans la console
window.foulee = { store, context, duration };
