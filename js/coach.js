// Moteur d'entraînement de Foulée.
//
// Principes appliqués :
// - Allures personnelles par la méthode VDOT (équations de Daniels et Gilbert) : E facile, M marathon,
//   T seuil, I intervalles, R répétitions, G allure objectif.
// - Environ 80 % du temps en endurance facile ; volumes plafonnés : seuil ≈ 10 %, intervalles ≈ 8 %,
//   répétitions ≈ 5 % du volume hebdomadaire.
// - Débutant complet : course-marche sur 9 semaines (modèle NHS Couch to 5K) jusqu'à 30 min continues.
// - Progression de +6 à +10 % par semaine, semaine allégée toutes les 3 ou 4 semaines selon l'âge
//   et les blessures, sortie longue plafonnée en part du volume.
// - Phases : base, développement, spécifique, affûtage (volume −25 à −55 %, intensité et nombre
//   de séances gardés), tests en fin de phase qui recalent les allures.
import { addDays, clock, daysBetween, distance as fmtDist, parseISO } from './util.js';

/* =========================================================================
   VDOT et allures
   ========================================================================= */

const vo2 = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v en m/min
const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t en min

export function vdotFromRace(dist, sec) {
  const t = sec / 60;
  return vo2(dist / t) / pctMax(t);
}

function velocityFor(vo) {
  const a = 0.000104, b = 0.182258, c = -4.6 - vo;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

// Temps de course prévu (s) sur `dist` mètres pour un VDOT donné
export function raceTime(vdot, dist) {
  let lo = dist / 10, hi = dist / 0.8;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(dist, mid) > vdot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const paceAt = (vdot, pct) => 60000 / velocityFor(vdot * pct); // s/km
const r = Math.round;

// Plages d'allure (s/km), du plus rapide au plus lent
export function zones(vdot) {
  const m = raceTime(vdot, 42195) / 42.195;
  const t = paceAt(vdot, 0.88);
  const i = paceAt(vdot, 0.975);
  const rr = paceAt(vdot, 1.06);
  return {
    E: [r(paceAt(vdot, 0.72)), r(paceAt(vdot, 0.62))],
    M: [r(m - 3), r(m + 3)],
    T: [r(t - 3), r(t + 3)],
    I: [r(i - 3), r(i + 3)],
    R: [r(rr - 3), r(rr + 3)],
  };
}

export const ZONE_INFO = {
  E: { name: 'Facile', use: 'Footings, sortie longue, échauffement. Tu dois pouvoir parler.' },
  M: { name: 'Marathon', use: 'Allure soutenue mais tenable longtemps.' },
  T: { name: 'Seuil', use: '« Confortablement difficile » : tenable environ une heure.' },
  I: { name: 'Intervalles', use: 'Répétitions de 2 à 5 min, souffle court.' },
  R: { name: 'Vitesse', use: 'Répétitions courtes et rapides, récupération complète.' },
};

/* =========================================================================
   Profil du coureur
   ========================================================================= */

export const LEVELS = ['Débutant complet', 'Débutant', 'Intermédiaire', 'Confirmé', 'Expert'];
const LEVEL_TEXT = [
  'Tu démarres : on commence par alterner course et marche, jusqu’à courir 30 minutes sans t’arrêter.',
  'Tu as déjà quelques sorties : on construit d’abord l’endurance, la vitesse viendra ensuite.',
  'Tu cours régulièrement : on développe le seuil et la vitesse, sans brûler les étapes.',
  'Tu as une bonne base : deux séances de qualité par semaine si tu cours au moins 4 fois.',
  'Gros volume et longue expérience : le programme peut être exigeant.',
];
const EST_VDOT = [28, 31, 37, 43, 50];

// a : réponses au questionnaire
export function assess(a) {
  const notes = [];
  let level;
  if (a.objective === 'debut' || a.freq === 0 || a.longest === 0) level = 0;
  else {
    const freqPts = [0, 0, 1, 2, 3][a.freq];
    const score = freqPts + a.longest + a.experience; // 0 à 10
    level = score <= 3 ? 1 : score <= 6 ? 2 : score <= 8 ? 3 : 4;
    level = Math.min(level, a.longest + 1, Math.max(1, freqPts + 1)); // pas plus haut que l'endurance et la pratique actuelles
  }

  let vdot = EST_VDOT[level];
  let estimated = true;
  if (a.race?.dist && a.race?.time) {
    const v = vdotFromRace(a.race.dist, a.race.time);
    if (v >= 18 && v <= 85) { vdot = v; estimated = false; }
  }
  if (a.objective === 'reprise' && !estimated) {
    vdot *= 0.95; // chrono d'avant la pause : on repart un peu en dessous
    notes.push('Ton chrono date d’avant ta pause : les allures de départ sont un peu plus douces.');
  }

  const masters = a.age >= 3; // 50 ans et plus
  const cautious = a.injury === 'douleur' || a.objective === 'reprise';
  if (a.injury === 'douleur') notes.push('Tu as encore mal : fais-toi examiner avant de commencer. Le programme démarre très progressivement, sans séance intense les 3 premières semaines.');
  if (a.injury === 'guerie') notes.push('Blessure récente : progression un peu plus prudente et renforcement musculaire conseillé.');
  if (masters && level > 0) notes.push('Après 50 ans, la récupération compte double : une semaine allégée toutes les 3 semaines.');
  if (estimated && level > 0) notes.push('Sans chrono récent, tes allures sont estimées. Un test en semaine 2 ou 3 les ajustera.');

  return { level, label: LEVELS[level], text: LEVEL_TEXT[level], vdot, estimated, masters, cautious, notes };
}

/* =========================================================================
   Objectif conseillé
   ========================================================================= */

const GAIN = [ // progression possible par semaine et plafond, selon le niveau
  { perWeek: 0.012, cap: 0.18 },
  { perWeek: 0.01, cap: 0.15 },
  { perWeek: 0.006, cap: 0.09 },
  { perWeek: 0.004, cap: 0.06 },
  { perWeek: 0.0025, cap: 0.04 },
];

const roundTime = (sec) => (sec >= 3600 ? Math.round(sec / 60) * 60 : sec >= 900 ? Math.round(sec / 15) * 15 : Math.round(sec / 5) * 5);

export function suggestTarget(profile, dist, weeks) {
  const now = raceTime(profile.vdot, dist);
  const g = GAIN[profile.level];
  const gain = Math.min(g.cap, g.perWeek * Math.max(0, weeks - 1)) * (profile.cautious ? 0.6 : 1);
  return { now: roundTime(now), target: roundTime(now * (1 - gain)) };
}

export function feasibility(profile, dist, weeks, goalTime) {
  const { now, target } = suggestTarget(profile, dist, weeks);
  const needed = 1 - goalTime / now;
  const possible = 1 - target / now;
  if (needed <= 0) return { level: 'easy', now, target };
  if (needed <= possible * 1.05) return { level: 'ok', now, target };
  if (needed <= possible * 1.6) return { level: 'stretch', now, target };
  return { level: 'hard', now, target };
}

/* =========================================================================
   Étapes de séance
   ========================================================================= */

const step = (k, o) => ({ k, ...o });
const rep = (times, steps) => ({ k: 'repeat', times, steps });

/* =========================================================================
   Course-marche (débutant complet), d'après NHS Couch to 5K
   ========================================================================= */

const RW = [ // [course, marche] en secondes ; chaque séance : 5 min de marche avant et après
  [[60, 90, 8]],
  [[90, 120, 6]],
  [[90, 90], [180, 180], [90, 90], [180, 0]],
  [[180, 90], [300, 150], [180, 90], [300, 0]],
  null, // semaine 5 : trois séances différentes
  null,
  [[1500, 0]],
  [[1680, 0]],
  [[1800, 0]],
];
const RW5 = [[[300, 180], [300, 180], [300, 0]], [[480, 300], [480, 0]], [[1200, 0]]];
const RW6 = [[[300, 180], [480, 180], [300, 0]], [[600, 180], [600, 0]], [[1500, 0]]];

function runWalkSession(blocks, E) {
  const walk = (s) => step('recovery', { dur: s, label: 'marche active' });
  const steps = [step('warmup', { dur: 300, label: 'marche rapide' })];
  for (const b of blocks) {
    if (b.length === 3) steps.push(rep(b[2], [step('run', { dur: b[0], pace: E, z: 'E', label: 'course lente' }), walk(b[1])]));
    else {
      steps.push(step('run', { dur: b[0], pace: E, z: 'E', label: 'course lente' }));
      if (b[1]) steps.push(walk(b[1]));
    }
  }
  steps.push(step('cooldown', { dur: 300, label: 'marche' }));
  const runSec = blocks.reduce((s, b) => s + b[0] * (b[2] || 1), 0);
  const single = blocks.length === 1 && !blocks[0][1];
  const title = single ? `${Math.round(runSec / 60)} min de course continue`
    : blocks.length === 1 ? `${blocks[0][2]} × (${fmtSec(blocks[0][0])} course / ${fmtSec(blocks[0][1])} marche)`
      : `Course-marche : ${Math.round(runSec / 60)} min de course`;
  return {
    type: 'facile', title, steps,
    note: 'Course très lente, au rythme où tu peux parler. La marche fait partie de la séance : marche d’un bon pas.',
  };
}

const fmtSec = (s) => (s % 60 ? `${Math.floor(s / 60)} min ${s % 60}` : `${s / 60} min`).replace(/^0 min /, '');

/* =========================================================================
   Paramètres selon l'objectif
   ========================================================================= */

const GOAL = {
  3000: { name: '3 km', longMax: 65, peak: [0, 130, 180, 230, 290], taper: 1, test: 3000, reps: [400, 600, 800, 1000, 1000], gVol: [2400, 3600] },
  5000: { name: '5 km', longMax: 75, peak: [0, 140, 190, 250, 320], taper: 1, test: 5000, reps: [800, 1000, 1000, 1200, 1600], gVol: [3000, 5000] },
  10000: { name: '10 km', longMax: 95, peak: [0, 170, 220, 290, 370], taper: 1, test: 5000, reps: [1000, 1600, 2000, 2000, 3000], gVol: [5000, 8000] },
  21097: { name: 'semi-marathon', longMax: 125, peak: [0, 200, 260, 330, 420], taper: 2, test: 5000, gMin: [20, 45] },
  42195: { name: 'marathon', longMax: 180, peak: [0, 260, 320, 400, 500], taper: 3, test: 10000, gMin: [30, 75] },
  0: { name: 'forme', longMax: 70, peak: [0, 120, 160, 210, 260], taper: 0, test: 5000 },
};

export function goalLabel(dist, time) {
  const name = GOAL[dist]?.name || fmtDist(dist);
  if (!time) return `Finir un ${name}`;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} en ${time >= 3600 ? clock(time) : `${Math.floor(time / 60)} min${time % 60 ? ` ${String(time % 60).padStart(2, '0')}` : ''}`}`;
}

/* =========================================================================
   Construction du programme
   ========================================================================= */

const r5 = (x) => Math.max(5, Math.round(x / 5) * 5);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, f) => a + (b - a) * f;

export function nextSunday(fromIso) {
  return addDays(fromIso, (7 - parseISO(fromIso).getDay()) % 7);
}

export function weeksBetween(start, end) {
  return Math.ceil((daysBetween(start, end) + 1) / 7);
}

// o : réponses + choix finaux { goalDist (0 = forme), goalTime (null = finir), goalDate, start, perWeek, days, longDay, weekdayMax }
export function buildPlan(o) {
  const profile = assess(o);
  const days = [...o.days].sort((a, b) => a - b);
  const longDay = days.includes(o.longDay) ? o.longDay : days[0];
  const ws = parseISO(o.start).getDay();
  const off = (wd) => (wd - ws + 7) % 7;
  const goal = GOAL[o.goalDist] || GOAL[5000];
  const hasRace = o.goalDist > 0 && !!o.goalDate;

  const rwWeeks = profile.level === 0 ? 9 : 0;
  let n = o.goalDate ? weeksBetween(o.start, o.goalDate) : (o.objective === 'debut' ? 9 : 12);
  n = Math.max(n, rwWeeks);
  const mainWeeks = n - rwWeeks;

  // Allures : VDOT de départ → VDOT visé
  const vdot0 = profile.vdot;
  let vdotGoal = vdot0;
  if (o.goalTime && o.goalDist) vdotGoal = Math.max(vdot0, vdotFromRace(o.goalDist, o.goalTime));
  else if (o.goalDist) {
    // Objectif « finir » : on vise la moitié du progrès possible, l'important est d'arriver bien
    const { now, target } = suggestTarget(profile, o.goalDist, n);
    vdotGoal = vdotFromRace(o.goalDist, now - (now - target) * 0.5);
  }
  const goalPace = o.goalDist ? (o.goalTime || raceTime(vdotGoal, o.goalDist)) / (o.goalDist / 1000) : null;
  const G = goalPace ? [r(goalPace), r(goalPace)] : null;

  const weeks = [];
  const phases = [];

  /* ---------- Course-marche ---------- */
  if (rwWeeks) {
    const E = zones(vdot0).E;
    for (let i = 0; i < 9; i += 1) {
      const list = i === 4 ? RW5 : i === 5 ? RW6 : [RW[i], RW[i], RW[i]];
      const sessDays = spread(days, 3, longDay);
      weeks.push({
        n: i + 1, light: false,
        sessions: list.map((blocks, j) => ({ day: off(sessDays[j]), ...runWalkSession(blocks, E) })).sort((a, b) => a.day - b.day),
      });
    }
    phases.push({ name: 'Course-marche', from: 1, to: 9, aim: 'Passer de 1 minute à 30 minutes de course sans t’arrêter.' });
  }

  /* ---------- Programme principal ---------- */
  if (mainWeeks > 0) {
    const level = Math.max(1, profile.level);
    const taper = hasRace ? Math.min(goal.taper, Math.max(1, Math.floor(mainWeeks / 6))) : 0;
    const buildWeeks = mainWeeks - taper;
    const base = Math.max(2, Math.round(buildWeeks * (profile.cautious ? 0.4 : 0.3)));
    const spec = hasRace ? Math.max(2, Math.round(buildWeeks * 0.3)) : 0;
    const dev = Math.max(0, buildWeeks - base - spec);
    const first = rwWeeks + 1;
    const p = [];
    p.push({ name: 'Base', from: first, to: first + base - 1, aim: 'Endurance et régularité : surtout du facile, des côtes ou des accélérations pour la foulée.' });
    if (dev) p.push({ name: 'Développement', from: first + base, to: first + base + dev - 1, aim: 'Seuil et intervalles pour élever ton niveau.' });
    if (spec) p.push({ name: 'Spécifique', from: first + base + dev, to: first + base + dev + spec - 1, aim: `Habituer le corps à l’allure objectif${G ? ` (${clock(G[0])}/km)` : ''}.` });
    if (taper) p.push({ name: 'Affûtage', from: n - taper + 1, to: n, aim: 'Moins de volume, même intensité : tu arrives frais le jour J.' });
    phases.push(...p);

    // Volume hebdomadaire (minutes)
    const sessions = o.perWeek;
    const freqNow = [0, 0.5, 1, 2.5, 4.5][o.freq] || 0;
    const longNow = [8, 20, 40, 70, 100][o.longest] || 20;
    let W = rwWeeks ? 95 : Math.max(sessions * 22, freqNow * longNow * 0.8);
    if (profile.cautious) W *= 0.85;
    const longCap = Math.min(goal.longMax, level === 1 ? goal.longMax * 0.85 : goal.longMax);
    let peak = Math.max(W, goal.peak[level]);
    peak = Math.min(peak, sessions * o.weekdayMax + (longCap - o.weekdayMax));
    const growth = o.injury === 'douleur' ? 0.06 : profile.cautious || level === 1 ? 0.08 : 0.1;
    const cycle = profile.masters || o.injury !== 'non' ? 3 : 4;
    const maxQuality = (profile.masters && o.age >= 4) || o.injury === 'douleur' ? 1 : level >= 3 && sessions >= 4 ? 2 : sessions >= 3 ? 1 : (level >= 2 ? 1 : 0);

    // Tests : semaine 2-3 si allures estimées, fin de base, fin de développement, 3 semaines avant l'objectif
    const tests = new Set();
    if (profile.estimated) tests.add(first + Math.min(o.injury === 'douleur' ? 5 : 2, base - 1));
    if (base >= 4) tests.add(first + base - 1);
    if (dev >= 3) tests.add(first + base + dev - 1);
    if (hasRace && mainWeeks >= 10) tests.add(n - taper - 2);
    if (!hasRace) tests.add(n);
    // pas deux tests à moins de 3 semaines d'écart
    const testList = [...tests].sort((a, b) => a - b).filter((w, i, arr) => i === 0 || w - arr[i - 1] >= 3);

    let built = W;
    let peakSeen = W;
    for (let i = 1; i <= mainWeeks; i += 1) {
      const n_ = rwWeeks + i;
      const ph = p.find((x) => n_ >= x.from && n_ <= x.to);
      const k = n_ - ph.from;
      const isTaper = ph.name === 'Affûtage';
      const isTest = testList.includes(n_);
      const nearTest = testList.includes(n_ - 1) || testList.includes(n_ + 1);
      const recovery = !isTaper && i > 1 && i % cycle === 0 && !isTest && !nearTest && n_ < n - taper;
      if (!isTaper && !recovery && i > 1) built = Math.min(peak, built * (1 + growth));
      peakSeen = Math.max(peakSeen, built);
      let weekMin = built;
      if (recovery) weekMin = built * 0.75;
      if (isTest) weekMin = built * 0.85;
      if (isTaper && taper === 1) weekMin = peakSeen * 0.6;
      if (isTaper && taper === 2) weekMin = peakSeen * (n_ === n ? 0.55 : 0.75);
      if (isTaper && taper === 3) weekMin = peakSeen * (n_ === n ? 0.45 : n_ === n - 1 ? 0.65 : 0.8);

      // Allures de la semaine
      const f = clamp((i - 1) / Math.max(buildWeeks - 1, 1), 0, 1);
      const vdotW = lerp(vdot0, vdotGoal, f);
      const Z = zones(vdotW);
      Z.E = zones(lerp(vdot0, vdotGoal, f * 0.5)).E;
      Z.G = G;

      const testDist = level <= 1 ? Math.min(goal.test, 3000) : goal.test;
      const longG = ph.name === 'Spécifique' && !!G && o.goalDist >= 21097 && k % 2 === 1;
      const ctx = { Z, weekMin, level, goal, o, k, ph, isTest, recovery, isTaper, longG, phaseLen: ph.to - ph.from + 1, profile, testDist, testRepere: r5(raceTime(vdotW, testDist)) };

      // Nombre de séances de qualité cette semaine
      let nQ = maxQuality;
      if (ph.name === 'Base') nQ = level >= 2 && maxQuality ? 1 : 0;
      if (o.injury === 'douleur' && i <= 3) nQ = 0;
      if (recovery) nQ = Math.min(nQ, 1);
      if (isTaper) nQ = 1;
      if (longG) nQ = Math.max(1, nQ - 1); // la sortie longue porte déjà l'allure objectif
      if (isTest) nQ = Math.max(1, nQ); // le test compte comme une séance de qualité

      const qualities = [];
      for (let q = 0; q < nQ; q += 1) qualities.push(isTest && q === 0 ? testSession(ctx) : qualitySession(ctx, q, nQ));
      const longSess = longSession(ctx, longCap);
      const nEasy = Math.max(0, sessions - 1 - qualities.length);
      const used = longSess.min + qualities.reduce((s, x) => s + x.min, 0);
      const easyMin = nEasy ? clamp(r5((weekMin - used) / nEasy), 20, o.weekdayMax) : 0;
      const easies = [];
      for (let e = 0; e < nEasy; e += 1) {
        const withStrides = e === 0 && !isTaper && level >= 1 && !(o.injury === 'douleur' && i <= 3) && (ph.name !== 'Spécifique' || nQ < 2);
        easies.push(easySession(ctx, easyMin, withStrides, e === nEasy - 1 && (profile.cautious || profile.masters || o.injury === 'guerie')));
      }

      // Jours : sortie longue au jour choisi, qualités éloignées d'elle et entre elles
      const others = days.filter((d) => d !== longDay);
      const qDays = pickSpread(others, longDay, qualities.length, off);
      const eDays = others.filter((d) => !qDays.includes(d));
      const list = [{ day: off(longDay), ...longSess.s }];
      qualities.forEach((q, j) => list.push({ day: off(qDays[j]), ...q.s }));
      easies.forEach((e, j) => list.push({ day: off(eDays[j]), ...e.s }));
      weeks.push({ n: n_, light: recovery || isTest || isTaper, sessions: list.sort((a, b) => a.day - b.day), minutes: Math.round(weekMin) });
    }

    if (hasRace) finishWithRace(weeks, o, days, off, G, zones(vdotGoal));
  }

  // Fin du parcours débutant sans objectif chiffré : la dernière séance est la course de 30 min
  if (rwWeeks && mainWeeks <= 0) {
    const last = weeks[weeks.length - 1].sessions.at(-1);
    last.type = 'objectif';
    last.title = '30 min de course continue';
    last.note = 'Le grand jour : 30 minutes sans t’arrêter, à ton rythme. Bravo d’être arrivé jusque-là !';
  }

  weeks.forEach((w) => w.sessions.forEach((s, j) => { s.id = `w${w.n}s${j + 1}`; }));

  const name = o.goalDist ? goalLabel(o.goalDist, o.goalTime) : o.objective === 'debut' ? 'Courir 30 minutes' : 'Forme et régularité';
  return {
    id: `plan-${Date.now()}`,
    name,
    start: o.start,
    goal: { distance: o.goalDist || 0, time: o.goalTime || null, label: name, secondary: '' },
    baseline: profile.estimated ? `niveau ${profile.label.toLowerCase()} (allures estimées)` : `${fmtDist(o.race.dist)} en ${clock(o.race.time)}`,
    easyPace: zones(vdot0).E,
    coach: { level: profile.level, label: profile.label, vdot0, vdot: vdot0, vdotGoal, estimated: profile.estimated, goalPace, notes: profile.notes },
    generated: o,
    phases,
    weeks,
  };
}

/* ---------- Choix des jours ---------- */

function spread(days, count, longDay) {
  const out = [longDay];
  const rest = days.filter((d) => d !== longDay);
  while (out.length < count && rest.length) out.push(rest.shift());
  return out;
}

// Jours des séances de qualité : loin de la sortie longue et entre elles.
// On évite surtout le lendemain de la sortie longue, puis la veille, puis deux qualités d'affilée.
function pickSpread(cands, longDay, count, off) {
  if (!count) return [];
  const gap = (a, b) => { const d = Math.abs(off(a) - off(b)); return Math.min(d, 7 - d); };
  const after = (d) => (off(d) - off(longDay) + 7) % 7 === 1;
  const before = (d) => (off(longDay) - off(d) + 7) % 7 === 1;
  const combos = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c])));
  let best = null;
  for (const set of combos(cands, Math.min(count, cands.length))) {
    const all = [longDay, ...set];
    let score = 0;
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) score += Math.min(gap(all[i], all[j]), 3);
    for (const d of set) score -= (after(d) ? 2 : 0) + (before(d) ? 1.5 : 0);
    for (let i = 0; i < set.length; i += 1) for (let j = i + 1; j < set.length; j += 1) if (gap(set[i], set[j]) === 1) score -= 2;
    if (!best || score > best.score) best = { set, score };
  }
  return best.set;
}

/* ---------- Séances ---------- */

const WU = (Z) => step('warmup', { dur: 900, pace: Z.E, z: 'E' });
const CD = (Z) => step('cooldown', { dur: 600, pace: Z.E, z: 'E' });
const jog = (sec) => step('recovery', { dur: Math.max(30, Math.round(sec / 15) * 15), label: 'trot' });

function easySession(ctx, min, strides, strength) {
  const steps = [step('run', { dur: min * 60, pace: ctx.Z.E, z: 'E' })];
  let title = `${min} min faciles`;
  if (strides) {
    const nS = clamp(4 + Math.floor(ctx.k / 2) * 2, 4, 8);
    steps.push(rep(nS, [step('work', { dur: 20, label: 'accélération progressive, sans être à fond' }), step('recovery', { dur: 60, label: 'marche ou trot' })]));
    title += ` + ${nS} × 20 s`;
  }
  const note = strength
    ? 'Après la séance : 10 min de renforcement (gainage, mollets, fessiers, squats). C’est la meilleure prévention des blessures.'
    : strides ? 'Les accélérations travaillent la foulée sans fatiguer : relâché, sur du plat.' : 'Tu dois pouvoir parler en courant. Trop facile, c’est bien.';
  return { min: min + (strides ? 8 : 0), s: { type: 'facile', title, steps, note } };
}

function longSession(ctx, longCap) {
  const { Z, weekMin, o, ph, isTaper, recovery } = ctx;
  const share = (o.perWeek <= 2 ? 0.45 : o.perWeek === 3 ? 0.36 : o.perWeek === 4 ? 0.3 : 0.27) + (o.goalDist >= 42195 ? 0.06 : o.goalDist >= 21097 ? 0.03 : 0);
  let min = r5(clamp(weekMin * share, 30, longCap));
  if (isTaper || recovery) min = r5(Math.min(min, longCap * 0.7));
  const steps = [];
  let title = `${min} min faciles`;
  let note = 'Sortie longue : toujours en aisance. Au-delà d’une heure, emporte de l’eau.';
  // Semi et marathon : fin de sortie longue à l'allure objectif en phase spécifique
  if (ctx.longG) {
    const gMin = r5(clamp(min * 0.3, 15, o.goalDist >= 42195 ? 60 : 30));
    steps.push(step('run', { dur: (min - gMin) * 60, pace: Z.E, z: 'E' }));
    steps.push(step('work', { dur: gMin * 60, pace: Z.G, z: 'G', label: 'allure objectif' }));
    title = `${min} min dont ${gMin} min à l’allure objectif`;
    note = 'Finir la sortie longue à l’allure du jour J, sur des jambes fatiguées : la meilleure répétition générale.';
  } else steps.push(step('run', { dur: min * 60, pace: Z.E, z: 'E' }));
  return { min, s: { type: 'longue', title, steps, note } };
}

function testSession(ctx) {
  const { Z, testRepere } = ctx;
  return {
    min: 25 + Math.round(testRepere / 60),
    s: {
      type: 'test', title: `Test ${fmtDist(ctx.testDist)}`, repere: testRepere, testDist: ctx.testDist,
      steps: [WU(Z), step('work', { dist: ctx.testDist, label: 'le plus vite possible, allure régulière' }), CD(Z)],
      note: 'Note ton temps exact : Foulée recalcule tes allures pour la suite du programme.',
    },
  };
}

function qualitySession(ctx, q, nQ) {
  const { ph, o } = ctx;
  const short = o.goalDist && o.goalDist <= 5000;
  if (ctx.isTaper) return taperSession(ctx);
  if (ctx.recovery) return fartlek(ctx, true);
  if (ph.name === 'Base') return ctx.k % 2 === 0 ? hills(ctx) : fartlek(ctx);
  if (ph.name === 'Développement') {
    if (nQ === 2) return q === 0 ? threshold(ctx) : (short && ctx.k % 2 === 1 ? reps(ctx) : intervals(ctx));
    const cyc = short ? ['T', 'I', 'T', 'R'] : ['T', 'I'];
    const kind = cyc[ctx.k % cyc.length];
    return kind === 'T' ? threshold(ctx) : kind === 'I' ? intervals(ctx) : reps(ctx);
  }
  // Spécifique
  if (q === 0 || nQ === 1) {
    if (nQ === 1 && ctx.longG) return threshold(ctx); // la sortie longue porte l'allure objectif
    return racePace(ctx);
  }
  return o.goalDist >= 21097 ? threshold(ctx) : o.goalDist === 3000 ? reps(ctx) : intervals(ctx, true);
}

function hills(ctx) {
  const n = clamp(6 + ctx.k, 6, ctx.level >= 3 ? 12 : 10);
  const up = ctx.level >= 3 ? 60 : 45;
  return {
    min: 25 + Math.round((n * up * 3) / 60),
    s: {
      type: 'qualite', title: `${n} × ${up} s en côte`,
      steps: [WU(ctx.Z), rep(n, [step('work', { dur: up, label: 'montée, effort soutenu' }), step('recovery', { dur: up * 2, label: 'descente en trottinant' })]), CD(ctx.Z)],
      note: 'Choisis une côte régulière. Monte en poussant sur les bras, buste droit, foulée courte. Pas besoin de regarder l’allure.',
    },
  };
}

function fartlek(ctx, soft = false) {
  const n = soft ? 5 : clamp(6 + Math.floor(ctx.k / 2), 6, 10);
  const on = soft ? 60 : 90;
  return {
    min: 25 + Math.round((n * (on + 90)) / 60),
    s: {
      type: 'qualite', title: `Fartlek ${n} × ${fmtSec(on)}`,
      steps: [WU(ctx.Z), rep(n, [step('work', { dur: on, pace: ctx.Z.T, z: 'T', label: 'soutenu' }), step('recovery', { dur: 90, label: 'trot' })]), CD(ctx.Z)],
      note: soft ? 'Semaine allégée : des relances courtes pour garder du rythme, sans se fatiguer.' : 'Des relances au seuil, récupération en trottinant : on habitue le corps au changement de rythme.',
    },
  };
}

function threshold(ctx) {
  const { Z, weekMin, level, k } = ctx;
  const total = clamp(weekMin * 0.1, level === 1 ? 10 : 15, level >= 3 ? 40 : 25); // minutes au seuil
  let main, title;
  if (level >= 2 && k >= 3 && total >= 20) {
    const m = r5(Math.min(total, 30));
    main = [step('work', { dur: m * 60, pace: Z.T, z: 'T', label: 'seuil continu' })];
    title = `${m} min au seuil`;
  } else {
    const block = [5, 6, 8, 10, 12][clamp(Math.floor(k / 2), 0, 4)];
    const n = clamp(Math.round(total / block), 2, 6);
    main = [rep(n, [step('work', { dur: block * 60, pace: Z.T, z: 'T' }), jog(60 * Math.max(1, block / 5))])];
    title = `${n} × ${block} min au seuil`;
  }
  return {
    min: 25 + Math.round(total * 1.2),
    s: { type: 'qualite', title, steps: [WU(Z), ...main, CD(Z)], note: 'Allure « confortablement difficile » : tu pourrais la tenir environ une heure. Régulier du début à la fin.' },
  };
}

function intervals(ctx, sharpen = false) {
  const { Z, weekMin, level, k, goal } = ctx;
  const totalMin = clamp(weekMin * 0.08, 8, level >= 3 ? 24 : 16);
  const list = level <= 2 ? [400, 600, 800, 800, 1000] : [800, 1000, 1000, 1200, 1600];
  const d = sharpen ? (goal.reps?.[2] || 1000) : list[clamp(Math.floor(k / 2), 0, 4)];
  const repSec = (d / 1000) * Z.I[0];
  const n = clamp(Math.round((totalMin * 60) / repSec), 4, 10);
  return {
    min: 25 + Math.round((n * repSec * 2) / 60),
    s: {
      type: 'qualite', title: `${n} × ${d.toLocaleString('fr-FR')} m`,
      steps: [WU(Z), rep(n, [step('work', { dist: d, pace: Z.I, z: 'I' }), jog(repSec * 0.9)]), CD(Z)],
      note: 'Effort soutenu, souffle court. La dernière répétition doit être aussi rapide que la première : si tu ralentis, arrête-toi là.',
    },
  };
}

function reps(ctx) {
  const { Z, weekMin, k } = ctx;
  const d = [200, 200, 300, 400][clamp(Math.floor(k / 2), 0, 3)];
  const repSec = (d / 1000) * Z.R[0];
  const n = clamp(Math.round((clamp(weekMin * 0.05, 4, 10) * 60) / repSec), 6, 12);
  return {
    min: 25 + Math.round((n * repSec * 3) / 60),
    s: {
      type: 'qualite', title: `${n} × ${d} m rapides`,
      steps: [WU(Z), rep(n, [step('work', { dist: d, pace: Z.R, z: 'R' }), jog(repSec * 2)]), CD(Z)],
      note: 'Vite mais relâché, avec une récupération complète : on travaille la vitesse et la foulée, pas l’essoufflement.',
    },
  };
}

function racePace(ctx) {
  const { Z, o, goal, k, phaseLen } = ctx;
  if (!Z.G) return threshold(ctx);
  const f = clamp(k / Math.max(phaseLen - 1, 1), 0, 1);
  if (o.goalDist >= 21097) {
    const total = r5(lerp(goal.gMin[0], goal.gMin[1], f) * 0.6);
    const n = total >= 30 ? 3 : 2;
    const block = r5(total / n);
    return {
      min: 25 + n * block + (n - 1) * 3,
      s: {
        type: 'qualite', title: `${n} × ${block} min à l’allure objectif`,
        steps: [WU(Z), rep(n, [step('work', { dur: block * 60, pace: Z.G, z: 'G', label: 'allure objectif' }), jog(180)]), CD(Z)],
        note: 'Cale-toi sur l’allure du jour J et apprends à la reconnaître sans regarder la montre.',
      },
    };
  }
  const vol = lerp(goal.gVol[0], goal.gVol[1], f) * (ctx.level <= 1 ? 0.75 : 1);
  const d = goal.reps[clamp(k, 0, goal.reps.length - 1)];
  const n = clamp(Math.round(vol / d), 2, 10);
  const repSec = (d / 1000) * Z.G[0];
  return {
    min: 25 + Math.round((n * repSec * 1.8) / 60),
    s: {
      type: 'qualite', title: `${n} × ${d.toLocaleString('fr-FR')} m à l’allure objectif`,
      steps: [WU(Z), rep(n, [step('work', { dist: d, pace: Z.G, z: 'G', label: 'allure objectif' }), jog(d >= 1500 ? 150 : d >= 800 ? 120 : 90)]), CD(Z)],
      note: 'L’allure exacte du jour J : ni plus vite, ni moins vite. C’est elle que le corps doit mémoriser.',
    },
  };
}

function taperSession(ctx) {
  const { Z, o } = ctx;
  const d = o.goalDist >= 10000 ? 2000 : 1000;
  const pace = Z.G || Z.T;
  return {
    min: 25 + Math.round((3 * d * pace[0]) / 60000),
    s: {
      type: 'qualite', title: `3 × ${d.toLocaleString('fr-FR')} m ${Z.G ? 'à l’allure objectif' : 'au seuil'}`,
      steps: [WU(Z), rep(3, [step('work', { dist: d, pace, z: Z.G ? 'G' : 'T' }), jog(150)]), CD(Z)],
      note: 'Affûtage : moins de volume, même allure. Tu dois finir cette séance avec l’envie d’en faire plus.',
    },
  };
}

// Dernière semaine : rien de dur à moins de 3 jours, puis la course.
function finishWithRace(weeks, o, days, off, G, Zg) {
  const goalDate = o.goalDate;
  const startOf = (w) => addDays(o.start, (w.n - 1) * 7);
  const dateOf = (w, s) => addDays(startOf(w), s.day);
  const from = addDays(goalDate, -6);
  for (const w of weeks) w.sessions = w.sessions.filter((s) => dateOf(w, s) < from);
  const place = (date, s) => {
    const wi = Math.floor(daysBetween(o.start, date) / 7);
    const w = weeks[wi];
    if (!w) return;
    w.sessions.push({ day: daysBetween(startOf(w), date), ...s });
    w.light = true;
  };
  const slots = [];
  for (let d = -6; d <= -2; d += 1) {
    const date = addDays(goalDate, d);
    if (days.includes(parseISO(date).getDay())) slots.push(date);
  }
  const E = Zg.E;
  const dd = o.goalDist >= 10000 ? 1000 : 600;
  const plan = [
    { type: 'facile', title: '30 min faciles + 4 × 20 s', steps: [step('run', { dur: 1800, pace: E, z: 'E' }), rep(4, [step('work', { dur: 20, label: 'accélération' }), step('recovery', { dur: 60, label: 'trot' })])] },
    { type: 'qualite', title: `3 × ${dd.toLocaleString('fr-FR')} m à l’allure objectif`, hard: true, steps: [WU(Zg), rep(3, [step('work', { dist: dd, pace: G, z: 'G' }), jog(150)]), CD(Zg)], note: 'Dernier rappel de l’allure. Facile, juste pour la sentir.' },
    { type: 'facile', title: '20 min très faciles + 3 × 20 s', steps: [step('run', { dur: 1200, pace: E, z: 'E' }), rep(3, [step('work', { dur: 20, label: 'accélération' }), step('recovery', { dur: 60, label: 'trot' })])], note: 'Juste pour délier les jambes.' },
  ];
  const chosen = slots.slice(-Math.min(3, Math.max(1, o.perWeek - 1)));
  chosen.forEach((date, i) => {
    let s = plan[i + (3 - chosen.length)];
    if (s.hard && daysBetween(date, goalDate) < 3) s = plan[2];
    const { hard, ...clean } = s;
    place(date, clean);
  });
  place(goalDate, {
    type: 'objectif', title: `Objectif : ${goalLabel(o.goalDist, o.goalTime)}`, repere: o.goalTime || null, testDist: o.goalDist,
    steps: [step('warmup', { dur: o.goalDist >= 21097 ? 600 : 900, pace: E, z: 'E' }), step('work', { dist: o.goalDist, pace: G, z: 'G', label: 'départ prudent, puis régulier' })],
    note: G ? `Pars légèrement plus lentement que ${clock(G[0])}/km le premier kilomètre, puis tiens l’allure. Le dernier quart se court au mental.` : 'Pars doucement : le but est de finir en forme.',
  });
  weeks.forEach((w) => w.sessions.sort((a, b) => a.day - b.day));
  // Semaines vides (objectif tôt dans la semaine) : supprimées
  for (let i = weeks.length - 1; i >= 0 && !weeks[i].sessions.length; i -= 1) weeks.pop();
}

/* =========================================================================
   Programme adaptatif : nouvelles allures après un test
   ========================================================================= */

// Recalcule les allures des séances à venir (après `fromDate`) à partir d'un nouveau VDOT.
export function repace(plan, newVdot, fromDate) {
  const c = plan.coach;
  if (!c) return null;
  const old = c.vdot;
  c.vdot = newVdot;
  c.vdotGoal = Math.max(c.vdotGoal, newVdot);
  const total = plan.weeks.length;
  plan.weeks.forEach((w, wi) => {
    const wStart = addDays(plan.start, (w.n - 1) * 7);
    w.sessions.forEach((s) => {
      if (addDays(wStart, s.day) <= fromDate) return;
      const f = clamp(wi / Math.max(total - 1, 1), 0, 1);
      const Z = zones(lerp(newVdot, c.vdotGoal, f));
      Z.E = zones(lerp(newVdot, c.vdotGoal, f * 0.5)).E;
      const walk = (steps) => steps.forEach((st) => {
        if (st.k === 'repeat') walk(st.steps);
        else if (st.z && st.z !== 'G' && Z[st.z]) st.pace = Z[st.z];
      });
      walk(s.steps);
      if (s.type === 'test' && s.testDist) s.repere = r5(raceTime(lerp(newVdot, c.vdotGoal, f), s.testDist));
    });
  });
  plan.easyPace = zones(newVdot).E;
  return { old, now: newVdot };
}
