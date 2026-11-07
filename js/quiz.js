// Questionnaire de départ : une question par écran, puis le programme proposé.
import { store } from './store.js';
import {
  assess, buildPlan, suggestTarget, feasibility, zones, ZONE_INFO, nextSunday, weeksBetween, goalLabel,
} from './coach.js';
import { addDays, clock, esc, todayISO, distance as fmtDist } from './util.js';
import { profileFields } from './conseils.js';
import { foodProfile, recovery, portionNote } from './foods.js';

const KEY = 'foulee.quiz';
const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const DISTS = [[3000, '3 km'], [5000, '5 km'], [10000, '10 km'], [21097, 'Semi-marathon'], [42195, 'Marathon']];
const MIN_WEEKS = { 3000: 6, 5000: 6, 10000: 8, 21097: 10, 42195: 16 };

let a = load();
let today = todayISO;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') || fresh(); } catch { return fresh(); }
}
function fresh() {
  return { step: 0, days: [0, 2, 4], longDay: 0, perWeek: 3, weekdayMax: 60 };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* rien */ }
}
export function resetQuiz() { a = fresh(); save(); }
export function setQuizToday(fn) { today = fn; }

/* ---------- Questions ---------- */

const runs = () => a.objective !== 'debut' && a.freq > 0;
const needsDist = () => ['finir', 'chrono', 'reprise'].includes(a.objective);

const STEPS = [
  {
    id: 'objective', title: 'Quel est ton objectif ?',
    options: [
      ['debut', 'Je débute', 'Courir 30 minutes sans m’arrêter'],
      ['finir', 'Finir une course', 'Aller au bout d’une distance, sans viser de chrono'],
      ['chrono', 'Battre un chrono', 'Progresser sur une distance précise'],
      ['reprise', 'Reprendre', 'Après une pause, une blessure ou une grossesse'],
      ['forme', 'Garder la forme', 'Courir régulièrement, sans course prévue'],
    ],
  },
  {
    id: 'goalDist', title: 'Sur quelle distance ?', show: needsDist,
    options: () => [...DISTS.map(([d, l]) => [d, l]), ...(a.objective === 'reprise' ? [[0, 'Pas de course prévue']] : [])],
  },
  {
    id: 'freq', title: 'En ce moment, tu cours…', show: () => a.objective !== 'debut',
    options: [[0, 'Pas du tout'], [1, 'Moins d’une fois par semaine'], [2, 'Une fois par semaine'], [3, '2 à 3 fois par semaine'], [4, '4 fois ou plus']],
  },
  {
    id: 'longest', title: 'Ta plus longue course récente, sans marcher ?', show: runs,
    options: [[0, 'Moins de 10 minutes'], [1, '10 à 30 minutes'], [2, '30 minutes à 1 heure'], [3, '1 heure à 1 h 30'], [4, 'Plus de 1 h 30']],
  },
  {
    id: 'experience', title: 'Depuis quand cours-tu régulièrement ?', show: runs,
    options: [[0, 'Moins de 3 mois'], [1, '3 à 12 mois'], [2, '1 à 3 ans'], [3, 'Plus de 3 ans']],
  },
  { id: 'race', title: 'As-tu un chrono récent ?', help: 'Une course ou une sortie à fond, de moins de 3 mois. C’est ce qui rend tes allures vraiment justes.', show: runs, custom: true },
  {
    id: 'injury', title: 'Une blessure ces 6 derniers mois ?',
    options: [['non', 'Non'], ['guerie', 'Oui, mais c’est guéri'], ['douleur', 'J’ai encore mal']],
  },
  {
    id: 'age', title: 'Ta tranche d’âge',
    options: [[0, 'Moins de 30 ans'], [1, '30 à 39 ans'], [2, '40 à 49 ans'], [3, '50 à 59 ans'], [4, '60 ans et plus']],
  },
  { id: 'body', title: 'Ton profil', help: 'Pour des conseils en portions concrètes (combien de bananes, de tranches de pain…) adaptés à ton alimentation. Tout est facultatif et reste sur ton téléphone.', custom: true },
  { id: 'avail', title: 'Ton temps pour courir', custom: true },
  { id: 'dates', title: 'Quand ?', custom: true },
  { id: 'summary', title: 'Ton programme', custom: true },
];

const visible = () => STEPS.filter((s) => !s.show || s.show());

/* ---------- Rendu ---------- */

export function viewQuiz() {
  return `<div class="quiz" data-quiz>${render()}</div>`;
}

function render() {
  const list = visible();
  a.step = Math.min(a.step, list.length - 1);
  const s = list[a.step];
  const pct = Math.round((a.step / (list.length - 1)) * 100);
  const head = `
    <div class="quiz-top">
      ${a.step > 0 ? '<button class="quiz-back" data-q-back>‹ Retour</button>' : `<a class="quiz-back" href="${store.plan ? '#/programme' : '#/'}">‹ ${store.plan ? 'Programme' : 'Accueil'}</a>`}
      <div class="quiz-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    </div>
    <h1 class="quiz-title">${s.title}</h1>
    ${s.help ? `<p class="lede">${s.help}</p>` : ''}`;
  if (s.custom) return head + CUSTOM[s.id]();
  const opts = typeof s.options === 'function' ? s.options() : s.options;
  return `${head}
    <div class="quiz-options${s.id === 'objective' || s.id === 'goalDist' ? ' is-big' : ''}" role="list">
      ${opts.map(([v, label, sub]) => `
        <button class="quiz-option${a[s.id] === v ? ' is-on' : ''}" data-q-answer="${esc(String(v))}" data-q-type="${typeof v}" role="listitem">
          <span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}
        </button>`).join('')}
    </div>`;
}

function hms(prefix, sec) {
  const h = sec >= 3600 ? Math.floor(sec / 3600) : '';
  const m = sec ? Math.floor((sec % 3600) / 60) : '';
  const s = sec ? String(sec % 60).padStart(2, '0') : '';
  const cell = (n, v, max) => `<span class="unit-input"><input data-q-time="${prefix}_${n}" inputmode="numeric" pattern="[0-9]*" maxlength="${max}" autocomplete="off" value="${v}"><em>${n}</em></span>`;
  return `<div class="time-pair has-hours">${cell('h', h, 2)}${cell('min', m, 2)}${cell('s', s, 2)}</div>`;
}

const readHms = (root, prefix) => {
  const g = (n) => parseInt(root.querySelector(`[data-q-time="${prefix}_${n}"]`)?.value, 10) || 0;
  const t = g('h') * 3600 + g('min') * 60 + Math.min(59, g('s'));
  return t || null;
};

const CUSTOM = {
  body() {
    return `
      <div data-profile>${profileFields(foodProfile())}</div>
      <div class="quiz-actions"><button class="btn btn-primary btn-big" data-q-next="body">Continuer</button></div>`;
  },

  race() {
    const r = a.race || { dist: 5000, time: null };
    return `
      <div class="field">
        <span>Distance</span>
        <div class="segmented segmented-compact">
          ${[[1000, '1 km'], [3000, '3 km'], [5000, '5 km'], [10000, '10 km'], [21097, 'Semi']].map(([d, l]) => `<label><input type="radio" name="q-race-dist" value="${d}" ${r.dist === d ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </div>
      <div class="field"><span>Ton temps</span>${hms('race', r.time)}</div>
      <p class="quiz-error" data-q-error></p>
      <div class="quiz-actions">
        <button class="btn btn-primary btn-big" data-q-next="race">Continuer</button>
        <button class="btn btn-ghost btn-big" data-q-skip="race">Je n’en ai pas</button>
      </div>`;
  },

  avail() {
    const debut = a.objective === 'debut' || a.freq === 0;
    return `
      <div class="field">
        <span>Séances par semaine</span>
        ${debut
          ? '<p class="hint">Pour débuter, 3 séances par semaine, un jour sur deux : c’est ce qui marche le mieux.</p>'
          : `<div class="segmented segmented-compact">
              ${[2, 3, 4, 5, 6].map((n) => `<label><input type="radio" name="q-per" value="${n}" ${a.perWeek === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}
            </div>`}
      </div>
      <div class="field">
        <span>Quels jours ?</span>
        <div class="daypick">
          ${ORDER.map((d) => `<label><input type="checkbox" name="q-days" value="${d}" ${a.days.includes(d) ? 'checked' : ''}><span>${WEEKDAYS[d]}</span></label>`).join('')}
        </div>
      </div>
      <label class="field"><span>La sortie longue, de préférence le</span>
        <select name="q-long">${ORDER.map((d) => `<option value="${d}" ${a.longDay === d ? 'selected' : ''}>${WEEKDAYS[d]}</option>`).join('')}</select>
      </label>
      <div class="field">
        <span>En semaine, temps maximum par séance</span>
        <div class="segmented segmented-compact">
          ${[[30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30']].map(([v, l]) => `<label><input type="radio" name="q-max" value="${v}" ${a.weekdayMax === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </div>
      <p class="quiz-error" data-q-error></p>
      <div class="quiz-actions"><button class="btn btn-primary btn-big" data-q-next="avail">Continuer</button></div>`;
  },

  dates() {
    const t = today();
    const start = a.start && a.start >= t ? a.start : nextSunday(addDays(t, 1));
    const hasRace = needsDist() && a.goalDist > 0;
    const minW = (MIN_WEEKS[a.goalDist] || 6) + (isBeginner() ? 9 : 0);
    const goal = a.goalDate && a.goalDate > start ? a.goalDate : addDays(start, Math.max(minW, 16) * 7 - 1);
    return `
      <label class="field"><span>Je commence le</span><input type="date" name="q-start" value="${start}" min="${t}"></label>
      ${hasRace ? `
        <label class="field"><span>Date de la course</span><input type="date" name="q-goal" value="${goal}" min="${addDays(start, minW * 7 - 1)}"></label>
        <p class="hint">Au moins ${minW} semaines de préparation pour un ${fmtGoal(a.goalDist)}${isBeginner() ? ', dont 9 de course-marche pour démarrer' : ''}.</p>`
        : `<p class="hint">${a.objective === 'debut' || (a.goalDist === 0 && isBeginner()) ? 'Le programme dure 9 semaines.' : 'Le programme dure 12 semaines. Tu pourras en recréer un ensuite.'}</p>`}
      <p class="quiz-error" data-q-error></p>
      <div class="quiz-actions"><button class="btn btn-primary btn-big" data-q-next="dates">Voir mon programme</button></div>`;
  },

  summary() {
    const o = options();
    const p = assess(o);
    const weeks = o.goalDate ? weeksBetween(o.start, o.goalDate) : (isBeginner() ? 9 : 12);
    const timed = o.objective === 'chrono' || (a.wantTime && o.goalDist);
    let sugg = null, feas = null;
    if (o.goalDist) {
      sugg = suggestTarget(p, o.goalDist, weeks);
      if (timed) {
        if (!a.goalTime) a.goalTime = sugg.target;
        feas = feasibility(p, o.goalDist, weeks, a.goalTime);
      }
    }
    const plan = buildPlan({ ...o, goalTime: timed ? a.goalTime : null });
    const Z = zones(p.vdot);
    const msg = feas && {
      easy: 'Ton niveau actuel dépasse déjà ce chrono : tu peux viser plus vite.',
      ok: 'Objectif réaliste avec de la régularité.',
      stretch: 'Objectif ambitieux : il demande de suivre le programme presque sans trou.',
      hard: 'Objectif très ambitieux pour ce délai : mieux vaut viser le chrono conseillé, ou une date plus lointaine.',
    }[feas.level];

    return `
      <section class="quiz-profile">
        <p class="quiz-level">${esc(p.label)}</p>
        <p>${esc(p.text)}</p>
        ${p.notes.length ? `<ul class="quiz-notes">${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      </section>

      ${o.goalDist ? `
      <section class="quiz-goal">
        <h2 class="section-title">${esc(goalLabel(o.goalDist, null).replace('Finir un ', 'Ton '))}</h2>
        <p>Aujourd’hui, tu vaux environ <strong>${clock(sugg.now)}</strong>${p.estimated ? ' (estimation)' : ''}. En ${weeks} semaines, Foulée te conseille <strong>${clock(sugg.target)}</strong>.</p>
        ${o.objective !== 'chrono' ? `<label class="quiz-check"><input type="checkbox" data-q-want ${a.wantTime ? 'checked' : ''}> Je vise un chrono</label>` : ''}
        ${timed ? `
          <div class="field"><span>Chrono visé</span>${hms('goal', a.goalTime)}</div>
          <p class="gen-verdict is-${feas.level}">${msg}</p>
          ${a.goalTime !== sugg.target ? `<button class="linkish" data-q-sugg>Reprendre le chrono conseillé (${clock(sugg.target)})</button>` : ''}` : ''}
      </section>` : ''}

      <section>
        <h2 class="section-title">Tes allures</h2>
        <table class="table zones-table">
          <tbody>${(p.level === 0 ? ['E'] : ['E', 'T', 'I', 'R']).map((k) => `<tr><th scope="row">${ZONE_INFO[k].name}<small>${ZONE_INFO[k].use}</small></th><td>${clock(Z[k][0])}–${clock(Z[k][1])}</td></tr>`).join('')}</tbody>
        </table>
        <p class="hint">${p.level === 0 ? 'Pour débuter, une seule allure compte : assez lente pour pouvoir parler. Les autres viendront plus tard.' : `${p.estimated ? 'Estimées d’après ton niveau : ton premier test les ajustera.' : 'Calculées d’après ton chrono (méthode VDOT de Jack Daniels).'} Elles évoluent avec toi : après chaque test, le programme se recale.`}</p>
      </section>

      <section>
        <h2 class="section-title">${plan.weeks.length} semaines</h2>
        ${volumeChart(plan)}
        <p class="hint">${plan.phases.map((ph) => `${ph.name} : ${ph.from === ph.to ? `semaine ${ph.from}` : `semaines ${ph.from} à ${ph.to}`}`).join(' · ')}</p>
        <h3 class="sub-title">Ta première semaine</h3>
        <ul class="gen-week">${plan.weeks[0].sessions.map((s) => `<li><span>${WEEKDAYS[(new Date(`${o.start}T12:00`).getDay() + s.day) % 7]}</span>${esc(s.title)}</li>`).join('')}</ul>
      </section>

      <section>
        <h2 class="section-title">Après tes séances dures</h2>
        <p>${esc(recovery().snack.charAt(0).toUpperCase() + recovery().snack.slice(1))}, dans l’heure.</p>
        <p class="hint">${portionNote()} Tous les conseils nutrition de l’appli suivent ce profil.</p>
      </section>

      <div class="quiz-actions">
        <button class="btn btn-primary btn-big" data-q-create>Créer mon programme</button>
      </div>
      <p class="hint">Programme construit sur les méthodes reconnues : allures VDOT, 80 % d’endurance facile, progression prudente, semaines allégées, affûtage avant la course.</p>`;
  },
};

function volumeChart(plan) {
  const W = 340, H = 90;
  const vals = plan.weeks.map((w) => w.minutes || w.sessions.reduce((s, x) => s + estMinutes(x), 0));
  const max = Math.max(...vals, 1);
  const bw = W / vals.length;
  return `<svg class="chart quiz-chart" viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Volume par semaine">
    ${vals.map((v, i) => {
      const h = (v / max) * H;
      const w = plan.weeks[i];
      const isGoal = w.sessions.some((s) => s.type === 'objectif');
      return `<rect x="${i * bw + bw * 0.15}" y="${H - h}" width="${bw * 0.7}" height="${Math.max(h, 2)}" rx="1.5" class="${isGoal ? 'bar-now' : w.light ? 'bar bar-light' : 'bar'}"><title>Semaine ${w.n} : ${Math.round(v)} min</title></rect>`;
    }).join('')}
    <text x="0" y="${H + 13}" class="axis">S1</text><text x="${W}" y="${H + 13}" class="axis" text-anchor="end">S${vals.length}</text>
  </svg>`;
}

function estMinutes(s) {
  let t = 0;
  const walk = (steps) => steps.forEach((st) => {
    if (st.k === 'repeat') for (let i = 0; i < st.times; i += 1) walk(st.steps);
    else t += st.dur || (st.dist ? (st.dist / 1000) * (st.pace?.[1] || 360) : 0);
  });
  walk(s.steps);
  return t / 60;
}

const isBeginner = () => a.objective === 'debut' || a.freq === 0 || a.longest === 0;
const fmtGoal = (d) => DISTS.find(([x]) => x === d)?.[1].toLowerCase() || fmtDist(d);

function options() {
  const debut = isBeginner();
  return {
    objective: a.objective,
    goalDist: needsDist() ? a.goalDist ?? 0 : 0,
    freq: a.objective === 'debut' ? 0 : a.freq ?? 0,
    longest: runs() ? a.longest ?? 0 : 0,
    experience: runs() ? a.experience ?? 0 : 0,
    race: runs() && a.race?.time ? a.race : null,
    injury: a.injury || 'non',
    age: a.age ?? 1,
    perWeek: debut ? 3 : a.perWeek,
    days: a.days,
    longDay: a.longDay,
    weekdayMax: a.weekdayMax,
    start: a.start,
    goalDate: needsDist() && a.goalDist > 0 ? a.goalDate : null,
  };
}

/* ---------- Interactions ---------- */

function rerender(root) {
  root.innerHTML = render();
  window.scrollTo(0, 0);
  save();
}

function next(root) {
  a.step += 1;
  rerender(root);
}

function error(root, msg) {
  const el = root.querySelector('[data-q-error]');
  if (el) el.textContent = msg;
}

export function handleQuizClick(ev, root) {
  if (!root) return false;
  const t = ev.target.closest('[data-q-answer],[data-q-back],[data-q-next],[data-q-skip],[data-q-create],[data-q-sugg]');
  if (!t) return false;
  const s = visible()[a.step];

  if (t.dataset.qAnswer !== undefined) {
    const v = t.dataset.qType === 'number' ? Number(t.dataset.qAnswer) : t.dataset.qAnswer;
    a[s.id] = v;
    if (s.id === 'objective') a.goalTime = null;
    if (s.id === 'goalDist') { a.goalTime = null; a.goalDate = null; }
    t.classList.add('is-on');
    setTimeout(() => next(root), 120);
    return true;
  }
  if ('qBack' in t.dataset) { a.step = Math.max(0, a.step - 1); rerender(root); return true; }
  if (t.dataset.qSkip === 'race') { a.race = null; next(root); return true; }
  if ('qSugg' in t.dataset) { a.goalTime = null; rerender(root); return true; }

  if (t.dataset.qNext === 'race') {
    const dist = Number(root.querySelector('[name=q-race-dist]:checked')?.value);
    const time = readHms(root, 'race');
    if (!dist || !time) { error(root, 'Indique la distance et le temps, ou touche « Je n’en ai pas ».'); return true; }
    const pace = time / (dist / 1000);
    if (pace < 150 || pace > 720) { error(root, 'Ce temps semble incorrect : vérifie les heures, minutes et secondes.'); return true; }
    a.race = { dist, time };
    next(root);
    return true;
  }
  if (t.dataset.qNext === 'body') { next(root); return true; }
  if (t.dataset.qNext === 'avail') {
    const debut = isBeginner();
    const per = debut ? 3 : Number(root.querySelector('[name=q-per]:checked')?.value || a.perWeek);
    const days = [...root.querySelectorAll('[name=q-days]:checked')].map((x) => Number(x.value));
    if (days.length !== per) { error(root, `Coche ${per} jours.`); return true; }
    a.perWeek = per;
    a.days = days;
    a.longDay = Number(root.querySelector('[name=q-long]').value);
    if (!days.includes(a.longDay)) a.longDay = days.includes(0) ? 0 : days.includes(6) ? 6 : days[days.length - 1];
    a.weekdayMax = Number(root.querySelector('[name=q-max]:checked')?.value || 60);
    next(root);
    return true;
  }
  if (t.dataset.qNext === 'dates') {
    const start = root.querySelector('[name=q-start]').value;
    const goalEl = root.querySelector('[name=q-goal]');
    if (!start) { error(root, 'Choisis une date de début.'); return true; }
    a.start = start;
    if (goalEl) {
      const g = goalEl.value;
      const w = g ? weeksBetween(start, g) : 0;
      const minW = (MIN_WEEKS[a.goalDist] || 6) + (isBeginner() ? 9 : 0);
      if (a.goalDist >= 21097 && isBeginner()) { error(root, 'Pour un semi ou un marathon, commence par courir 30 minutes puis un 10 km : choisis une distance plus courte.'); return true; }
      if (a.goalDist === 42195 && (a.longest ?? 0) < 2) { error(root, 'Un marathon demande de déjà tenir une heure de course : prépare d’abord un 10 km ou un semi.'); return true; }
      if (w < minW) { error(root, `Il faut au moins ${minW} semaines : choisis une date plus lointaine.`); return true; }
      if (w > 30) { error(root, 'Plus de 30 semaines : commence plus tard, ou prépare une course intermédiaire.'); return true; }
      a.goalDate = g;
    }
    a.goalTime = null;
    next(root);
    return true;
  }
  if ('qCreate' in t.dataset) {
    const o = options();
    const timed = o.objective === 'chrono' || (a.wantTime && o.goalDist);
    if (timed) {
      const tm = readHms(root, 'goal') || a.goalTime;
      if (!tm) { return true; }
      a.goalTime = tm;
    }
    const plan = buildPlan({ ...o, goalTime: timed ? a.goalTime : null });
    if (store.plan && Object.keys(store.log).length && !confirm('Ton programme actuel et son suivi seront archivés (Réglages permet d’y revenir). Créer le nouveau programme ?')) return true;
    store.replacePlan(plan);
    resetQuiz();
    location.hash = '#/';
    return true;
  }
  return false;
}

export function handleQuizInput(ev, root) {
  if (!root || !ev.target.closest('[data-quiz]')) return false;
  if (ev.target.matches('[data-q-want]')) { a.wantTime = ev.target.checked; a.goalTime = null; rerender(root); return true; }
  if (ev.target.matches('[data-q-time^="goal_"]')) {
    const tm = readHms(root, 'goal');
    if (tm) {
      a.goalTime = tm;
      clearTimeout(handleQuizInput.t);
      handleQuizInput.t = setTimeout(() => {
        const active = document.activeElement?.dataset?.qTime;
        root.innerHTML = render();
        save();
        if (active) root.querySelector(`[data-q-time="${active}"]`)?.focus();
      }, 900);
    }
    return true;
  }
  return true;
}

