import { store, allSessions, findSession, phaseOf } from './store.js';
import { describe, watchGuide, totalTime } from './steps.js';
import { viewTools, bindTools, DISTANCES } from './tools.js';
import { viewAnalyse } from './analyse.js';
import {
  sessionCard, estimateCard, streakPill, weekReview, weekStrip, weekLabel, difficulty, statsRow, hexIcon,
} from './ui.js';
import {
  adaptBlock, moveBlock, why, applyAdapt, undoAdapt, moveSession,
} from './adapt.js';
import {
  viewConseils, viewArticle, viewJourJ, sessionTipsHTML, todayTip, savePref,
} from './conseils.js';
import {
  routinesList, viewRoutine, mountRoutine, unmountRoutine, handleRoutineClick, handleRoutineInput,
} from './routines.js';
import {
  viewParcours, mountParcours, unmountParcours, handleParcoursClick, handleParcoursInput,
} from './parcours.js';
import { sessionDistance } from './routes.js';
import {
  viewLive, mountLive, unmountLive, viewActivity, mountActivity, liveRun, start as liveStart, pause as livePause,
  resume as liveResume, finish as liveFinish, discard as liveDiscard, saveRun, setVoice,
} from './live.js';
import { readStravaCSV } from './strava-csv.js';
import { viewQuiz, handleQuizClick, handleQuizInput, setQuizToday } from './quiz.js';
import { vdotFromRace, repace, zones as coachZones, ZONE_INFO } from './coach.js';
import {
  stravaConfigured, stravaConnected, connectStrava, handleStravaCallback, syncStrava, disconnectStrava,
} from './strava.js';
import {
  todayISO, daysBetween, dateLong, dateShort, dayMonth, clock, duration, esc, addDays, rangeLabel, distance,
} from './util.js';

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');

// Pour tester : ?today=2026-12-10 simule une autre date.
const forcedToday = new URLSearchParams(location.search).get('today');
const today = () => forcedToday || todayISO();
setQuizToday(today);

const TYPE = {
  facile: { label: 'Footing', cls: 't-easy' },
  longue: { label: 'Sortie longue', cls: 't-long' },
  qualite: { label: 'Qualité', cls: 't-quality' },
  test: { label: 'Test', cls: 't-test' },
  objectif: { label: 'Objectif', cls: 't-goal' },
};

/* ---------- Données dérivées ---------- */

function context() {
  const plan = store.plan;
  const t = today();
  if (!plan) return { plan: null, sessions: [], t, done: () => false, empty: true };
  const sessions = allSessions(plan);
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
  const xOf = (week) => x0 + ((week - 1) / Math.max(n - 1, 1)) * (x1 - x0);
  const totalDays = daysBetween(plan.start, ctx.goalDate);
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(plan.start, ctx.t)));
  const xNow = x0 + (elapsed / totalDays) * (x1 - x0);

  const bars = plan.weeks.map((w) => {
    const sess = ctx.sessions.filter((s) => s.week === w.n);
    const ratio = sess.length ? sess.filter(ctx.done).length / sess.length : 0;
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

/* ---------- Accueil sans programme ---------- */

function welcome(title = 'Bienvenue sur Foulée') {
  return `
    <section class="hero welcome t-easy">
      <h1 class="hero-title">${title}</h1>
      <p class="hero-meta">Indique ton objectif, ta date et un chrono récent : Foulée construit ton programme séance par séance, avec tes allures.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/nouveau-programme">Créer mon programme</a>
        <label class="btn">Importer un programme<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
    </section>
    <ol class="welcome-steps">
      <li><span><strong>Un programme sur mesure.</strong> 3 km, 5 km, 10 km ou semi-marathon, avec tests et affûtage.</span></li>
      <li><span><strong>Chaque séance expliquée.</strong> Allures, temps de passage et réglage pas à pas sur l’Apple Watch.</span></li>
      <li><span><strong>Tes sorties Strava.</strong> Importées et rattachées toutes seules à tes séances, dans l’onglet Analyse.</span></li>
    </ol>
    <p class="hint">Tes données restent sur ce téléphone, sans compte.</p>`;
}

/* ---------- Écran : Aujourd'hui ---------- */

function viewToday() {
  const ctx = context();
  const live = liveRun();
  const banner = live && (live.status === 'running' || live.status === 'paused' || live.status === 'done')
    ? `<a class="notice notice-live" href="#/courir">${live.status === 'done' ? 'Ta dernière course n’est pas enregistrée : touche pour l’enregistrer.' : 'Course en cours : touche pour y revenir.'}</a>` : '';
  if (ctx.empty) return banner + welcome();
  const s = ctx.next;
  const daysLeft = daysBetween(ctx.t, ctx.goalDate);

  let lead;
  if (!ctx.started) lead = `Départ ${dateLong(ctx.plan.start).toLowerCase()}`;
  else if (ctx.finished) lead = 'Programme terminé';
  else lead = `Semaine ${ctx.weekNow}/${ctx.plan.weeks.length} · ${phaseOf(ctx.plan, ctx.weekNow)?.name ?? ''}`;

  const top = `
    <header class="topbar">
      <div><p class="brand">Foulée</p><p class="topbar-sub">${esc(lead)}</p></div>
      ${streakPill(ctx)}
    </header>`;

  const [diff, dcls] = s ? difficulty(s) : [];
  const hero = s ? `
    <section class="hero today t-${s.type}">
      <a class="hero-main" href="#/seance/${s.id}">
        ${hexIcon(s.type)}
        <span class="hero-when">${s.date === ctx.t ? 'Aujourd’hui' : s.date === addDays(ctx.t, 1) ? 'Demain' : dateLong(s.date)}</span>
        <span class="scard-diff d-${dcls}">${diff}</span>
        <h1 class="hero-title">${esc(s.title)}</h1>
        ${statsRow(s, false)}
      </a>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/courir/${s.id}">Courir</a>
        <a class="btn" href="#/parcours/${s.id}">Parcours</a>
        <button class="btn btn-ghost" data-quickdone="${s.id}">Faite</button>
      </div>
    </section>` : `
    <section class="hero t-goal">
      <h1 class="hero-title">Toutes les séances sont faites</h1>
      <p class="hero-meta">Bravo. Prépare la suite avec un nouvel objectif.</p>
      <div class="hero-actions"><a class="btn btn-primary" href="#/nouveau-programme">Nouveau programme</a></div>
    </section>`;

  const missed = ctx.missed.length ? `
    <a class="notice" href="#/programme">
      ${ctx.missed.length === 1
        ? '1 séance passée n’est pas cochée. Coche-la si tu l’as faite, sinon passe simplement à la suivante.'
        : `${ctx.missed.length} séances passées ne sont pas cochées. Coche-les si tu les as faites, sinon passe simplement à la suivante.`}
    </a>` : '';

  const upcoming = ctx.sessions.filter((x) => x.date >= ctx.t && x !== s).slice(0, 3);
  // Footings notés trop durs : le signe classique d'un entraînement trop rapide
  const easyLogged = ctx.sessions.filter((x) => (x.type === 'facile' || x.type === 'longue') && store.entry(x.id)?.rpe).slice(-3);
  const tooHard = easyLogged.length === 3 && easyLogged.every((x) => store.entry(x.id).rpe >= 7);
  const hardNotice = tooHard ? `<p class="notice">Tes 3 derniers footings étaient notés 7/10 ou plus. Ralentis : en endurance facile, tu dois pouvoir parler. C’est ce qui te fera progresser.</p>` : '';

  return `
    ${banner}
    ${top}
    ${estimateCard(ctx)}
    ${hero}
    ${missed}
    ${hardNotice}
    ${todayTip(s, ctx.t)}
    ${weekReview(ctx)}
    ${upcoming.length ? `
      <h2 class="section-title">Ensuite</h2>
      <ul class="scards">${upcoming.map((x) => sessionCard(x, ctx)).join('')}</ul>` : ''}
    ${lane(ctx)}
    <dl class="stats">
      <div><dt>Séances faites</dt><dd>${ctx.doneCount}<small>/${ctx.sessions.length}</small></dd></div>
      <div><dt>Régularité</dt><dd>${ctx.dueCount ? Math.round((ctx.doneCount / ctx.dueCount) * 100) : '–'}<small>${ctx.dueCount ? '%' : ''}</small></dd></div>
      <div><dt>Jours avant le jour J</dt><dd>${Math.max(0, daysLeft)}</dd></div>
    </dl>
  `;
}

/* ---------- Écran : Programme ---------- */

// Profil et allures du coureur, recalculées après chaque test
function pacesCard(plan) {
  const c = plan.coach;
  const Z = coachZones(c.vdot);
  const rows = ['E', 'T', 'I', 'R'].map((k) => `<tr><th scope="row">${ZONE_INFO[k].name}<small>${ZONE_INFO[k].use}</small></th><td>${clock(Z[k][0])}–${clock(Z[k][1])}</td></tr>`);
  if (c.goalPace) rows.splice(2, 0, `<tr><th scope="row">Objectif<small>Allure du jour J</small></th><td>${clock(c.goalPace)}</td></tr>`);
  return `
    <details class="paces">
      <summary><span>Mes allures</span><small>${esc(c.label)}${c.estimated && Math.abs(c.vdot - c.vdot0) < 0.3 ? ' · estimées' : ''}</small></summary>
      <table class="table zones-table"><tbody>${rows.join('')}</tbody></table>
      <p class="hint">${c.estimated && Math.abs(c.vdot - c.vdot0) < 0.3 ? 'Allures estimées : ton premier test les ajustera.' : 'Allures calculées d’après ton dernier chrono (méthode VDOT).'} Chaque test saisi recale le reste du programme.</p>
    </details>`;
}

function viewPlan() {
  const ctx = context();
  if (ctx.empty) return `<h1 class="page-title">Programme</h1>${welcome('Pas encore de programme')}`;
  const { plan } = ctx;
  return `
    <h1 class="page-title">Programme</h1>
    <p class="lede">${esc(plan.goal.label)} le ${dayMonth(ctx.goalDate)}${plan.goal.secondary ? `, puis ${esc(plan.goal.secondary)}` : ''}.</p>
    ${estimateCard(ctx)}
    ${weekStrip(ctx)}
    <div class="plan-actions">
      ${plan.coach ? pacesCard(plan) : ''}
      <a class="btn btn-small" href="#/nouveau-programme">Nouveau programme</a>
    </div>
    ${plan.phases.map((p) => `
      <section class="phase">
        <header class="phase-head">
          <h2>${esc(p.name)}</h2>
          <p>${p.from === p.to ? `Semaine ${p.from}` : `Semaines ${p.from} à ${p.to}`}. ${esc(p.aim)}</p>
        </header>
        ${plan.weeks.filter((w) => w.n >= p.from && w.n <= p.to).map((w) => {
          const sess = ctx.sessions.filter((s) => s.week === w.n);
          const doneN = sess.filter(ctx.done).length;
          const isCurrent = w.n === ctx.weekNow;
          const first = sess[0].date;
          const tag = weekLabel(w, plan);
          return `
          <details class="week${isCurrent ? ' is-current' : ''}" ${isCurrent || (!ctx.started && w.n === 1) ? 'open' : ''} id="semaine-${w.n}">
            <summary>
              <span class="week-n">Sem ${w.n}</span>
              <span class="week-dates">${tag ? `<b class="week-tag">${tag}</b>` : ''}${rangeLabel(first, addDays(ctx.plan.start, (w.n - 1) * 7 + 6))}${w.minutes ? ` · ${w.minutes >= 60 ? `${Math.floor(w.minutes / 60)} h ${String(w.minutes % 60).padStart(2, '0')}` : `${w.minutes} min`}` : ''}</span>
              <span class="week-count">${doneN}/${sess.length}</span>
            </summary>
            <ul class="scards">${sess.map((s) => sessionCard(s, ctx, { featured: s === ctx.next })).join('')}</ul>
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

  const [diff, dcls] = difficulty(s);
  return `
    <a class="back" href="#/programme" data-back>Programme</a>
    <header class="hero session-head t-${s.type}">
      <div class="hero-main">
        ${hexIcon(s.type)}
        <span class="hero-when">${dateLong(s.date)} · semaine ${s.week}</span>
        <span class="scard-diff d-${dcls}">${diff}</span>
        <h1 class="hero-title">${esc(s.title)}</h1>
        ${statsRow(s, !!e.done)}
        ${s.repere ? `<p class="hero-meta">Repère : ${clock(s.repere)}</p>` : ''}
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/courir/${s.id}">Courir avec Foulée</a>
        <a class="btn" href="#/parcours/${s.id}">Parcours</a>
      </div>
    </header>

    <section class="why"><h2 class="why-title">Pourquoi cette séance</h2><p>${esc(why(s))}</p></section>
    ${stepsHTML(describe(s.steps))}
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
    ${adaptBlock(s, pendingAdapt?.id === s.id ? pendingAdapt.reason : null)}
    ${moveBlock(s)}
    ${sessionTipsHTML(s)}

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
      ${isTest ? timeField('time3k', `Temps sur ${distance(s.testDist || store.plan.goal.distance)}`, e.time3k) : ''}
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

/* ---------- Écran : Analyse ---------- */

function stravaBlock() {
  if (!stravaConfigured()) return '';
  if (!stravaConnected()) {
    return `
      <p>Connecte ton compte pour récupérer automatiquement tes sorties récentes.</p>
      <div class="form-actions"><button class="btn btn-strava" data-strava-connect>Se connecter avec Strava</button></div>`;
  }
  const s = store.strava;
  const when = s.lastSync ? new Date(s.lastSync).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais';
  return `
    <p>Connecté à Strava${s.athlete ? ` (${esc(s.athlete)})` : ''}. Dernière synchronisation : ${when}.</p>
    <div class="form-actions"><button class="btn btn-primary" data-strava-sync>Synchroniser</button></div>`;
}

function viewAnalyseScreen() {
  return viewAnalyse(context(), stravaBlock());
}

/* ---------- Écran : Courir (accueil) ---------- */

function viewRunHub() {
  const ctx = context();
  const next = ctx.empty ? null : ctx.next;
  const live = liveRun();
  const going = live && (live.status === 'running' || live.status === 'paused' || live.status === 'done');
  const kmNext = next ? (sessionDistance(next, ctx.plan) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : null;
  return `
    <h1 class="page-title">Courir</h1>
    ${going ? `<a class="notice notice-live" href="#/courir">${live.status === 'done' ? 'Ta dernière course n’est pas enregistrée : touche pour l’enregistrer.' : 'Course en cours : touche pour y revenir.'}</a>` : ''}
    ${next ? `<p class="lede">Prochaine séance : ${esc(next.title)}, ${next.date === ctx.t ? 'aujourd’hui' : dateLong(next.date).toLowerCase()}.</p>` : '<p class="lede">Lance une sortie suivie par GPS, ou trouve une boucle autour de toi.</p>'}
    <ul class="hub">
      <li><a class="hub-card t-easy" href="${next ? `#/courir/${next.id}` : '#/courir'}">
        <span class="hub-title">Démarrer une course</span>
        <span class="hub-text">${next ? 'Séance guidée étape par étape, avec la voix.' : 'Sortie libre : carte, chrono, allure, annonces à chaque km.'}</span>
      </a></li>
      ${next ? `<li><a class="hub-card t-long" href="#/courir">
        <span class="hub-title">Sortie libre</span>
        <span class="hub-text">Sans séance : carte, chrono, allure, annonces à chaque km.</span>
      </a></li>` : ''}
      <li><a class="hub-card t-quality" href="${next ? `#/parcours/${next.id}` : '#/parcours'}">
        <span class="hub-title">Trouver un parcours</span>
        <span class="hub-text">${next ? `Trois boucles de ${kmNext} km autour de toi, ou de l’endroit choisi sur la carte.` : 'Trois boucles autour de toi, ou de l’endroit choisi sur la carte.'}</span>
      </a></li>
      <li><a class="hub-card t-long" href="#/conseils">
        <span class="hub-title">Conseils et routines</span>
        <span class="hub-text">Alimentation, récupération, échauffement et renforcement guidés à la voix, guide du jour J.</span>
      </a></li>
      <li><a class="hub-card t-goal" href="#/outils">
        <span class="hub-title">Calculateurs</span>
        <span class="hub-text">Allure, temps de passage, prédictions de chrono.</span>
      </a></li>
    </ul>`;
}

/* ---------- Écran : Outils ---------- */

// Chrono de référence : dernier test saisi, sinon rien.
function referencePerf() {
  const tests = allSessions().filter((s) => (s.type === 'test' || s.type === 'objectif') && store.entry(s.id)?.time3k);
  const last = tests[tests.length - 1];
  if (last) return { dist: last.testDist || store.plan.goal.distance, time: store.entry(last.id).time3k, fromLog: true };
  return null;
}

function viewToolsScreen() {
  return viewTools(store.tools, referencePerf());
}

/* ---------- Écran : Nouveau programme (questionnaire) ---------- */

/* ---------- Écran : Réglages ---------- */

function viewSettings() {
  const s = store.strava;
  return `
    <h1 class="page-title">Réglages</h1>
    <section class="panel">
      <h2>Programme</h2>
      <p>${store.plan
        ? `${esc(store.plan.name || store.plan.goal.label)}, du ${dayMonth(store.plan.start)} au ${dayMonth(allSessions().at(-1).date)}.`
        : 'Aucun programme pour l’instant.'}
        ${store.history.length ? `Programme précédent : ${esc(store.history.at(-1).plan.name || store.history.at(-1).plan.goal.label)}.` : ''}</p>
      <div class="form-actions">
        <a class="btn" href="#/nouveau-programme">Créer un programme</a>
        <label class="btn">Importer un programme<input type="file" accept="application/json,.json" data-import hidden></label>
        ${store.plan ? '<button class="btn btn-ghost" data-export-plan>Exporter mon programme</button>' : ''}
        ${store.history.length ? '<button class="btn btn-ghost" data-restore-plan>Revenir au programme précédent</button>' : ''}
      </div>
    </section>
    <section class="panel">
      <h2>Strava</h2>
      ${!stravaConfigured()
        ? '<p>Tu peux importer ton archive Strava depuis l’onglet Analyse. La connexion automatique s’active une fois le relais installé (guide dans le dépôt GitHub, fichier docs/STRAVA.md).</p>'
        : s?.refresh
          ? `<p>Connecté${s.athlete ? ` (${esc(s.athlete)})` : ''}. Les sorties récupérées par la connexion sont gardées 7 jours, comme le demande Strava ; ce que tu as rattaché à tes séances reste.</p>
             <div class="form-actions"><button class="btn" data-strava-sync>Synchroniser</button><button class="btn btn-ghost" data-strava-disconnect>Déconnecter Strava</button></div>`
          : '<p>Pas connecté.</p><div class="form-actions"><button class="btn btn-strava" data-strava-connect>Se connecter avec Strava</button></div>'}
      ${store.activities.length ? `<p class="hint">${store.activities.length} sortie${store.activities.length > 1 ? 's' : ''} enregistrée${store.activities.length > 1 ? 's' : ''}. <button class="linkish" data-clear-activities>Les effacer</button></p>` : ''}
    </section>
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
    <section class="panel panel-danger">
      <h2>Repartir de zéro</h2>
      <p>Efface ton programme, tes séances cochées et tes sorties importées. L’appli revient à zéro.</p>
      <button class="btn btn-ghost" data-reset>Effacer mes données</button>
    </section>
    <p class="hint">Foulée, version 3.0</p>
  `;
}

/* ---------- Routeur ---------- */

const routes = [
  [/^#\/?$/, viewToday, 'today'],
  [/^#\/programme$/, viewPlan, 'plan'],
  [/^#\/seance\/([\w-]+)$/, viewSession, 'plan'],
  [/^#\/nouveau-programme$/, viewQuiz, 'plan'],
  [/^#\/analyse$/, viewAnalyseScreen, 'analyse'],
  [/^#\/course$/, viewRunHub, 'run'],
  [/^#\/conseils$/, () => viewConseils(today(), routinesList()), 'run'],
  [/^#\/conseil\/([\w-]+)$/, (id) => viewArticle(id), 'run'],
  [/^#\/jour-j$/, () => viewJourJ(today()), 'run'],
  [/^#\/routine\/([\w-]+)$/, (id) => viewRoutine(id), 'run'],
  [/^#\/outils$/, viewToolsScreen, 'run'],
  [/^#\/courir(?:\/([\w-]+))?$/, (sid) => viewLive(sid), 'run'],
  [/^#\/parcours(?:\/([\w-]+))?$/, (sid) => viewParcours(sid), 'run'],
  [/^#\/sortie\/(.+)$/, (id) => viewActivity(decodeURIComponent(id)), 'analyse'],
  [/^#\/reglages$/, viewSettings, 'settings'],
];

let lastHash = null;
let rendering = false;
// Pas de rendu imbriqué : vider l'écran peut déclencher un « change » sur le champ qui perd le focus
function render() {
  if (rendering) return;
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
}
function renderNow() {
  const hash = location.hash || '#/';
  for (const [re, view, tab] of routes) {
    const m = hash.match(re);
    if (m) {
      // Les formulaires vivants ne se redessinent pas à chaque sauvegarde (on garderait le clavier ouvert).
      if (hash === lastHash && $view.querySelector('[data-tool], [data-quiz], [data-live], [data-parcours], [data-routine], [data-profile]')) return;
      if ($view.querySelector('[data-routine]')) unmountRoutine();
      if ($view.querySelector('[data-live]')) unmountLive();
      if ($view.querySelector('[data-parcours]')) unmountParcours();
      $view.innerHTML = view(...m.slice(1));
      if ($view.querySelector('[data-live]')) mountLive($view.querySelector('[data-live]'));
      if ($view.querySelector('[data-parcours]')) mountParcours($view.querySelector('[data-parcours]'));
      if ($view.querySelector('[data-routine]')) mountRoutine($view.querySelector('[data-routine]'));
      if (hash.startsWith('#/sortie/')) mountActivity($view, decodeURIComponent(m[1]));
      if ($view.querySelector('[data-tool]')) bindTools($view, (patch) => store.saveTools(patch));
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

let pendingAdapt = null;
function rerenderKeep() {
  const y = window.scrollY;
  lastHash = null;
  render();
  window.scrollTo(0, y);
}

function handleCoachClick(ev) {
  const t = ev.target.closest('[data-adapt],[data-adapt-accept],[data-adapt-cancel],[data-adapt-undo],[data-move],[data-week-jump]');
  if (!t) return false;
  ev.preventDefault();
  if (t.dataset.weekJump) {
    const d = document.getElementById(`semaine-${t.dataset.weekJump}`);
    if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    return true;
  }
  const id = t.dataset.sid;
  if (t.dataset.adapt) {
    pendingAdapt = pendingAdapt?.id === id && pendingAdapt.reason === t.dataset.adapt ? null : { id, reason: t.dataset.adapt };
    rerenderKeep();
  } else if (t.dataset.adaptAccept) {
    pendingAdapt = null;
    if (applyAdapt(id, t.dataset.adaptAccept)) toast('Séance adaptée');
    rerenderKeep();
  } else if ('adaptCancel' in t.dataset) {
    pendingAdapt = null;
    rerenderKeep();
  } else if ('adaptUndo' in t.dataset) {
    undoAdapt(id);
    toast('Séance prévue rétablie');
    rerenderKeep();
  } else if (t.dataset.move) {
    moveSession(id, Number(t.dataset.move));
    toast('Séance déplacée');
    rerenderKeep();
  }
  return true;
}

function download(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('is-on'), 2200);
}

document.addEventListener('click', (ev) => {
  if (handleParcoursClick(ev, $view.querySelector('[data-parcours]'))) return;
  if (handleQuizClick(ev, $view.querySelector('[data-quiz]'))) return;
  if (handleRoutineClick(ev, $view.querySelector('[data-routine]'))) return;
  if (handleCoachClick(ev)) return;
  const t = ev.target.closest('[data-toggle],[data-quickdone],[data-clear],[data-export],[data-reset],[data-back],[data-strava-connect],[data-strava-sync],[data-strava-disconnect],[data-clear-activities],[data-restore-plan],[data-export-plan],[data-live-act],[data-delete-activity]');
  if (!t) return;
  if (t.dataset.liveAct) {
    const act = t.dataset.liveAct;
    if (act === 'start') liveStart();
    else if (act === 'pause') livePause();
    else if (act === 'resume') liveResume();
    else if (act === 'finish') { if (confirm('Terminer la course ?')) liveFinish(); }
    else if (act === 'save') { const id = saveRun(); toast('Sortie enregistrée'); location.hash = `#/sortie/${encodeURIComponent(id)}`; }
    else if (act === 'discard') { if (confirm('Supprimer cette course sans l’enregistrer ?')) { liveDiscard(); location.hash = '#/'; } }
    return;
  }
  if (t.dataset.deleteActivity) {
    if (confirm('Supprimer cette sortie ? La séance reste cochée.')) {
      store.deleteActivity(t.dataset.deleteActivity);
      location.hash = '#/analyse';
      toast('Sortie supprimée');
    }
    return;
  }
  if ('stravaConnect' in t.dataset) {
    connectStrava();
  } else if ('stravaSync' in t.dataset) {
    t.disabled = true;
    t.textContent = 'Synchronisation…';
    runSync(true);
  } else if ('stravaDisconnect' in t.dataset) {
    if (confirm('Déconnecter Strava ? Tes séances déjà remplies sont gardées.')) {
      disconnectStrava().then(() => toast('Strava déconnecté'));
    }
  } else if ('exportPlan' in t.dataset) {
    download(store.exportPlanJSON(), `foulee-programme-${todayISO()}.json`);
  } else if ('restorePlan' in t.dataset) {
    if (confirm('Revenir au programme précédent ? Le programme actuel et son suivi sont gardés et tu pourras y revenir.')) {
      store.restorePrevious();
      toast('Programme précédent rétabli');
    }
  } else if ('clearActivities' in t.dataset) {
    if (confirm('Effacer toutes les sorties importées ? Tes séances cochées restent cochées.')) {
      store.clearActivities();
      toast('Sorties effacées');
    }
  } else if (t.dataset.toggle) {
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
    download(store.exportJSON(), `foulee-sauvegarde-${todayISO()}.json`);
  } else if ('reset' in t.dataset) {
    if (confirm('Effacer ton programme, tes séances et tes sorties ? Pense à télécharger une sauvegarde avant.')) {
      store.reset();
      toast('Données effacées');
    }
  } else if ('back' in t.dataset && history.length > 1) {
    ev.preventDefault();
    history.back();
  }
});

document.addEventListener('change', async (ev) => {
  // Profil alimentaire : enregistré, puis les conseils de la page se mettent à jour
  if (ev.target.matches('[data-pref]') && ev.target.closest('[data-profile]')) {
    savePref(ev.target);
    const y = window.scrollY;
    lastHash = null;
    render();
    window.scrollTo(0, y);
    return;
  }
  if (handleParcoursInput(ev, $view.querySelector('[data-parcours]'))) { ev.target.blur(); return; }
  if (ev.target.matches('[data-voice]')) { setVoice(ev.target.checked); return; }
  if (ev.target.matches('[data-import-csv]')) {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const { runs } = readStravaCSV(await file.text());
      const { added, linked } = store.addActivities(runs);
      toast(`${added} sortie${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}${linked ? `, ${linked} séance${linked > 1 ? 's' : ''} remplie${linked > 1 ? 's' : ''}` : ''}`);
    } catch (err) {
      toast(err.message || 'Fichier illisible');
    }
    return;
  }
  if (!ev.target.matches('[data-import]')) return;
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const kind = store.importJSON(await file.text());
    if (kind === 'programme') { location.hash = '#/'; toast('Programme importé'); } else toast('Sauvegarde restaurée');
  } catch (err) {
    toast(err.message || 'Fichier illisible');
  }
});

document.addEventListener('input', (ev) => {
  if (handleParcoursInput(ev, $view.querySelector('[data-parcours]'))) return;
  if (handleRoutineInput(ev)) return;
  if (ev.target.matches('[data-pref=weight]')) { savePref(ev.target); return; }
  handleQuizInput(ev, $view.querySelector('[data-quiz]'));
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-log]');
  if (!form) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const dist = parseFloat(String(fd.get('distance') || '').replace(',', '.'));
  const time3k = readTime(fd, 'time3k');
  store.save(form.dataset.log, {
    date: fd.get('date') || null,
    duration: readTime(fd, 'duration'),
    distance: Number.isFinite(dist) ? dist : null,
    time3k,
    rpe: fd.get('rpe') ? Number(fd.get('rpe')) : null,
    note: String(fd.get('note') || '').trim(),
  });
  // Programme adaptatif : un chrono de test recale les allures de la suite
  const s = findSession(form.dataset.log);
  if (time3k && s && (s.type === 'test' || s.type === 'objectif') && store.plan?.coach) {
    const v = vdotFromRace(s.testDist || store.plan.goal.distance || 3000, time3k);
    const before = store.plan.coach.vdot;
    if (v > 15 && v < 90 && Math.abs(v - before) >= 0.3) {
      store.adjustPlan((plan) => repace(plan, v, s.date));
      toast(v > before ? 'Bravo ! Tes allures accélèrent pour la suite' : 'Allures ajustées : la suite sera un peu plus douce');
      return;
    }
  }
  toast('Séance enregistrée');
});

async function runSync(force = false) {
  try {
    const r = await syncStrava({ force });
    if (force || r?.added) {
      toast(r ? `Strava : ${r.added} nouvelle${r.added > 1 ? 's' : ''} sortie${r.added > 1 ? 's' : ''}${r.linked ? `, ${r.linked} séance${r.linked > 1 ? 's' : ''} remplie${r.linked > 1 ? 's' : ''}` : ''}` : 'Strava à jour');
    }
  } catch (e) {
    if (force) toast(`Synchronisation impossible : ${e.message}`);
  } finally {
    if (force) { lastHash = null; render(); }
  }
}

// Pas de zoom par pincement sur l'appli (la carte garde le sien)
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (e) => {
    if (!e.target.closest?.('.leaflet-container')) e.preventDefault();
  }, { passive: false });
}
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 && !e.target.closest?.('.leaflet-container')) e.preventDefault();
}, { passive: false });

store.subscribe(render);
window.addEventListener('hashchange', render);
render();

handleStravaCallback().then((r) => {
  if (r) { toast(r.message); if (r.ok) runSync(true); } else runSync(false);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // Nouvelle version disponible : elle s'installe et la page se recharge une fois
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => reg.update());
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || document.querySelector('[data-live]')) return;
    reloaded = true;
    location.reload();
  });
}

// Utilisé par les tests rapides dans la console
window.foulee = { store, context, duration };
