import { store, allSessions, findSession, phaseOf } from './store.js';
import { describe, watchGuide, totalTime } from './steps.js';
import { viewTools, bindTools, DISTANCES } from './tools.js';
import { viewAnalyse } from './analyse.js';
import {
  sessionCard, estimateCard, streakPill, weekReview, weekStrip, weekLabel, difficulty, statsRow, hexIcon, markJustDone,
} from './ui.js';
import {
  adaptBlock, moveBlock, why, applyAdapt, undoAdapt, moveSession,
} from './adapt.js';
import {
  viewConseils, viewArticle, viewJourJ, sessionTipsHTML, todayTip, savePref,
} from './conseils.js';
import {
  routinesList, viewRoutine, mountRoutine, unmountRoutine, handleRoutineClick, handleRoutineInput, strengthCard,
} from './routines.js';
import {
  viewParcours, mountParcours, unmountParcours, handleParcoursClick, handleParcoursInput,
} from './parcours.js';
import { sessionDistance } from './routes.js';
import {
  viewLive, mountLive, unmountLive, viewActivity, mountActivity, liveRun, start as liveStart, pause as livePause,
  resume as liveResume, finish as liveFinish, discard as liveDiscard, saveRun, setVoice, readDur,
} from './live.js';
import { readStravaCSV } from './strava-csv.js';
import { hrFields, readHr, hrCard, sessionHr, cardioCoach, fcMax, kindField } from './cardio.js';
import { placementField, extrasList, extraNotice, weekExtras } from './extra.js';
import {
  calendarAll, calendarOne, shareSession, shareActivity, viewDefis, importChallenge, removeFriend, shareChallenge,
  weatherBlock, enableWeather, loadWeather, weatherReady, shoesBlock, addShoe, shoeAction, shoeNotice, painFields, readPain,
  painNotice, shareBackup, backupNotice, firstSteps, weekRing, monthView, weekDays,
} from './extras.js';
import { viewQuiz, handleQuizClick, handleQuizInput, setQuizToday } from './quiz.js';
import { vdotFromRace, repace, shiftEasy, zones as coachZones, ZONE_INFO } from './coach.js';
import {
  stravaConfigured, stravaConnected, connectStrava, handleStravaCallback, syncStrava, disconnectStrava, stravaSetup,
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
      <div class="topbar-right">${weekRing(ctx)}${streakPill(ctx)}</div>
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
    ${weekDays(ctx)}
    ${hero}
    <a class="add-run" href="#/ajouter-sortie">+ Ajouter une sortie hors programme</a>
    ${extraNotice(ctx)}
    ${cardioCoach(ctx)}
    ${weatherBlock(s, ctx.t)}
    ${strengthCard(ctx.t)}
    ${[painNotice(ctx.t), missed, hardNotice, shoeNotice(), backupNotice()].filter((x) => x && x.trim()).slice(0, 2).join('')}
    ${estimateCard(ctx)}
    ${firstSteps()}
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
      ${c.easyShift ? `<p class="shift-note">Allures faciles ralenties de ${c.easyShift} s/km d’après ton cardio. <button class="linkish" data-cardio-shift="${-c.easyShift}">Revenir aux allures d’origine</button></p>` : ''}
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
    <div class="segmented segmented-compact plan-switch" role="group" aria-label="Affichage">
      <label><input type="radio" name="plan-view" value="weeks" data-plan-view ${planView() === 'weeks' ? 'checked' : ''}><span>Semaines</span></label>
      <label><input type="radio" name="plan-view" value="month" data-plan-view ${planView() === 'month' ? 'checked' : ''}><span>Mois</span></label>
    </div>
    ${planView() === 'month' ? monthView(ctx, calMonth || ctx.t.slice(0, 7)) : weekStrip(ctx)}
    <div class="plan-actions">
      ${plan.coach ? pacesCard(plan) : ''}
      <div class="form-actions">
        <button class="btn btn-small" data-ics-all>Ajouter au calendrier</button>
        <a class="btn btn-small btn-ghost" href="#/nouveau-programme">Nouveau programme</a>
      </div>
    </div>
    ${planView() === 'month' ? '' : plan.phases.map((p) => `
      <section class="phase">
        <header class="phase-head">
          <h2>${esc(p.name)}</h2>
          <p>${p.from === p.to ? `Semaine ${p.from}` : `Semaines ${p.from} à ${p.to}`}. ${esc(p.aim)}</p>
        </header>
        ${plan.weeks.filter((w) => w.n >= p.from && w.n <= p.to).map((w) => {
          const sess = ctx.sessions.filter((s) => s.week === w.n);
          const doneN = sess.filter(ctx.done).length;
          const extraN = weekExtras(w.n).length;
          const isCurrent = w.n === ctx.weekNow;
          const first = sess[0].date;
          const tag = weekLabel(w, plan);
          return `
          <details class="week${isCurrent ? ' is-current' : ''}" ${isCurrent || (!ctx.started && w.n === 1) ? 'open' : ''} id="semaine-${w.n}">
            <summary>
              <span class="week-n">Sem ${w.n}</span>
              <span class="week-dates">${tag ? `<b class="week-tag">${tag}</b>` : ''}${rangeLabel(first, addDays(ctx.plan.start, (w.n - 1) * 7 + 6))}${w.minutes ? ` · <span class="nw">${w.minutes >= 60 ? `${Math.floor(w.minutes / 60)} h ${String(w.minutes % 60).padStart(2, '0')}` : `${w.minutes} min`}</span>` : ''}</span>
              <span class="week-dots" aria-hidden="true">${sess.map((s) => `<i class="t-${s.type}${ctx.done(s) ? ' is-done' : ''}"></i>`).join('')}</span>
              <span class="week-count">${doneN}/${sess.length}${extraN ? `<small> +${extraN}</small>` : ''}</span>
            </summary>
            <ul class="scards">${sess.map((s) => sessionCard(s, ctx, { featured: s === ctx.next })).join('')}</ul>
            ${extrasList(w.n)}
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

/* ---------- Écran : Ajouter une sortie ---------- */

function viewAddRun(date) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today();
  const now = new Date();
  const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `
    <a class="back" href="#/" data-back>Retour</a>
    <h1 class="page-title">Ajouter une sortie</h1>
    <p class="lede">Une sortie faite en dehors du programme, ou enregistrée sans Foulée : elle apparaît dans tes courses et le coach en tient compte.</p>
    <form class="log" data-add-run>
      <div class="field-row">
        <label class="field"><span>Date</span><input type="date" name="date" value="${d}" max="${today()}" data-add-date required></label>
        <label class="field"><span>Heure</span><input type="time" name="time" value="${d === today() ? hh : '12:00'}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Distance</span>
          <span class="unit-input"><input name="distance" inputmode="decimal" autocomplete="off" placeholder="5" required><em>km</em></span>
        </label>
        ${timeField('duration', 'Durée', null)}
      </div>
      <label class="field"><span>Nom</span><input name="name" autocomplete="off" placeholder="Sortie du midi"></label>
      ${kindField(null)}
      ${hrFields(null, null)}
      <fieldset class="rpe">
        <legend>Ressenti, de 1 (très facile) à 10 (à fond)</legend>
        <div class="rpe-scale">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<label><input type="radio" name="rpe" value="${n}"><span>${n}</span></label>`).join('')}
        </div>
      </fieldset>
      <div data-place-wrap>${placementField(d)}</div>
      <label class="field"><span>Note</span><textarea name="note" rows="2" placeholder="Sensations, parcours…"></textarea></label>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Enregistrer la sortie</button></div>
      <p class="hint">Si la même sortie arrive ensuite de Strava, elle remplace celle-ci sans être comptée deux fois.</p>
    </form>`;
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
      <div class="mini-actions">
        ${e.done ? `<button class="linkish" data-share-session="${s.id}">Partager en image</button>` : `<button class="linkish" data-goto-log>Remplir mon compte rendu</button><button class="linkish" data-ics-one="${s.id}">Calendrier</button>`}
      </div>
    </header>

    ${weatherBlock(s, today())}
    ${e.done ? hrCard({ ...(sessionHr(s) || {}), type: s.type }) : ''}
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
      ${hrFields(sessionHr(s)?.hrAvg || e.hrAvg, sessionHr(s)?.hrMax || e.hrMax)}
      ${painFields(e)}
      <label class="field"><span>Note</span><textarea name="note" rows="2" placeholder="Sensations, météo…">${esc(e.note || '')}</textarea></label>
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

// Petits dessins au trait, dans le coin des cartes
const ART = {
  run: '<svg class="hub-art" viewBox="0 0 64 64" aria-hidden="true"><circle cx="38" cy="12" r="5"/><path d="M22 58l9-17 8 6v13M16 33l9-11 11 3 6 11 9 3M31 41l-3-12"/></svg>',
  free: '<svg class="hub-art" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 48c10-14 18 6 28-8s16-6 20-16"/><circle cx="8" cy="48" r="3"/><path d="M56 24v-12l8 4-8 4"/></svg>',
  loop: '<svg class="hub-art" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 54c-14 0-22-8-22-20S20 10 32 12s24 8 22 22-8 20-22 20z" stroke-dasharray="4 5"/><path d="M32 8c-5 0-9 4-9 9 0 7 9 15 9 15s9-8 9-15c0-5-4-9-9-9z"/><circle cx="32" cy="17" r="3"/></svg>',
  cup: '<svg class="hub-art" viewBox="0 0 64 64" aria-hidden="true"><path d="M20 56h24M32 56V42M22 10h20v14a10 10 0 0 1-20 0zM22 16h-8a7 7 0 0 0 8 9M42 16h8a7 7 0 0 1-8 9"/></svg>',
  leaf: '<svg class="hub-art" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 52C12 26 28 12 54 10c0 26-14 42-40 42zM12 52l26-26"/></svg>',
  calc: '<svg class="hub-art" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="36" r="20"/><path d="M32 36V22M27 10h10M32 10v6M48 20l4-4"/></svg>',
};

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
        ${ART.run}
        <span class="hub-title">Démarrer une course</span>
        <span class="hub-text">${next ? 'Séance guidée étape par étape, avec la voix.' : 'Sortie libre : carte, chrono, allure, annonces à chaque km.'}</span>
      </a></li>
      ${next ? `<li><a class="hub-card t-long" href="#/courir">
        ${ART.free}
        <span class="hub-title">Sortie libre</span>
        <span class="hub-text">Sans séance : carte, chrono, allure, annonces à chaque km.</span>
      </a></li>` : ''}
      <li><a class="hub-card t-quality" href="${next ? `#/parcours/${next.id}` : '#/parcours'}">
        ${ART.loop}
        <span class="hub-title">Trouver un parcours</span>
        <span class="hub-text">${next ? `Trois boucles de ${kmNext} km autour de toi, ou de l’endroit choisi sur la carte.` : 'Trois boucles autour de toi, ou de l’endroit choisi sur la carte.'}</span>
      </a></li>
      <li>${strengthCard(ctx.t)}</li>
      <li><a class="hub-card t-test" href="#/defis">
        ${ART.cup}
        <span class="hub-title">Défis entre amis</span>
        <span class="hub-text">Le classement des kilomètres du mois, par simple lien.</span>
      </a></li>
      <li><a class="hub-card t-long" href="#/conseils">
        ${ART.leaf}
        <span class="hub-title">Conseils et routines</span>
        <span class="hub-text">Alimentation, récupération, échauffement et renforcement guidés à la voix, guide du jour J.</span>
      </a></li>
      <li><a class="hub-card t-goal" href="#/outils">
        ${ART.calc}
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
      <h2>Affichage</h2>
      <div class="segmented segmented-compact" role="group" aria-label="Thème">
        ${[['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Auto']].map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" data-theme-set ${(store.tools.theme || 'dark') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <p class="hint">Auto suit le réglage de ton téléphone. Le thème clair se lit mieux en plein soleil.</p>
    </section>
    <section class="panel">
      <h2>Rappels</h2>
      <p>Ajoute toutes tes séances à venir dans le calendrier du téléphone, avec une alerte la veille à 18 h. Refais-le après une adaptation ou un nouveau programme.</p>
      <div class="form-actions"><button class="btn" data-ics-all ${store.plan ? '' : 'disabled'}>Ajouter au calendrier</button></div>
    </section>
    <section class="panel">
      <h2>Strava</h2>
      ${!stravaConfigured()
        ? stravaSetupPanel()
        : s?.refresh
          ? `<p>Connecté${s.athlete ? ` (${esc(s.athlete)})` : ''}. Les sorties récupérées par la connexion sont gardées 7 jours, comme le demande Strava ; ce que tu as rattaché à tes séances reste.</p>
             <div class="form-actions"><button class="btn" data-strava-sync>Synchroniser</button><button class="btn btn-ghost" data-strava-disconnect>Déconnecter Strava</button></div>`
          : '<p>Pas connecté.</p><div class="form-actions"><button class="btn btn-strava" data-strava-connect>Se connecter avec Strava</button></div>'}
      ${store.activities.length ? `<p class="hint">${store.activities.length} sortie${store.activities.length > 1 ? 's' : ''} enregistrée${store.activities.length > 1 ? 's' : ''}. <button class="linkish" data-clear-activities>Les effacer</button></p>` : ''}
    </section>
    <section class="panel">
      <h2>Tes données</h2>
      <p>Tout est enregistré sur ce téléphone, sans compte. Garde une copie dans Fichiers ou iCloud Drive : elle sert aussi à passer ton suivi sur un autre téléphone.${store.tools.lastBackup ? ` Dernière sauvegarde le ${new Date(store.tools.lastBackup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.` : ''}</p>
      <div class="form-actions">
        <button class="btn btn-primary" data-backup-share>Sauvegarder</button>
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
    <p class="hint">Foulée, version 3.3</p>
  `;
}

function stravaSetupPanel() {
  const c = stravaSetup();
  return `
    <p>Tu peux importer ton archive Strava depuis l’onglet Analyse. Pour que tes sorties arrivent toutes seules, active la connexion (environ 15 minutes, une seule fois).</p>
    <details class="howto">
      <summary>Activer la connexion Strava</summary>
      <ol>
        <li>Sur strava.com/settings/api (dans Safari), crée une application : catégorie Training, site <code>https://pixelcatchoff-rgb.github.io/foulee/</code>, domaine de rappel <code>pixelcatchoff-rgb.github.io</code>.</li>
        <li>Sur dash.cloudflare.com, crée un Worker nommé <code>foulee-strava</code>, colle le code du fichier <code>relay/worker.js</code> du dépôt, puis ajoute les variables <code>STRAVA_CLIENT_ID</code>, <code>STRAVA_CLIENT_SECRET</code> (en secret) et <code>ALLOWED_ORIGINS</code> = <code>https://pixelcatchoff-rgb.github.io</code>.</li>
        <li>Recopie ici le Client ID et l’adresse du Worker. Le Client Secret ne se met jamais dans l’appli.</li>
      </ol>
      <form data-strava-setup>
        <label class="field"><span>Client ID</span><input name="clientId" inputmode="numeric" autocomplete="off" value="${esc(c.clientId)}" placeholder="123456"></label>
        <label class="field"><span>Adresse du relais</span><input name="relay" type="url" autocomplete="off" value="${esc(c.relay)}" placeholder="https://foulee-strava.ton-compte.workers.dev"></label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Activer</button></div>
      </form>
      <p class="hint">Guide détaillé : fichier docs/STRAVA.md du dépôt GitHub.</p>
    </details>`;
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
  [/^#\/defis$/, () => viewDefis(today()), 'run'],
  [/^#\/defi\/([\w-]+)$/, (code) => { const r = importChallenge(code); setTimeout(() => { toast(r.message); location.replace('#/defis'); }, 0); return '<p class="lede">Ajout du défi…</p>'; }, 'run'],
  [/^#\/courir(?:\/([\w-]+))?$/, (sid) => viewLive(sid), 'run'],
  [/^#\/parcours(?:\/([\w-]+))?$/, (sid) => viewParcours(sid), 'run'],
  [/^#\/ajouter-sortie(?:\/([\d-]+))?$/, (d) => viewAddRun(d), 'analyse'],
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
let calMonth = null;
const planView = () => store.tools.planView || 'weeks';

// Thème : sombre par défaut, clair, ou auto (réglage du téléphone)
function applyTheme() {
  const t = store.tools.theme || 'dark';
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  const light = t === 'light' || (t === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', light ? '#F3F5F9' : '#0A1120');
}
applyTheme();
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);

// Une FC maximum notée au-dessus de la FC max saisie : la FC max est relevée
function raiseFcMax(hrMax) {
  if (hrMax && store.tools.fcMax && hrMax > store.tools.fcMax) {
    store.saveTools({ fcMax: hrMax });
    setTimeout(() => toast(`Nouvelle FC max : ${hrMax} bpm. Tes zones sont recalculées.`), 2400);
  }
}

function handleCardioClick(ev) {
  const t = ev.target.closest('[data-cardio-shift],[data-cardio-snooze],[data-cardio-fatigue]');
  if (!t) return false;
  ev.preventDefault();
  if (t.dataset.cardioShift) {
    const sec = Number(t.dataset.cardioShift);
    const r = store.adjustPlan((plan) => shiftEasy(plan, sec, today()));
    store.saveTools({ cardioSnooze: today(), cardioShiftAt: sec > 0 ? today() : null });
    toast(sec > 0 ? `Allures faciles ralenties de ${sec} s/km sur ${r?.changed ?? 0} séances` : 'Allures faciles d’origine rétablies');
    rerenderKeep();
  } else if ('cardioSnooze' in t.dataset) {
    store.saveTools({ cardioSnooze: today() });
    rerenderKeep();
  } else if (t.dataset.cardioFatigue) {
    store.saveTools({ cardioSnooze: today() });
    pendingAdapt = { id: t.dataset.cardioFatigue, reason: 'fatigue' };
    location.hash = `#/seance/${t.dataset.cardioFatigue}`;
    setTimeout(() => document.querySelector('.coach')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  }
  return true;
}

function handleExtrasClick(ev) {
  const t = ev.target.closest('[data-ics-all],[data-ics-one],[data-share-session],[data-share-activity],[data-defi-share],[data-defi-remove],[data-wx-enable],[data-wx-adapt],[data-shoe-act],[data-backup-share],[data-onboard-done],[data-cal],[data-goto-log]');
  if (!t) return false;
  ev.preventDefault();
  if ('gotoLog' in t.dataset) { document.querySelector('[data-log]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return true; }
  if ('icsAll' in t.dataset) {
    const n = calendarAll(today());
    if (!n) toast('Aucune séance à venir');
  } else if (t.dataset.icsOne) {
    calendarOne(t.dataset.icsOne);
  } else if (t.dataset.shareSession) {
    shareSession(t.dataset.shareSession).then((r) => { if (r === 'téléchargé') toast('Image téléchargée'); });
  } else if (t.dataset.shareActivity) {
    shareActivity(t.dataset.shareActivity).then((r) => { if (r === 'téléchargé') toast('Image téléchargée'); });
  } else if ('defiShare' in t.dataset) {
    if (!store.tools.name) { toast('Indique d’abord ton prénom'); document.querySelector('[data-defi-name]')?.focus(); return true; }
    shareChallenge(today()).then((r) => { if (r === 'copié') toast('Lien copié : colle-le dans un message'); });
  } else if (t.dataset.defiRemove) {
    removeFriend(t.dataset.defiRemove);
    rerenderKeep();
  } else if ('wxEnable' in t.dataset) {
    t.disabled = true;
    enableWeather().then((r) => { toast(r.message); rerenderKeep(); });
  } else if (t.dataset.wxAdapt) {
    pendingAdapt = { id: t.dataset.wxAdapt, reason: 'chaleur' };
    location.hash = `#/seance/${t.dataset.wxAdapt}`;
    setTimeout(() => document.querySelector('.coach')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  } else if (t.dataset.shoeAct) {
    if (t.dataset.shoeAct === 'delete' && !confirm('Supprimer cette paire ?')) return true;
    shoeAction(t.dataset.shoe, t.dataset.shoeAct, today());
    rerenderKeep();
  } else if ('backupShare' in t.dataset) {
    shareBackup(store.exportJSON(), `foulee-sauvegarde-${todayISO()}.json`).then((r) => {
      if (r !== 'annulé') toast(r === 'partagé' ? 'Sauvegarde prête' : 'Sauvegarde téléchargée');
      rerenderKeep();
    });
  } else if ('onboardDone' in t.dataset) {
    store.saveTools({ onboarded: true });
    rerenderKeep();
  } else if (t.dataset.cal) {
    calMonth = t.dataset.cal;
    rerenderKeep();
  }
  return true;
}
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
  if (handleCardioClick(ev)) return;
  if (handleExtrasClick(ev)) return;
  const t = ev.target.closest('[data-toggle],[data-quickdone],[data-clear],[data-export],[data-reset],[data-back],[data-strava-connect],[data-strava-sync],[data-strava-disconnect],[data-clear-activities],[data-restore-plan],[data-export-plan],[data-live-act],[data-delete-activity]');
  if (!t) return;
  if (t.dataset.liveAct) {
    const act = t.dataset.liveAct;
    if (act === 'start') liveStart();
    else if (act === 'pause') livePause();
    else if (act === 'resume') liveResume();
    else if (act === 'finish') { if (confirm('Terminer la course ?')) liveFinish(); }
    else if (act === 'save') {
      const v = parseFloat(String(document.querySelector('[data-live-dist]')?.value || '').replace(',', '.'));
      const place = document.querySelector('[data-live-place] input[name=place]:checked');
      const sec = readDur(document, 'live');
      const hr = readHr(document.querySelector('[data-controls]'));
      if (hr.error) { toast(hr.error); return; }
      raiseFcMax(hr.hrMax);
      const id = saveRun(Number.isFinite(v) && v > 0 && v < 100 ? v : null, place ? place.value || null : undefined, sec && sec < 86400 ? sec : null, hr);
      toast('Sortie enregistrée'); location.hash = `#/sortie/${encodeURIComponent(id)}`; }
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
    if (!was) { markJustDone(t.dataset.toggle); navigator.vibrate?.(15); }
    store.toggle(t.dataset.toggle);
    toast(was ? 'Séance décochée' : 'Séance cochée');
  } else if (t.dataset.quickdone) {
    markJustDone(t.dataset.quickdone);
    navigator.vibrate?.(15);
    store.save(t.dataset.quickdone, {});
    toast('Séance cochée');
  } else if (t.dataset.clear) {
    store.clear(t.dataset.clear);
    toast('Séance décochée');
  } else if ('export' in t.dataset) {
    store.saveTools({ lastBackup: Date.now() });
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
  if (ev.target.matches('[data-add-date]')) {
    const wrap = $view.querySelector('[data-place-wrap]');
    if (wrap && ev.target.value) wrap.innerHTML = placementField(ev.target.value);
    return;
  }
  const kindForm = ev.target.closest('[data-kind-form]');
  if (kindForm && ev.target.matches('[data-run-kind]')) {
    const a = store.activities.find((x) => x.id === kindForm.dataset.kindForm);
    if (a) store.addActivities([{ ...a, kind: ev.target.value }], { link: false });
    toast(ev.target.value === 'facile' ? 'Compté comme un footing' : 'Compté comme une sortie soutenue');
    rerenderKeep();
    return;
  }
  const placing = ev.target.closest('[data-placement]');
  if (placing && ev.target.name === 'place') {
    store.setPlacement(placing.dataset.placement, ev.target.value || null);
    toast(ev.target.value ? `Rattachée à : ${findSession(ev.target.value)?.title || 'la séance'}` : 'Comptée en plus du programme');
    rerenderKeep();
    return;
  }
  if (ev.target.matches('[data-theme-set]')) { store.saveTools({ theme: ev.target.value }); applyTheme(); return; }
  if (ev.target.matches('[data-plan-view]')) { store.saveTools({ planView: ev.target.value }); calMonth = null; rerenderKeep(); return; }
  if (ev.target.matches('[data-defi-name]')) { store.saveTools({ name: ev.target.value.trim().slice(0, 24) }); rerenderKeep(); return; }
  if (ev.target.matches('[data-hr-max]')) {
    const n = parseInt(ev.target.value, 10);
    store.saveTools({ fcMax: n >= 140 && n <= 230 ? n : null });
    if (ev.target.value && !(n >= 140 && n <= 230)) toast('Une FC max se situe entre 140 et 230');
    rerenderKeep();
    return;
  }
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
  const addRun = ev.target.closest('[data-add-run]');
  if (addRun) {
    ev.preventDefault();
    const fd = new FormData(addRun);
    const date = String(fd.get('date') || '');
    const km = parseFloat(String(fd.get('distance') || '').replace(',', '.'));
    const sec = readTime(fd, 'duration');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Indique la date de la sortie'); return; }
    if (date > today()) { toast('Cette date n’est pas encore passée'); return; }
    if (!(km > 0 && km < 100)) { toast('Indique une distance en km, par exemple 5,2'); return; }
    if (!(sec > 0)) { toast('Indique la durée de la sortie'); return; }
    const pace = sec / km;
    if (pace < 150 || pace > 1200) { toast(`Allure de ${clock(pace)}/km : vérifie la distance et la durée`); return; }
    const time = /^\d{2}:\d{2}$/.test(fd.get('time') || '') ? fd.get('time') : '12:00';
    const hr = readHr(addRun);
    if (hr.error) { toast(hr.error); return; }
    const place = String(fd.get('place') || '') || null;
    const id = store.addManualRun({
      name: String(fd.get('name') || '').trim() || 'Sortie hors programme',
      date, start: new Date(`${date}T${time}:00`).toISOString(),
      distance: Math.round(km * 1000), moving: sec, elapsed: sec,
      hrAvg: hr.hrAvg, hrMax: hr.hrMax,
      kind: ['facile', 'soutenue'].includes(fd.get('run_kind')) ? fd.get('run_kind') : null,
      rpe: fd.get('rpe') ? Number(fd.get('rpe')) : null,
      note: String(fd.get('note') || '').trim(),
      extra: !place,
    });
    store.setPlacement(id, place);
    if (place && (hr.hrAvg || hr.hrMax)) store.save(place, { hrAvg: hr.hrAvg, hrMax: hr.hrMax });
    raiseFcMax(hr.hrMax);
    if (place) markJustDone(place);
    navigator.vibrate?.(15);
    toast(place ? 'Sortie ajoutée et séance cochée' : 'Sortie ajoutée en plus du programme');
    location.hash = '#/';
    return;
  }
  const shoeForm = ev.target.closest('[data-shoe-form]');
  if (shoeForm) {
    ev.preventDefault();
    const fd = new FormData(shoeForm);
    addShoe({ name: String(fd.get('name') || '').trim(), since: fd.get('since') || today(), base: parseInt(fd.get('base'), 10) || 0 });
    toast('Paire ajoutée');
    rerenderKeep();
    return;
  }
  const fix = ev.target.closest('[data-fix-dist]');
  if (fix) {
    ev.preventDefault();
    const km = parseFloat(String(new FormData(fix).get('km') || '').replace(',', '.'));
    const sec = readDur(fix, 'fix');
    if (!(km > 0 && km < 100)) { toast('Indique une distance en km, par exemple 5,2'); return; }
    if (!sec || sec >= 86400) { toast('Indique une durée, par exemple 32 min 15 s'); return; }
    const pace = sec / km;
    if (pace < 150 || pace > 1200) { toast(pace < 150 ? 'Allure trop rapide pour être vraie : vérifie la durée et la distance' : 'Allure de plus de 20 min/km : vérifie la durée et la distance'); return; }
    const hr = readHr(fix);
    if (hr.error) { toast(hr.error); return; }
    const id = fix.dataset.fixDist;
    const a = store.activities.find((x) => x.id === id);
    if (a) {
      const sameKm = Math.abs(a.distance - km * 1000) < 5;
      const sameSec = Math.abs((a.moving || a.elapsed) - sec) < 1;
      const sameHr = (a.hrAvg || null) === hr.hrAvg && (a.hrMax || null) === hr.hrMax;
      if (sameKm && sameSec && sameHr) { toast('Rien à changer'); return; }
      raiseFcMax(hr.hrMax);
      const same = sameKm && sameSec;
      store.addActivities([{
        ...a, distance: Math.round(km * 1000), moving: sec, elapsed: Math.max(sec, sameSec ? a.elapsed || sec : sec),
        hrAvg: hr.hrAvg, hrMax: hr.hrMax,
        fixed: same ? a.fixed : true, splits: same ? a.splits : [],
      }], { link: false });
      // La séance rattachée prend les nouvelles valeurs
      for (const sess of allSessions()) {
        const e = store.entry(sess.id);
        if (e?.activityId === id) store.save(sess.id, { distance: Math.round(km * 100) / 100, duration: sec, hrAvg: hr.hrAvg, hrMax: hr.hrMax });
      }
      toast('Sortie modifiée');
    }
    return;
  }
  const setup = ev.target.closest('[data-strava-setup]');
  if (setup) {
    ev.preventDefault();
    const fd = new FormData(setup);
    const clientId = String(fd.get('clientId') || '').trim();
    const relayUrl = String(fd.get('relay') || '').trim();
    if (!/^\d{3,10}$/.test(clientId)) { toast('Le Client ID est un nombre'); return; }
    if (!/^https:\/\/[^\s]+$/.test(relayUrl)) { toast('L’adresse du relais commence par https://'); return; }
    store.saveTools({ stravaClientId: clientId, stravaRelay: relayUrl });
    toast('Connexion Strava activée');
    rerenderKeep();
    return;
  }
  const form = ev.target.closest('[data-log]');
  if (!form) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const dist = parseFloat(String(fd.get('distance') || '').replace(',', '.'));
  const time3k = readTime(fd, 'time3k');
  const hr = readHr(form);
  if (hr.error) { toast(hr.error); return; }
  raiseFcMax(hr.hrMax);
  store.save(form.dataset.log, {
    hrAvg: hr.hrAvg, hrMax: hr.hrMax,
    date: fd.get('date') || null,
    duration: readTime(fd, 'duration'),
    distance: Number.isFinite(dist) ? dist : null,
    time3k,
    rpe: fd.get('rpe') ? Number(fd.get('rpe')) : null,
    pain: readPain(fd),
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

// Météo : chargée au démarrage si elle est activée, puis l'écran se met à jour
if (weatherReady()) loadWeather().then((w) => { if (w && document.querySelector('[data-wx-pending], .wx')) rerenderKeep(); });
// Demande au navigateur de ne pas effacer les données de l'appli
navigator.storage?.persist?.().catch(() => {});

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
