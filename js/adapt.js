// Adapter une séance (fatigue, chaleur, peu de temps, douleur), la déplacer, et expliquer son but.
import { store } from './store.js';
import { totalTime } from './steps.js';
import { addDays, dateShort, esc } from './util.js';

const r5 = (x) => Math.max(5, Math.round(x / 5) * 5);
const clone = (x) => JSON.parse(JSON.stringify(x));
const slow = (pace, s) => (pace ? [pace[0] + s, pace[1] + s] : pace);

export const REASONS = [
  ['fatigue', 'Je suis fatigué'],
  ['chaleur', 'Il fait chaud'],
  ['temps', 'Peu de temps'],
  ['douleur', 'J’ai mal'],
];

function easyPace(s) {
  let p = null;
  const walk = (list) => list.forEach((st) => { if (st.k === 'repeat') walk(st.steps); else if ((st.k === 'run' || st.k === 'warmup') && st.pace && !p) p = st.pace; });
  walk(s.steps);
  return p || store.plan?.easyPace || [510, 540];
}

function scaleRepeats(steps, f) {
  return steps.map((st) => (st.k === 'repeat' ? { ...st, times: Math.max(2, Math.round(st.times * f)) } : st));
}

// Recompose le titre d'après les nouvelles étapes : « 3 × 4 min au seuil », « 16 min au seuil »…
const amount = (st) => (st.dist ? `${st.dist.toLocaleString('fr-FR')} m` : st.dur >= 60 ? `${Math.round(st.dur / 60)} min` : `${st.dur} s`);
function retitle(s, steps) {
  const rep = steps.find((x) => x.k === 'repeat');
  const run = steps.find((x) => x.k === 'run');
  const easy = s.title.match(/^\d+ min (très faciles|faciles)( \+ \d+ × 20 s)?$/);
  if (easy && run) return `${Math.round(run.dur / 60)} min ${easy[1]}${rep ? ` + ${rep.times} × 20 s` : ''}`;
  const fart = s.title.match(/^Fartlek \d+ × (.*)$/);
  if (fart && rep) return `Fartlek ${rep.times} × ${fart[1]}`;
  const m = s.title.match(/^\d+ × [\d\s ]+(?:min|s|m)(?: \d+)?( .*)?$/);
  if (rep && m) {
    const w = rep.steps.find((x) => x.k === 'work');
    return `${rep.times} × ${amount(w)}${m[1] || ''}`;
  }
  const single = s.title.match(/^\d+ min( au seuil| à l’allure objectif)$/);
  const work = steps.find((x) => x.k === 'work');
  if (single && work?.dur) return `${Math.round(work.dur / 60)} min${single[1]}`;
  return s.title;
}

// Proposition de séance modifiée, ou conseil seul (douleur)
export function propose(s, reason) {
  const E = easyPace(s);
  const min = Math.round(totalTime(s.steps) / 60);
  const hard = s.type === 'qualite' || s.type === 'test';
  if (reason === 'douleur') {
    return {
      advice: true,
      text: 'Ne cours pas aujourd’hui. Si la douleur est encore là demain, ou qu’elle augmente quand tu marches, fais-toi examiner. Une séance manquée ne se rattrape pas : reprends le programme quand tout va bien.',
    };
  }
  if (s.type === 'objectif') return { advice: true, text: 'C’est ta course : on ne la modifie pas. Pars simplement un peu plus prudemment si tu te sens fatigué ou s’il fait chaud.' };
  if (s.type === 'test') {
    return { advice: true, text: 'Un test se court en forme, au frais et sans contrainte de temps, sinon ton chrono serait faussé. Déplace-le à un autre jour de la semaine (juste en dessous).' };
  }

  let steps = clone(s.steps);
  let title = s.title;
  let note;
  if (reason === 'fatigue') {
    if (hard) {
      const m = r5(Math.max(25, min * 0.6));
      steps = [{ k: 'run', dur: m * 60, pace: E, z: 'E' }];
      title = `${m} min faciles`;
      note = 'Séance dure remplacée par un footing facile : courir fatigué sur une séance intense rapporte peu et expose aux blessures.';
    } else {
      const m = r5(min * 0.7);
      steps = [{ k: 'run', dur: m * 60, pace: E, z: 'E' }];
      title = `${m} min faciles`;
      note = 'Footing raccourci d’un tiers : on garde l’habitude de courir sans creuser la fatigue.';
    }
  } else if (reason === 'chaleur') {
    const walk = (list) => list.forEach((st) => {
      if (st.k === 'repeat') walk(st.steps);
      else {
        if (st.pace) st.pace = slow(st.pace, st.k === 'work' ? 10 : 15);
        if (st.dur && st.k === 'run') st.dur = r5((st.dur / 60) * 0.8) * 60;
        if (st.dur && st.k === 'work' && st.dur >= 120) st.dur = Math.round((st.dur * 0.8) / 30) * 30;
      }
    });
    steps = scaleRepeats(steps, 0.75);
    walk(steps);
    title = retitle(s, steps);
    note = 'Chaleur : séance réduite d’environ 20 % et allures ralenties de 10 à 15 s/km. À effort égal, le cœur monte plus vite quand il fait chaud. Cours tôt le matin ou à l’ombre, et emporte de l’eau.';
  } else if (reason === 'temps') {
    steps = steps.map((st) => (st.k === 'warmup' ? { ...st, dur: 600 } : st.k === 'cooldown' ? { ...st, dur: 300 } : st));
    if (hard) steps = scaleRepeats(steps, 0.7);
    const cap = (d) => (s.type === 'longue' ? Math.min(45 * 60, r5((d / 60) * 0.65) * 60) : 20 * 60);
    steps = steps.map((st) => (st.k === 'run' && st.dur ? { ...st, dur: Math.min(st.dur, cap(st.dur)) } : st));
    title = retitle(s, steps);
    note = hard
      ? 'Version courte : échauffement de 10 min et cœur de séance réduit. Mieux vaut une séance courte que pas de séance.'
      : 'Version courte : l’essentiel est de garder le rythme des sorties. Mieux vaut 20 minutes que rien.';
  }
  const newMin = Math.round(totalTime(steps) / 60);
  if (newMin >= min && title === s.title) {
    return { advice: true, text: 'Rien à changer : cette séance est déjà courte et facile. Cours-la tranquillement, quitte à marcher quelques instants.' };
  }
  return { title, steps, note, min, newMin };
}

export function applyAdapt(id, reason) {
  return store.adjustPlan((plan) => {
    for (const w of plan.weeks) {
      const s = w.sessions.find((x) => x.id === id);
      if (!s) continue;
      const p = propose(s, reason);
      if (p.advice) return false;
      if (!s.original) s.original = { title: s.title, steps: s.steps, note: s.note };
      s.title = p.title;
      s.steps = p.steps;
      s.note = p.note;
      s.adapted = reason;
      return true;
    }
    return false;
  });
}

export function undoAdapt(id) {
  store.adjustPlan((plan) => {
    for (const w of plan.weeks) {
      const s = w.sessions.find((x) => x.id === id);
      if (s?.original) {
        Object.assign(s, s.original);
        delete s.original;
        delete s.adapted;
      }
    }
  });
}

// Jours possibles pour déplacer une séance dans sa semaine
export function moveOptions(s) {
  const plan = store.plan;
  const w = plan.weeks.find((x) => x.n === s.week);
  const start = addDays(plan.start, (w.n - 1) * 7);
  const taken = new Set(w.sessions.map((x) => x.day));
  return Array.from({ length: 7 }, (_, d) => ({ d, date: addDays(start, d), free: !taken.has(d) || d === s.day, current: d === s.day }));
}

export function moveSession(id, day) {
  store.adjustPlan((plan) => {
    for (const w of plan.weeks) {
      const s = w.sessions.find((x) => x.id === id);
      if (!s) continue;
      s.day = day;
      w.sessions.sort((a, b) => a.day - b.day);
    }
  });
}

// À quoi sert la séance
export function why(s) {
  const z = new Set();
  const walk = (list) => list.forEach((st) => { if (st.k === 'repeat') walk(st.steps); else if (st.k === 'work') z.add(st.z || (st.dist && st.dist <= 400 ? 'R' : 'T')); });
  walk(s.steps);
  if (s.type === 'objectif') return 'Le jour J : tout le programme a préparé ce moment.';
  if (s.type === 'test') return 'Mesurer ta forme du moment. Ton chrono recalcule toutes les allures de la suite du programme.';
  if (/côte/.test(s.title)) return 'Les côtes renforcent les mollets, les cuisses et les fessiers, et améliorent la foulée, sans les chocs de la vitesse sur le plat.';
  if (/Fartlek/.test(s.title)) return 'Des changements de rythme pour habituer le corps à accélérer, en douceur. Une transition vers les séances plus structurées.';
  if (z.has('G')) return 'Travailler à l’allure exacte du jour J : le corps et la tête apprennent à la tenir et à la reconnaître sans montre.';
  if (z.has('R')) return 'Vitesse pure et économie de course : des répétitions courtes et rapides, avec une récupération complète, pour une foulée plus efficace.';
  if (z.has('I')) return 'Développer ta VMA, ton « moteur » : la vitesse maximale que ton cœur et tes poumons peuvent soutenir. C’est elle qui tire tous les chronos vers le haut.';
  if (z.has('T')) return 'Repousser ton seuil : l’allure que tu peux tenir longtemps sans t’asphyxier. Le meilleur investissement pour le 5 km au semi-marathon.';
  if (s.type === 'longue') return 'L’endurance : plus de capillaires et de mitochondries dans les muscles, des tendons plus solides et un corps qui utilise mieux ses graisses.';
  if (z.size) return 'Un footing facile pour construire l’endurance, et quelques accélérations pour garder une foulée vive sans fatiguer.';
  return 'Construire l’endurance de base et récupérer des séances dures. Courir lentement est ce qui permet de courir vite les autres jours.';
}

/* ---------- Rendu ---------- */

export function adaptBlock(s, pending) {
  if (store.entry(s.id)?.done) return '';
  const reasons = REASONS.map(([k, l]) => `<button class="chip${pending === k ? ' is-on' : ''}" data-adapt="${k}" data-sid="${s.id}">${l}</button>`).join('');
  let proposal = '';
  if (pending) {
    const p = propose(s, pending);
    proposal = p.advice
      ? `<p class="coach-text">${esc(p.text)}</p>${pending === 'douleur' ? '<a class="btn btn-small" href="#/conseil/blessures">Douleurs et blessures</a>' : ''}`
      : `
        <p class="coach-text">${esc(p.note)}</p>
        <div class="coach-edit">
          <div class="ce-row is-old"><b>${esc(s.title)}</b><span>${p.min} min</span><i aria-label="Séance prévue">×</i></div>
          <div class="ce-row is-new"><b>${esc(p.title)}</b><span>${p.newMin} min</span><i>Nouveau</i></div>
        </div>
        <div class="coach-actions">
          <button class="btn btn-primary" data-adapt-accept="${pending}" data-sid="${s.id}">Accepter</button>
          <button class="btn btn-ghost" data-adapt-cancel data-sid="${s.id}">Refuser</button>
        </div>`;
  }
  return `
    <section class="coach">
      <p class="coach-kicker">Coach</p>
      <h2 class="coach-title">${s.adapted ? 'Séance adaptée' : 'Pas dans ton assiette aujourd’hui ?'}</h2>
      ${s.original ? `<p class="coach-text">Prévue à l’origine : ${esc(s.original.title)}.</p><button class="btn btn-small" data-adapt-undo data-sid="${s.id}">Revenir à la séance prévue</button>` : `<div class="chips">${reasons}</div>${proposal}`}
    </section>`;
}

export function moveBlock(s) {
  if (store.entry(s.id)?.done || s.type === 'objectif') return '';
  const opts = moveOptions(s);
  return `
    <details class="move">
      <summary>Déplacer la séance</summary>
      <div class="move-days">${opts.map((o) => `<button class="chip${o.current ? ' is-on' : ''}" data-move="${o.d}" data-sid="${s.id}" ${o.free ? '' : 'disabled'}>${dateShort(o.date)}</button>`).join('')}</div>
      <p class="hint">Garde de préférence un jour sans séance dure entre deux séances difficiles, et pas de séance dure la veille de la sortie longue.</p>
    </details>`;
}
